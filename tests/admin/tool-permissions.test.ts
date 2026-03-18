import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import {
  getToolPermissions,
  getEnabledTools,
  updateToolPermissions,
  updateKeyAllowedTools,
  ALL_TOOLS,
} from '../../src/admin/tool-permissions-service.js';
import { createApiKey } from '../../src/admin/tenant-service.js';

// ---------------------------------------------------------------------------
// Setup: create a test tenant via direct SQL (superuser, bypasses RLS)
// ---------------------------------------------------------------------------

const migrationUrl = process.env.DATABASE_MIGRATION_URL!;
let adminSql: ReturnType<typeof postgres>;
let tenantId: string;
let apiKeyId: string;

beforeAll(async () => {
  adminSql = postgres(migrationUrl);

  // Create test tenant directly via superuser SQL
  const rows = await adminSql<{ id: string }[]>`
    INSERT INTO tenants (name, slug, plan)
    VALUES ('TAC Test Corp', ${`tac-test-${Date.now()}`}, 'standard')
    RETURNING id
  `;
  tenantId = rows[0].id;

  // Create an API key for per-key tool scoping tests
  const { apiKey } = await createApiKey(tenantId, 'tac-test-key');
  apiKeyId = apiKey.id;
});

afterAll(async () => {
  // CASCADE deletes api_keys, tool_permissions
  if (tenantId) {
    await adminSql`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  await adminSql.end();
});

// ---------------------------------------------------------------------------
// TAC-01: getToolPermissions
// ---------------------------------------------------------------------------

describe('getToolPermissions (TAC-01)', () => {
  it('returns all 27 tools defaulting to enabled', async () => {
    const perms = await getToolPermissions(tenantId);

    expect(perms).toHaveLength(ALL_TOOLS.length);
    expect(perms).toHaveLength(27);

    // Every tool should default to enabled when no overrides exist
    for (const perm of perms) {
      expect(perm.enabled).toBe(true);
    }

    // Verify all known tool names are present
    const names = perms.map((p) => p.toolName);
    for (const tool of ALL_TOOLS) {
      expect(names).toContain(tool);
    }
  });
});

// ---------------------------------------------------------------------------
// TAC-02: updateToolPermissions
// ---------------------------------------------------------------------------

describe('updateToolPermissions (TAC-02)', () => {
  it('disables specific tools', async () => {
    const result = await updateToolPermissions(tenantId, [
      { toolName: 'list_products', enabled: false },
      { toolName: 'get_product', enabled: false },
    ]);

    expect(result).toHaveLength(21);

    const listProducts = result.find((p) => p.toolName === 'list_products');
    const getProduct = result.find((p) => p.toolName === 'get_product');

    expect(listProducts?.enabled).toBe(false);
    expect(getProduct?.enabled).toBe(false);

    // Other tools remain enabled
    const searchKb = result.find((p) => p.toolName === 'search_kb');
    expect(searchKb?.enabled).toBe(true);
  });

  it('re-enables a disabled tool', async () => {
    // list_products was disabled in the previous test
    const result = await updateToolPermissions(tenantId, [
      { toolName: 'list_products', enabled: true },
    ]);

    const listProducts = result.find((p) => p.toolName === 'list_products');
    expect(listProducts?.enabled).toBe(true);

    // get_product should still be disabled (we only re-enabled list_products)
    const getProduct = result.find((p) => p.toolName === 'get_product');
    expect(getProduct?.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TAC-03: getEnabledTools
// ---------------------------------------------------------------------------

describe('getEnabledTools (TAC-03)', () => {
  it('returns only enabled tools', async () => {
    // get_product is still disabled from earlier tests
    const enabled = await getEnabledTools(tenantId, null);

    expect(enabled).not.toContain('get_product');
    expect(enabled).toContain('list_products'); // re-enabled above
    expect(enabled).toContain('search_kb');

    // Should have 20 tools (21 - 1 disabled)
    expect(enabled).toHaveLength(20);
  });

  it('with key allowedTools returns intersection', async () => {
    // Key allows only 3 tools; tenant has 20 enabled (get_product disabled)
    const keyAllowed = ['list_products', 'search_kb', 'list_orders'];
    const enabled = await getEnabledTools(tenantId, keyAllowed);

    // All 3 key-allowed tools are tenant-enabled, so intersection = 3
    expect(enabled).toHaveLength(3);
    expect(enabled).toContain('list_products');
    expect(enabled).toContain('search_kb');
    expect(enabled).toContain('list_orders');
  });

  it('with key allowedTools AND tenant disabled returns intersection', async () => {
    // Key allows get_product, but tenant has it disabled
    const keyAllowed = ['get_product', 'search_kb'];
    const enabled = await getEnabledTools(tenantId, keyAllowed);

    // get_product is tenant-disabled, so intersection excludes it
    expect(enabled).toHaveLength(1);
    expect(enabled).toContain('search_kb');
    expect(enabled).not.toContain('get_product');
  });
});

// ---------------------------------------------------------------------------
// TAC-03 (cont.): updateKeyAllowedTools
// ---------------------------------------------------------------------------

describe('updateKeyAllowedTools (TAC-03)', () => {
  it('sets per-key restrictions', async () => {
    const result = await updateKeyAllowedTools(tenantId, apiKeyId, [
      'list_products',
      'search_kb',
    ]);
    expect(result).toBe(true);

    // Verify by reading the key's allowed_tools from DB
    const rows = await adminSql<{ allowed_tools: string[] | null }[]>`
      SELECT allowed_tools FROM api_keys WHERE id = ${apiKeyId}
    `;
    expect(rows[0].allowed_tools).toEqual(
      expect.arrayContaining(['list_products', 'search_kb'])
    );
    expect(rows[0].allowed_tools).toHaveLength(2);
  });

  it('with null clears restrictions', async () => {
    const result = await updateKeyAllowedTools(tenantId, apiKeyId, null);
    expect(result).toBe(true);

    // Verify allowed_tools is NULL
    const rows = await adminSql<{ allowed_tools: string[] | null }[]>`
      SELECT allowed_tools FROM api_keys WHERE id = ${apiKeyId}
    `;
    expect(rows[0].allowed_tools).toBeNull();
  });

  it('returns false for non-existent key', async () => {
    const result = await updateKeyAllowedTools(
      tenantId,
      '00000000-0000-0000-0000-000000000000',
      ['search_kb']
    );
    expect(result).toBe(false);
  });
});
