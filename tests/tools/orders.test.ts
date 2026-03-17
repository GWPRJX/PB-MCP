import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import { registerOrdersTools } from '../../src/tools/orders.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `ord-test-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let apiKey: string;

// Superuser connection for seeding (bypasses RLS)
const seedSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');

// Seeded IDs for test assertions
let contactId: string;
let productId: string;
let orderId: string;
let paidInvoiceId: string;
let overdueInvoiceId: string;

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
// Setup: build server with orders tools, create tenant, seed data
// ---------------------------------------------------------------------------
beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // Build Fastify server with MCP routes + orders tools registered.
  // Stateless pattern: create a fresh McpServer + transport per request (SDK requirement).
  // enableJsonResponse: true ensures plain JSON responses instead of SSE for app.inject().
  app = await buildServer();

  app.post('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      // createMcpServer() already registers all 18 tools (Wave 4 wiring).
      // Do NOT call registerOrdersTools again — that would double-register the 6 ORD tools.
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
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
    payload: { name: 'Orders Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(createRes.statusCode).toBe(201);
  const tenantBody = JSON.parse(createRes.body);
  tenantId = tenantBody.tenantId;
  apiKey = tenantBody.apiKey;

  // Seed a contact
  const [contact] = await seedSql`
    INSERT INTO contacts (tenant_id, name, email, phone, type)
    VALUES (${tenantId}, 'Jane Smith', 'jane@example.com', '555-0200', 'customer')
    RETURNING id
  `;
  contactId = contact.id;

  // Seed a product + stock level
  const [product] = await seedSql`
    INSERT INTO products (tenant_id, sku, name, price, currency, is_active, reorder_point)
    VALUES (${tenantId}, 'ORD-TEST-001', 'Test Product', '100.00', 'USD', true, 0)
    RETURNING id
  `;
  productId = product.id;

  await seedSql`
    INSERT INTO stock_levels (tenant_id, product_id, quantity_on_hand)
    VALUES (${tenantId}, ${productId}, 10)
  `;

  // Seed an order (confirmed) with a line item
  const [order] = await seedSql`
    INSERT INTO orders (tenant_id, contact_id, status, order_date, subtotal, tax_amount, total)
    VALUES (${tenantId}, ${contactId}, 'confirmed', CURRENT_DATE, '100.00', '10.00', '110.00')
    RETURNING id
  `;
  orderId = order.id;

  await seedSql`
    INSERT INTO order_line_items (tenant_id, order_id, product_id, quantity, unit_price, line_total)
    VALUES (${tenantId}, ${orderId}, ${productId}, 1, '100.00', '100.00')
  `;

  // Seed a paid invoice
  const [paidInvoice] = await seedSql`
    INSERT INTO invoices (tenant_id, order_id, contact_id, status, issued_at, due_at, paid_at, subtotal, tax_amount, total)
    VALUES (${tenantId}, ${orderId}, ${contactId}, 'paid', CURRENT_DATE, CURRENT_DATE, NOW(), '100.00', '10.00', '110.00')
    RETURNING id
  `;
  paidInvoiceId = paidInvoice.id;

  // Seed an overdue invoice (due_at in the past, status 'sent' = past-due but not paid/cancelled)
  const [overdueInvoice] = await seedSql`
    INSERT INTO invoices (tenant_id, contact_id, status, issued_at, due_at, subtotal, tax_amount, total)
    VALUES (${tenantId}, ${contactId}, 'sent', '2020-01-01', '2020-01-01', '50.00', '0.00', '50.00')
    RETURNING id
  `;
  overdueInvoiceId = overdueInvoice.id;
});

// ---------------------------------------------------------------------------
// Teardown: delete tenant (cascades to all ERP data)
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (tenantId) {
    await seedSql`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  await seedSql.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// ORD-01: list_orders
// ---------------------------------------------------------------------------
describe('list_orders tool (ORD-01)', () => {
  it('returns paginated orders list with status and total', async () => {
    const { data, isError } = await callTool('list_orders');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(1);
    const order = data.items.find((o: { id: string }) => o.id === orderId);
    expect(order).toBeDefined();
    expect(order.status).toBe('confirmed');
    expect(order.total).toBeDefined();
  });

  it('filters by status when status parameter provided', async () => {
    const { data, isError } = await callTool('list_orders', { status: 'confirmed' });
    expect(isError).toBe(false);
    expect(data.items.every((o: { status: string }) => o.status === 'confirmed')).toBe(true);

    const { data: noData } = await callTool('list_orders', { status: 'shipped' });
    expect(noData.items).toHaveLength(0);
    expect(noData.total_count).toBe(0);
  });

  it('returns total_count and correct next_cursor', async () => {
    const { data } = await callTool('list_orders', { limit: 200, offset: 0 });
    expect(data.next_cursor).toBeNull();
  });

  it('enforces RLS — only returns orders belonging to authenticated tenant', async () => {
    const { data } = await callTool('list_orders');
    for (const item of data.items) {
      expect(item.id).toBe(orderId);
    }
  });
});

// ---------------------------------------------------------------------------
// ORD-02: get_order
// ---------------------------------------------------------------------------
describe('get_order tool (ORD-02)', () => {
  it('returns full order with line items (product_name, product_sku, quantity, unit_price, line_total)', async () => {
    const { data, isError } = await callTool('get_order', { id: orderId });
    expect(isError).toBe(false);
    expect(data.id).toBe(orderId);
    expect(data.status).toBe('confirmed');
    expect(Array.isArray(data.line_items)).toBe(true);
    expect(data.line_items).toHaveLength(1);
    const li = data.line_items[0];
    expect(li.product_name).toBe('Test Product');
    expect(li.product_sku).toBe('ORD-TEST-001');
    expect(li.quantity).toBe(1);
  });

  it('returns linked contact (id, name, email, phone) when contact exists', async () => {
    const { data, isError } = await callTool('get_order', { id: orderId });
    expect(isError).toBe(false);
    expect(data.contact).not.toBeNull();
    expect(data.contact.id).toBe(contactId);
    expect(data.contact.name).toBe('Jane Smith');
    expect(data.contact.email).toBe('jane@example.com');
  });

  it('returns isError NOT_FOUND for unknown order ID', async () => {
    const { data, isError } = await callTool('get_order', { id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// ORD-03: list_invoices
// ---------------------------------------------------------------------------
describe('list_invoices tool (ORD-03)', () => {
  it('returns paginated invoices list', async () => {
    const { data, isError } = await callTool('list_invoices');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(2);
  });

  it('filters by status when status parameter provided', async () => {
    const { data } = await callTool('list_invoices', { status: 'paid' });
    expect(data.items.every((i: { status: string }) => i.status === 'paid')).toBe(true);
    const paidInvoice = data.items.find((i: { id: string }) => i.id === paidInvoiceId);
    expect(paidInvoice).toBeDefined();
  });

  it('returns total_count and correct next_cursor', async () => {
    const { data } = await callTool('list_invoices', { limit: 1, offset: 0 });
    expect(data.items).toHaveLength(1);
    // We have 2 invoices seeded — next_cursor must be non-null
    expect(data.next_cursor).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ORD-04: get_invoice
// ---------------------------------------------------------------------------
describe('get_invoice tool (ORD-04)', () => {
  it('returns full invoice detail by ID', async () => {
    const { data, isError } = await callTool('get_invoice', { id: paidInvoiceId });
    expect(isError).toBe(false);
    expect(data.id).toBe(paidInvoiceId);
    expect(data.status).toBe('paid');
    expect(data.total).toBeDefined();
  });

  it('returns isError NOT_FOUND for unknown invoice ID', async () => {
    const { data, isError } = await callTool('get_invoice', { id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// ORD-05: list_overdue_invoices
// ---------------------------------------------------------------------------
describe('list_overdue_invoices tool (ORD-05)', () => {
  it('returns only invoices with status=overdue or (due_at past AND status not paid/cancelled)', async () => {
    const { data, isError } = await callTool('list_overdue_invoices');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    // The overdue invoice (due_at='2020-01-01', status='unpaid') must appear
    const overdue = data.items.find((i: { id: string }) => i.id === overdueInvoiceId);
    expect(overdue).toBeDefined();
  });

  it('paid invoice does NOT appear in overdue list', async () => {
    const { data } = await callTool('list_overdue_invoices');
    const paid = data.items.find((i: { id: string }) => i.id === paidInvoiceId);
    expect(paid).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ORD-06: get_payment_summary
// ---------------------------------------------------------------------------
describe('get_payment_summary tool (ORD-06)', () => {
  it('returns { total_invoiced, total_paid, outstanding_balance, overdue_count } for tenant', async () => {
    const { data, isError } = await callTool('get_payment_summary');
    expect(isError).toBe(false);
    expect(data.total_invoiced).toBeDefined();
    expect(data.total_paid).toBeDefined();
    expect(data.outstanding_balance).toBeDefined();
    expect(typeof data.overdue_count).toBe('number');
    // Paid invoice total = 110.00, so total_paid >= 110.00
    expect(parseFloat(data.total_paid)).toBeGreaterThanOrEqual(110);
    // Overdue count >= 1 (the overdue invoice we seeded)
    expect(data.overdue_count).toBeGreaterThanOrEqual(1);
  });
});
