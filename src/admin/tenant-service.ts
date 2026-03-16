import { createHash, randomBytes } from 'crypto';
import postgres from 'postgres';
import { db } from '../db/client.js';
import { sql } from '../db/client.js';
import { tenants, apiKeys } from '../db/schema.js';

// ─────────────────────────────────────────────────────────────────
// Key generation
// ─────────────────────────────────────────────────────────────────

/**
 * Generate a new API key.
 * Returns { raw, hash } — the raw key is shown to the admin once and NEVER stored.
 * Format: pb_ + 64 hex chars (32 random bytes as hex) = 67 chars total.
 */
export function generateApiKey(): { raw: string; hash: string } {
  const raw = 'pb_' + randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantListItem extends TenantRow {
  keyCount: number;
}

export interface ApiKeyRow {
  id: string;
  tenantId: string;
  label: string | null;
  status: string;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateTenantResult {
  tenant: TenantRow;
  rawApiKey: string;
}

export interface CreateApiKeyResult {
  apiKey: ApiKeyRow;
  rawKey: string;
}

// ─────────────────────────────────────────────────────────────────
// Tenant operations
// ─────────────────────────────────────────────────────────────────

/**
 * Create a new tenant and its initial API key atomically.
 * The transaction ensures either both rows exist or neither does.
 * Returns the raw API key — it is shown once and cannot be recovered.
 *
 * Throws with code 'DUPLICATE_SLUG' if slug already exists.
 */
export async function createTenant(
  name: string,
  slug: string,
  plan: string
): Promise<CreateTenantResult> {
  const { raw, hash } = generateApiKey();

  // Use postgres.js directly for the transaction (withTenantContext is for tenant-scoped reads;
  // tenant creation is an admin operation that runs without RLS context).
  const [tenantRow] = await sql.begin(async (tx) => {
    // Cast tx to postgres.Sql to access the tagged-template call signature.
    // TransactionSql extends Omit<Sql, 'begin' | ...> so it retains the template tag,
    // but TypeScript strict mode may not infer it as callable — the cast is safe.
    const txSql = tx as unknown as postgres.Sql;
    // Insert tenant
    const inserted = await txSql<TenantRow[]>`
      INSERT INTO tenants (name, slug, plan)
      VALUES (${name}, ${slug}, ${plan})
      RETURNING id, name, slug, plan, status, created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    const tenant = inserted[0];

    // Insert initial API key for the tenant
    await txSql`
      INSERT INTO api_keys (tenant_id, key_hash, label)
      VALUES (${tenant.id}, ${hash}, 'default')
    `;

    return inserted;
  }).catch((err: Error & { code?: string }) => {
    if (err.code === '23505') {
      // PostgreSQL unique_violation — slug already exists
      const slugError = new Error(`Tenant with slug '${slug}' already exists`) as Error & { code: string };
      slugError.code = 'DUPLICATE_SLUG';
      throw slugError;
    }
    throw err;
  });

  return { tenant: tenantRow, rawApiKey: raw };
}

/**
 * List all tenants with their active key counts.
 * Admin-only — no RLS context needed (tenants table has no RLS).
 */
export async function listTenants(): Promise<TenantListItem[]> {
  const rows = await sql<(TenantRow & { keyCount: string })[]>`
    SELECT
      t.id, t.name, t.slug, t.plan, t.status,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      COUNT(k.id) FILTER (WHERE k.status = 'active') AS "keyCount"
    FROM tenants t
    LEFT JOIN api_keys k ON k.tenant_id = t.id
    GROUP BY t.id
    ORDER BY t.created_at DESC
  `;

  return rows.map((r) => ({
    ...r,
    keyCount: Number(r.keyCount),
  }));
}

/**
 * Get a single tenant with its API key metadata.
 * Returns null if tenant does not exist.
 * NOTE: Returns key metadata only — NEVER key_hash or raw key.
 */
export async function getTenant(
  id: string
): Promise<(TenantRow & { apiKeys: ApiKeyRow[] }) | null> {
  const tenantRows = await sql<TenantRow[]>`
    SELECT id, name, slug, plan, status,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM tenants
    WHERE id = ${id}
  `;

  if (tenantRows.length === 0) return null;

  // api_keys has RLS — use SET LOCAL inside a transaction to set tenant context
  // before querying api_keys. This mirrors the withTenantContext pattern from client.ts.
  const keyRowsAdmin = await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    await txSql`SELECT set_config('app.current_tenant_id', ${id}, true)`;
    return txSql<ApiKeyRow[]>`
      SELECT id, tenant_id AS "tenantId", label, status,
             created_at AS "createdAt", revoked_at AS "revokedAt"
      FROM api_keys
      WHERE tenant_id = ${id}
      ORDER BY created_at DESC
    `;
  });

  return { ...tenantRows[0], apiKeys: keyRowsAdmin };
}

// ─────────────────────────────────────────────────────────────────
// API key operations
// ─────────────────────────────────────────────────────────────────

/**
 * Issue a new API key for an existing tenant.
 * Returns the raw key once — it cannot be recovered later.
 */
export async function createApiKey(
  tenantId: string,
  label?: string
): Promise<CreateApiKeyResult> {
  const { raw, hash } = generateApiKey();

  const [keyRow] = await sql<ApiKeyRow[]>`
    INSERT INTO api_keys (tenant_id, key_hash, label)
    VALUES (${tenantId}, ${hash}, ${label ?? null})
    RETURNING id, tenant_id AS "tenantId", label, status,
              created_at AS "createdAt", revoked_at AS "revokedAt"
  `;

  return { apiKey: keyRow, rawKey: raw };
}

/**
 * Revoke an API key. Sets status='revoked' and revoked_at=now().
 * Returns false if the key does not exist for this tenant or is already revoked.
 * The revocation takes effect immediately — the next MCP request with this key returns 401.
 */
export async function revokeApiKey(tenantId: string, keyId: string): Promise<boolean> {
  // Use SET LOCAL to satisfy RLS policy on api_keys (tenant must match)
  const result = await sql.begin(async (tx) => {
    const txSql = tx as unknown as postgres.Sql;
    await txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return txSql<{ id: string }[]>`
      UPDATE api_keys
      SET status = 'revoked', revoked_at = now()
      WHERE id = ${keyId}
        AND tenant_id = ${tenantId}
        AND status = 'active'
      RETURNING id
    `;
  });

  return result.length > 0;
}

/**
 * Look up an API key by its SHA-256 hash.
 * Used by MCP auth middleware on every incoming request.
 * Returns null if the key does not exist OR if it is revoked.
 *
 * IMPORTANT: This query must run WITHOUT tenant context (no SET LOCAL) because
 * we don't know the tenant_id yet — that's what we're resolving.
 *
 * The api_keys table has RLS; queries without a tenant context return zero rows.
 * To bypass RLS for auth lookup, this function uses DATABASE_MIGRATION_URL
 * (superuser, no RLS) to resolve the key to a tenant_id.
 * This pool is used ONLY for this read-only lookup — never for tenant data ops.
 */
export async function lookupApiKeyByHash(
  hash: string
): Promise<{ tenantId: string; keyId: string; status: string } | null> {
  // Auth lookups use DATABASE_MIGRATION_URL (superuser, no RLS) for key resolution.
  // This pool is used ONLY for this read-only lookup — not for any tenant data operations.
  if (!process.env.DATABASE_MIGRATION_URL) {
    process.stderr.write('[tenant-service] ERROR: DATABASE_MIGRATION_URL required for API key auth lookups\n');
    return null;
  }

  const authSql = postgres(process.env.DATABASE_MIGRATION_URL, { max: 2 });

  try {
    const rows = await authSql<{ keyId: string; tenantId: string; status: string }[]>`
      SELECT id AS "keyId", tenant_id AS "tenantId", status
      FROM api_keys
      WHERE key_hash = ${hash}
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    if (row.status === 'revoked') return null;

    return { tenantId: row.tenantId, keyId: row.keyId, status: row.status };
  } finally {
    await authSql.end();
  }
}

// Suppress unused import warning — db is exported for use by Wave 3 (admin router)
export { db };
