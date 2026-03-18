import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { recordToolCall, queryAuditLog } from '../../src/admin/audit-service.js';
import { createApiKey } from '../../src/admin/tenant-service.js';

// ---------------------------------------------------------------------------
// Setup: create test tenant + API key via superuser SQL
// ---------------------------------------------------------------------------

const migrationUrl = process.env.DATABASE_MIGRATION_URL!;
let adminSql: ReturnType<typeof postgres>;
let tenantId: string;
let keyId: string;

beforeAll(async () => {
  adminSql = postgres(migrationUrl);

  // Create test tenant
  const rows = await adminSql<{ id: string }[]>`
    INSERT INTO tenants (name, slug, plan)
    VALUES ('Audit Test Corp', ${`audit-test-${Date.now()}`}, 'standard')
    RETURNING id
  `;
  tenantId = rows[0].id;

  // Create API key for audit entries (uses RLS-aware tenant service)
  const { apiKey } = await createApiKey(tenantId, 'audit-test-key');
  keyId = apiKey.id;
});

afterAll(async () => {
  // CASCADE deletes api_keys, audit_log
  if (tenantId) {
    await adminSql`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  await adminSql.end();
});

// ---------------------------------------------------------------------------
// TAC-04: recordToolCall
// ---------------------------------------------------------------------------

describe('recordToolCall (TAC-04)', () => {
  it('creates an audit log entry', async () => {
    await recordToolCall(
      tenantId,
      keyId,
      'list_products',
      { category: 'electronics' },
      'success',
      undefined,
      42
    );

    // Verify entry exists in DB
    const rows = await adminSql<{ tool_name: string; status: string; duration_ms: number }[]>`
      SELECT tool_name, status, duration_ms
      FROM audit_log
      WHERE tenant_id = ${tenantId} AND tool_name = 'list_products'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].tool_name).toBe('list_products');
    expect(rows[0].status).toBe('success');
    expect(rows[0].duration_ms).toBe(42);
  });

  it('records error entries', async () => {
    await recordToolCall(
      tenantId,
      keyId,
      'get_product',
      { sku: 'MISSING' },
      'error',
      'Product not found',
      15
    );

    const rows = await adminSql<{ tool_name: string; status: string; error_message: string }[]>`
      SELECT tool_name, status, error_message
      FROM audit_log
      WHERE tenant_id = ${tenantId} AND tool_name = 'get_product' AND status = 'error'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].error_message).toBe('Product not found');
  });

  it('does not throw on invalid tenantId (fire-and-forget safety)', async () => {
    // Should not throw — errors are caught and logged to stderr
    await expect(
      recordToolCall(
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000000',
        'list_products',
        {},
        'success'
      )
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TAC-05: queryAuditLog
// ---------------------------------------------------------------------------

describe('queryAuditLog (TAC-05)', () => {
  // Seed additional entries for filter/pagination tests
  beforeAll(async () => {
    await recordToolCall(tenantId, keyId, 'search_kb', { query: 'shipping' }, 'success', undefined, 30);
    await recordToolCall(tenantId, keyId, 'search_kb', { query: 'returns' }, 'error', 'KB unavailable', 5);
    await recordToolCall(tenantId, keyId, 'list_orders', { status: 'pending' }, 'success', undefined, 100);
    await recordToolCall(tenantId, keyId, 'list_orders', { status: 'shipped' }, 'success', undefined, 80);
  });

  it('filters by toolName', async () => {
    const result = await queryAuditLog(tenantId, { toolName: 'search_kb' });

    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    expect(result.totalCount).toBeGreaterThanOrEqual(2);

    // All returned entries should be for search_kb
    for (const entry of result.entries) {
      expect(entry.toolName).toBe('search_kb');
    }
  });

  it('filters by status', async () => {
    const result = await queryAuditLog(tenantId, { status: 'error' });

    expect(result.entries.length).toBeGreaterThanOrEqual(1);

    for (const entry of result.entries) {
      expect(entry.status).toBe('error');
    }
  });

  it('filters by both toolName and status', async () => {
    const result = await queryAuditLog(tenantId, {
      toolName: 'search_kb',
      status: 'error',
    });

    expect(result.entries.length).toBeGreaterThanOrEqual(1);

    for (const entry of result.entries) {
      expect(entry.toolName).toBe('search_kb');
      expect(entry.status).toBe('error');
    }
  });

  it('supports pagination', async () => {
    // Get all entries first
    const all = await queryAuditLog(tenantId, { limit: 100 });
    const total = all.totalCount;

    // Now paginate: limit 2, offset 0
    const page1 = await queryAuditLog(tenantId, { limit: 2, offset: 0 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.totalCount).toBe(total);

    // Page 2
    const page2 = await queryAuditLog(tenantId, { limit: 2, offset: 2 });
    expect(page2.totalCount).toBe(total);

    // Ensure pages don't overlap (different entry IDs)
    const page1Ids = new Set(page1.entries.map((e) => e.id));
    for (const entry of page2.entries) {
      expect(page1Ids.has(entry.id)).toBe(false);
    }
  });
});
