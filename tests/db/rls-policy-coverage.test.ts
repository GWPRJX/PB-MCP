import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';

// These tests require: migrations applied, DATABASE_MIGRATION_URL set (superuser access for pg_class).
// Connect as migration user because pg_class queries need no special RLS context.

const TENANT_BEARING_TABLES = [
  'products',
  'stock_levels',
  'suppliers',
  'orders',
  'order_line_items',
  'invoices',
  'contacts',
  'api_keys',
  'tool_permissions',
  'audit_log',
] as const;

let sql: ReturnType<typeof postgres>;

// Use migrationUrl for pg_class / information_schema queries (no RLS context needed)
const migrationUrl = process.env.DATABASE_MIGRATION_URL!;

afterAll(async () => {
  if (sql) await sql.end();
});

describe('RLS policy coverage (INFRA-04)', () => {
  it('all 10 tenant-bearing tables have relrowsecurity=true AND relforcerowsecurity=true', async () => {
    sql = postgres(migrationUrl);

    const violations = await sql<{ tablename: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT
        c.relname AS tablename,
        c.relrowsecurity,
        c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE
        n.nspname = 'public'
        AND c.relname = ANY(${TENANT_BEARING_TABLES as unknown as string[]})
        AND (c.relrowsecurity = false OR c.relforcerowsecurity = false)
    `;

    expect(
      violations,
      `Tables missing ENABLE or FORCE RLS: ${violations.map((v) => v.tablename).join(', ')}`
    ).toHaveLength(0);
  });

  it('all 10 tenant-bearing tables have at least one policy in pg_policies', async () => {
    sql = sql ?? postgres(migrationUrl);

    // Find tables in the list that have zero policies
    const withPolicies = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = ANY(${TENANT_BEARING_TABLES as unknown as string[]})
      GROUP BY tablename
    `;

    const tablesWithPolicies = new Set(withPolicies.map((r) => r.tablename));
    const missing = TENANT_BEARING_TABLES.filter((t) => !tablesWithPolicies.has(t));

    expect(
      missing,
      `Tables with no policies: ${missing.join(', ')}`
    ).toHaveLength(0);
  });

  it('kb_articles table has NO tenant_id column (global cache — locked decision)', async () => {
    sql = sql ?? postgres(migrationUrl);

    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'kb_articles'
        AND column_name = 'tenant_id'
    `;

    expect(
      rows,
      'kb_articles must not have a tenant_id column — it is a global cache'
    ).toHaveLength(0);
  });
});
