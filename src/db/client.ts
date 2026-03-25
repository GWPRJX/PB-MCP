import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

// Application database client.
// Uses DATABASE_URL which connects as app_login (non-superuser, RLS enforced).
// Never use DATABASE_MIGRATION_URL here — that URL has DDL privileges.
if (!process.env.DATABASE_URL) {
  // Logger may not be initialized yet at module load time — use stderr directly for this one guard
  console.error('[db] ERROR: DATABASE_URL environment variable is not set');
  process.exit(1);
}

export const sql = postgres(process.env.DATABASE_URL, {
  // postgres.js built-in pool — adequate for v1 (<50 tenants)
  // PgBouncer is a Phase 2 scaling step when needed
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // All postgres.js log output must go to stderr (INFRA-06)
  onnotice: (notice) => console.error(`[db] NOTICE: ${notice.message}`),
});

/**
 * Run a database operation inside a transaction scoped to the given tenant.
 *
 * Uses `set_config('app.current_tenant_id', tenantId, true)` (SET LOCAL) so the
 * tenant ID is automatically cleared on commit or rollback, preventing connection
 * pool contamination between requests.
 *
 * @param tenantId - The tenant UUID to set as the current RLS context.
 * @param fn - Async callback that receives the transaction SQL handle.
 * @returns The value returned by `fn`.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>
): Promise<T> {
  // Cast tx to Sql to access the tagged-template call signature that Omit<> can drop.
  // TransactionSql extends Omit<Sql, 'begin' | ...> so it retains the template tag,
  // but TypeScript strict mode may not infer it as callable — the cast is safe.
  const result = await sql.begin((tx) => {
    const txSql = tx as unknown as postgres.Sql;
    // Third argument 'true' = LOCAL (transaction-scoped), equivalent to SET LOCAL
    return txSql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`.then(() =>
      fn(tx)
    );
  });
  return result as T;
}

// Type-safe query builder wrapping the existing postgres.js pool.
// Use db for SELECT/INSERT/UPDATE queries; use sql directly for raw SQL or set_config calls.
export const db = drizzle(sql, { schema });

// Singleton superuser pool for admin/auth operations that must bypass RLS.
// Uses DATABASE_MIGRATION_URL — never use this pool for tenant data operations.
export const authSql = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 5, idle_timeout: 30 });
