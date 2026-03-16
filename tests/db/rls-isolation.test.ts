import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

// These tests require: migrations applied, app_login role exists, DATABASE_URL + DATABASE_MIGRATION_URL set.
// Seed using DATABASE_MIGRATION_URL (superuser — bypasses RLS).
// Assert using DATABASE_URL (app_login — RLS enforced).

// Fixed UUIDs for deterministic, reproducible tests
const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

// Seed product IDs
const PRODUCT_A_ID = 'aaaa0001-0000-0000-0000-000000000000';
const PRODUCT_B_ID = 'bbbb0001-0000-0000-0000-000000000000';
const ORDER_A_ID   = 'aaaa0002-0000-0000-0000-000000000000';
const CONTACT_A_ID = 'aaaa0003-0000-0000-0000-000000000000';

let migrationSql: ReturnType<typeof postgres>;
let appSql: ReturnType<typeof postgres>;

beforeAll(async () => {
  migrationSql = postgres(process.env.DATABASE_MIGRATION_URL!);
  appSql = postgres(process.env.DATABASE_URL!);

  // Clean up any leftover rows from a previous aborted run
  await migrationSql`DELETE FROM products WHERE id IN (${PRODUCT_A_ID}::uuid, ${PRODUCT_B_ID}::uuid)`;
  await migrationSql`DELETE FROM orders WHERE id = ${ORDER_A_ID}::uuid`;
  await migrationSql`DELETE FROM contacts WHERE id = ${CONTACT_A_ID}::uuid`;
  await migrationSql`DELETE FROM tenants WHERE id IN (${TENANT_A_ID}::uuid, ${TENANT_B_ID}::uuid)`;

  // Seed tenants
  await migrationSql`
    INSERT INTO tenants (id, name, slug)
    VALUES
      (${TENANT_A_ID}::uuid, 'Test Tenant A', 'test-tenant-a'),
      (${TENANT_B_ID}::uuid, 'Test Tenant B', 'test-tenant-b')
    ON CONFLICT (id) DO NOTHING
  `;

  // Seed products (one per tenant)
  await migrationSql`
    INSERT INTO products (id, tenant_id, sku, name, price)
    VALUES
      (${PRODUCT_A_ID}::uuid, ${TENANT_A_ID}::uuid, 'SKU-A', 'Product A', 10.00),
      (${PRODUCT_B_ID}::uuid, ${TENANT_B_ID}::uuid, 'SKU-B', 'Product B', 20.00)
    ON CONFLICT (id) DO NOTHING
  `;

  // Seed contact for Tenant A (needed for orders test)
  await migrationSql`
    INSERT INTO contacts (id, tenant_id, name)
    VALUES (${CONTACT_A_ID}::uuid, ${TENANT_A_ID}::uuid, 'Contact A')
    ON CONFLICT (id) DO NOTHING
  `;

  // Seed order for Tenant A (needed for no-context orders test)
  await migrationSql`
    INSERT INTO orders (id, tenant_id, contact_id)
    VALUES (${ORDER_A_ID}::uuid, ${TENANT_A_ID}::uuid, ${CONTACT_A_ID}::uuid)
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  // Clean up seeded rows in FK dependency order
  await migrationSql`DELETE FROM orders WHERE id = ${ORDER_A_ID}::uuid`;
  await migrationSql`DELETE FROM contacts WHERE id = ${CONTACT_A_ID}::uuid`;
  await migrationSql`DELETE FROM products WHERE id IN (${PRODUCT_A_ID}::uuid, ${PRODUCT_B_ID}::uuid)`;
  await migrationSql`DELETE FROM tenants WHERE id IN (${TENANT_A_ID}::uuid, ${TENANT_B_ID}::uuid)`;

  await migrationSql.end();
  await appSql.end();
});

describe('RLS cross-tenant isolation (INFRA-03)', () => {
  it('Tenant A context returns only Tenant A products (SKU-A present, SKU-B absent)', async () => {
    const rows = (await appSql.begin(async (tx) => {
      const txSql = tx as unknown as postgres.Sql;
      await txSql`SELECT set_config('app.current_tenant_id', ${TENANT_A_ID}, true)`;
      return txSql`SELECT sku FROM products ORDER BY sku`;
    })) as { sku: string }[];

    const skus = rows.map((r) => r.sku);
    expect(skus).toContain('SKU-A');
    expect(skus).not.toContain('SKU-B');
  });

  it('Tenant B context returns only Tenant B products (SKU-B present, SKU-A absent)', async () => {
    const rows = (await appSql.begin(async (tx) => {
      const txSql = tx as unknown as postgres.Sql;
      await txSql`SELECT set_config('app.current_tenant_id', ${TENANT_B_ID}, true)`;
      return txSql`SELECT sku FROM products ORDER BY sku`;
    })) as { sku: string }[];

    const skus = rows.map((r) => r.sku);
    expect(skus).toContain('SKU-B');
    expect(skus).not.toContain('SKU-A');
  });

  it('Tenant A context + explicit WHERE tenant_id = Tenant B returns zero rows (RLS + WHERE combine)', async () => {
    const rows = await appSql.begin(async (tx) => {
      const txSql = tx as unknown as postgres.Sql;
      await txSql`SELECT set_config('app.current_tenant_id', ${TENANT_A_ID}, true)`;
      return txSql`SELECT sku FROM products WHERE tenant_id = ${TENANT_B_ID}::uuid`;
    });

    expect(rows).toHaveLength(0);
  });

  it('No context set returns zero rows from products (not an error)', async () => {
    // No set_config call — current_setting returns NULL, policy evaluates to false
    const rows = await appSql`SELECT sku FROM products WHERE TRUE`;
    expect(rows).toHaveLength(0);
  });

  it('No context set returns zero rows from orders', async () => {
    const rows = await appSql`SELECT id FROM orders WHERE TRUE`;
    expect(rows).toHaveLength(0);
  });

  it('No context set returns zero rows from contacts', async () => {
    const rows = await appSql`SELECT id FROM contacts WHERE TRUE`;
    expect(rows).toHaveLength(0);
  });
});
