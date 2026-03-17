import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import { registerInventoryTools } from '../../src/tools/inventory.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `inv-test-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let apiKey: string;

// Superuser connection for seeding (bypasses RLS)
const seedSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');

// Seeded IDs for test assertions
let productId: string;
let lowStockProductId: string;
let stockLevelId: string;
let supplierId: string;

// ---------------------------------------------------------------------------
// Test helper: call a tool via POST /mcp JSON-RPC
// ---------------------------------------------------------------------------
async function callTool(toolName: string, args: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    },
    payload: {
      jsonrpc: '2.0',
      method: 'tools/call',
      id: 1,
      params: { name: toolName, arguments: args },
    },
  });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  const text = body.result?.content?.[0]?.text ?? '{}';
  return {
    result: body.result,
    data: JSON.parse(text),
    isError: body.result?.isError === true,
  };
}

// ---------------------------------------------------------------------------
// Setup: build server with inventory tools, create tenant, seed data
// ---------------------------------------------------------------------------
beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // Build Fastify server with MCP routes + inventory tools registered
  // Stateless pattern: create a fresh McpServer + transport per request (SDK requirement).
  // enableJsonResponse: true ensures plain JSON responses instead of SSE for app.inject().
  app = await buildServer();

  app.post('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      // createMcpServer() already registers all 18 tools (Wave 4 wiring).
      // Do NOT call registerInventoryTools again — that would double-register the 7 INV tools.
      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      reply.hijack();
    });
  });
  await app.ready();

  // Create test tenant via admin API
  const createRes = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { name: 'Inventory Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(createRes.statusCode).toBe(201);
  const tenantBody = JSON.parse(createRes.body);
  tenantId = tenantBody.tenantId;
  apiKey = tenantBody.apiKey;

  // Seed test data using superuser connection (bypasses RLS)
  // Seed a supplier
  const [supplier] = await seedSql`
    INSERT INTO suppliers (tenant_id, name, email, phone, address, notes)
    VALUES (${tenantId}, 'ACME Supplies', 'orders@acme.example', '555-0100', '1 Supply Ave', 'Test supplier')
    RETURNING id
  `;
  supplierId = supplier.id;

  // Seed a normal product (well-stocked)
  const [product] = await seedSql`
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category, is_active, reorder_point)
    VALUES (${tenantId}, 'SKU-001', 'Widget A', 'A great widget', '9.99', 'USD', 'widgets', true, 5)
    RETURNING id
  `;
  productId = product.id;

  // Seed stock level for Widget A (well above reorder point)
  const [sl] = await seedSql`
    INSERT INTO stock_levels (tenant_id, product_id, quantity_on_hand, warehouse_location)
    VALUES (${tenantId}, ${productId}, 50, 'Shelf A1')
    RETURNING id
  `;
  stockLevelId = sl.id;

  // Seed a low-stock product (quantity below reorder_point)
  const [lowProduct] = await seedSql`
    INSERT INTO products (tenant_id, sku, name, description, price, currency, category, is_active, reorder_point)
    VALUES (${tenantId}, 'SKU-002', 'Widget B', 'A low-stock widget', '4.99', 'USD', 'widgets', true, 20)
    RETURNING id
  `;
  lowStockProductId = lowProduct.id;

  // Stock level for Widget B — quantity 3, reorder_point 20 → below threshold
  await seedSql`
    INSERT INTO stock_levels (tenant_id, product_id, quantity_on_hand, warehouse_location)
    VALUES (${tenantId}, ${lowStockProductId}, 3, 'Shelf B2')
  `;
});

// ---------------------------------------------------------------------------
// Teardown: delete tenant (cascades to all ERP data via tenant_id FKs)
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (tenantId) {
    await seedSql`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  await seedSql.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// INV-01: list_products
// ---------------------------------------------------------------------------
describe('list_products tool (INV-01)', () => {
  it('returns paginated product list with qty_on_hand from stock_levels JOIN', async () => {
    const { data, isError } = await callTool('list_products');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(2);
    // Each item must include qty_on_hand
    const widget = data.items.find((p: { sku: string }) => p.sku === 'SKU-001');
    expect(widget).toBeDefined();
    expect(widget.qty_on_hand).toBe(50);
  });

  it('respects limit and offset pagination parameters', async () => {
    const { data } = await callTool('list_products', { limit: 1, offset: 0 });
    expect(data.items).toHaveLength(1);
    expect(data.total_count).toBeGreaterThanOrEqual(2);
    // With 2+ items and limit=1, next_cursor must be non-null
    expect(data.next_cursor).not.toBeNull();
  });

  it('returns next_cursor: null when all results fit on one page', async () => {
    const { data } = await callTool('list_products', { limit: 200, offset: 0 });
    expect(data.next_cursor).toBeNull();
  });

  it('enforces RLS — only returns products belonging to authenticated tenant', async () => {
    // Verify by checking no unexpected products appear (any items returned belong to our tenant)
    const { data } = await callTool('list_products');
    for (const item of data.items) {
      // All returned products must have IDs we seeded for this tenant
      expect([productId, lowStockProductId]).toContain(item.id);
    }
  });
});

// ---------------------------------------------------------------------------
// INV-02: get_product
// ---------------------------------------------------------------------------
describe('get_product tool (INV-02)', () => {
  it('returns full product detail by ID', async () => {
    const { data, isError } = await callTool('get_product', { id: productId });
    expect(isError).toBe(false);
    expect(data.id).toBe(productId);
    expect(data.sku).toBe('SKU-001');
    expect(data.name).toBe('Widget A');
    expect(data.qty_on_hand).toBe(50);
  });

  it('returns isError NOT_FOUND for unknown product ID', async () => {
    const { data, isError } = await callTool('get_product', { id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// INV-03: list_stock_levels
// ---------------------------------------------------------------------------
describe('list_stock_levels tool (INV-03)', () => {
  it('returns paginated stock_levels rows with product info', async () => {
    const { data, isError } = await callTool('list_stock_levels');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(2);
    const sl = data.items.find((s: { id: string }) => s.id === stockLevelId);
    expect(sl).toBeDefined();
    expect(sl.quantity_on_hand).toBe(50);
    expect(sl.product_sku).toBe('SKU-001');
  });

  it('returns total_count and correct next_cursor', async () => {
    const { data } = await callTool('list_stock_levels', { limit: 1, offset: 0 });
    expect(data.items).toHaveLength(1);
    expect(data.next_cursor).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// INV-04: get_stock_level
// ---------------------------------------------------------------------------
describe('get_stock_level tool (INV-04)', () => {
  it('returns stock level detail by stock_level ID', async () => {
    const { data, isError } = await callTool('get_stock_level', { id: stockLevelId });
    expect(isError).toBe(false);
    expect(data.id).toBe(stockLevelId);
    expect(data.quantity_on_hand).toBe(50);
    expect(data.warehouse_location).toBe('Shelf A1');
  });

  it('returns isError NOT_FOUND for unknown stock_level ID', async () => {
    const { data, isError } = await callTool('get_stock_level', { id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// INV-05: list_low_stock
// ---------------------------------------------------------------------------
describe('list_low_stock tool (INV-05)', () => {
  it('returns only products where quantity_on_hand < reorder_point', async () => {
    const { data, isError } = await callTool('list_low_stock');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    // Widget B (qty=3, reorder=20) must appear
    const lowWidget = data.items.find((p: { id: string }) => p.id === lowStockProductId);
    expect(lowWidget).toBeDefined();
    expect(lowWidget.qty_on_hand).toBeLessThan(lowWidget.reorder_point);
    // Widget A (qty=50, reorder=5) must NOT appear
    const okWidget = data.items.find((p: { id: string }) => p.id === productId);
    expect(okWidget).toBeUndefined();
  });

  it('returns total_count matching items count for filtered result', async () => {
    const { data } = await callTool('list_low_stock');
    expect(data.total_count).toBe(data.items.length);
    expect(data.next_cursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// INV-06: list_suppliers
// ---------------------------------------------------------------------------
describe('list_suppliers tool (INV-06)', () => {
  it('returns paginated suppliers list', async () => {
    const { data, isError } = await callTool('list_suppliers');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(1);
    const supplier = data.items.find((s: { id: string }) => s.id === supplierId);
    expect(supplier).toBeDefined();
    expect(supplier.name).toBe('ACME Supplies');
  });

  it('returns total_count and correct next_cursor', async () => {
    const { data } = await callTool('list_suppliers', { limit: 200, offset: 0 });
    expect(data.next_cursor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// INV-07: get_supplier
// ---------------------------------------------------------------------------
describe('get_supplier tool (INV-07)', () => {
  it('returns supplier detail by ID (no products list)', async () => {
    const { data, isError } = await callTool('get_supplier', { id: supplierId });
    expect(isError).toBe(false);
    expect(data.id).toBe(supplierId);
    expect(data.name).toBe('ACME Supplies');
    expect(data.email).toBe('orders@acme.example');
    // No products array — schema has no supplier_id FK on products
    expect(data.products).toBeUndefined();
  });

  it('returns isError NOT_FOUND for unknown supplier ID', async () => {
    const { data, isError } = await callTool('get_supplier', { id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});
