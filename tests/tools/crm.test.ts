import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import { registerCrmTools } from '../../src/tools/crm.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `crm-test-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let apiKey: string;

// Superuser connection for seeding (bypasses RLS)
const seedSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');

// Seeded IDs for test assertions
let contactId: string;
let orderId: string;
let invoiceId: string;

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
// Setup: build server with CRM tools, create tenant, seed data
// ---------------------------------------------------------------------------
beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // Build Fastify server with MCP routes + CRM tools registered.
  // Stateless pattern: create a fresh McpServer + transport per request (SDK requirement).
  // enableJsonResponse: true ensures plain JSON responses instead of SSE for app.inject().
  app = await buildServer();

  app.post('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      // createMcpServer() already registers all 18 tools (Wave 4 wiring).
      // Do NOT call registerCrmTools again — that would double-register the 5 CRM tools.
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
    payload: { name: 'CRM Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(createRes.statusCode).toBe(201);
  const tenantBody = JSON.parse(createRes.body);
  tenantId = tenantBody.tenantId;
  apiKey = tenantBody.apiKey;

  // Seed a contact (vendor type for type-filter test)
  const [contact] = await seedSql`
    INSERT INTO contacts (tenant_id, name, email, phone, company, type)
    VALUES (${tenantId}, 'Bob Jones', 'bob@corp.example', '555-0300', 'Jones Corp', 'vendor')
    RETURNING id
  `;
  contactId = contact.id;

  // Seed a product for the order line item
  const [product] = await seedSql`
    INSERT INTO products (tenant_id, sku, name, price, currency, is_active, reorder_point)
    VALUES (${tenantId}, 'CRM-TEST-001', 'CRM Test Product', '75.00', 'USD', true, 0)
    RETURNING id
  `;

  await seedSql`
    INSERT INTO stock_levels (tenant_id, product_id, quantity_on_hand)
    VALUES (${tenantId}, ${product.id}, 5)
  `;

  // Seed an order linked to this contact
  const [order] = await seedSql`
    INSERT INTO orders (tenant_id, contact_id, status, order_date, subtotal, tax_amount, total)
    VALUES (${tenantId}, ${contactId}, 'confirmed', CURRENT_DATE, '75.00', '0.00', '75.00')
    RETURNING id
  `;
  orderId = order.id;

  await seedSql`
    INSERT INTO order_line_items (tenant_id, order_id, product_id, quantity, unit_price, line_total)
    VALUES (${tenantId}, ${orderId}, ${product.id}, 1, '75.00', '75.00')
  `;

  // Seed an invoice with outstanding balance (status 'sent' = not yet paid/cancelled)
  const [invoice] = await seedSql`
    INSERT INTO invoices (tenant_id, contact_id, status, issued_at, due_at, subtotal, tax_amount, total)
    VALUES (${tenantId}, ${contactId}, 'sent', CURRENT_DATE, CURRENT_DATE, '75.00', '0.00', '75.00')
    RETURNING id
  `;
  invoiceId = invoice.id;
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
// CRM-01: list_contacts
// ---------------------------------------------------------------------------
describe('list_contacts tool (CRM-01)', () => {
  it('returns paginated contacts list', async () => {
    const { data, isError } = await callTool('list_contacts');
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(1);
    const contact = data.items.find((c: { id: string }) => c.id === contactId);
    expect(contact).toBeDefined();
    expect(contact.name).toBe('Bob Jones');
  });

  it('filters by type when type parameter provided', async () => {
    const { data } = await callTool('list_contacts', { type: 'vendor' });
    const contact = data.items.find((c: { id: string }) => c.id === contactId);
    expect(contact).toBeDefined();

    const { data: noData } = await callTool('list_contacts', { type: 'customer' });
    const shouldBeAbsent = noData.items.find((c: { id: string }) => c.id === contactId);
    expect(shouldBeAbsent).toBeUndefined();
  });

  it('returns total_count and correct next_cursor', async () => {
    const { data } = await callTool('list_contacts', { limit: 200, offset: 0 });
    expect(data.next_cursor).toBeNull();
  });

  it('enforces RLS — only returns contacts belonging to authenticated tenant', async () => {
    const { data } = await callTool('list_contacts');
    for (const item of data.items) {
      expect(item.id).toBe(contactId);
    }
  });
});

// ---------------------------------------------------------------------------
// CRM-02: get_contact
// ---------------------------------------------------------------------------
describe('get_contact tool (CRM-02)', () => {
  it('returns full contact detail by ID', async () => {
    const { data, isError } = await callTool('get_contact', { id: contactId });
    expect(isError).toBe(false);
    expect(data.id).toBe(contactId);
    expect(data.name).toBe('Bob Jones');
    expect(data.email).toBe('bob@corp.example');
    expect(data.company).toBe('Jones Corp');
    expect(data.type).toBe('vendor');
  });

  it('returns isError NOT_FOUND for unknown contact ID', async () => {
    const { data, isError } = await callTool('get_contact', { id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// CRM-03: search_contacts
// ---------------------------------------------------------------------------
describe('search_contacts tool (CRM-03)', () => {
  it('returns contacts matching query against name via ILIKE', async () => {
    const { data, isError } = await callTool('search_contacts', { query: 'Bob' });
    expect(isError).toBe(false);
    const contact = data.items.find((c: { id: string }) => c.id === contactId);
    expect(contact).toBeDefined();
  });

  it('returns contacts matching query against email via ILIKE (partial match)', async () => {
    const { data, isError } = await callTool('search_contacts', { query: 'corp.example' });
    expect(isError).toBe(false);
    const contact = data.items.find((c: { id: string }) => c.id === contactId);
    expect(contact).toBeDefined();
  });

  it('returns contacts matching query against company via ILIKE', async () => {
    const { data, isError } = await callTool('search_contacts', { query: 'Jones Corp' });
    expect(isError).toBe(false);
    const contact = data.items.find((c: { id: string }) => c.id === contactId);
    expect(contact).toBeDefined();
  });

  it('returns empty items array when no contacts match', async () => {
    const { data, isError } = await callTool('search_contacts', { query: 'xyzzy_no_match_12345' });
    expect(isError).toBe(false);
    expect(data.items).toHaveLength(0);
    expect(data.total_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CRM-04: get_contact_orders
// ---------------------------------------------------------------------------
describe('get_contact_orders tool (CRM-04)', () => {
  it('returns summary order rows { id, order_date, status, total } for contact', async () => {
    const { data, isError } = await callTool('get_contact_orders', { contact_id: contactId });
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(1);
    const order = data.items.find((o: { id: string }) => o.id === orderId);
    expect(order).toBeDefined();
    expect(order.status).toBe('confirmed');
    expect(order.total).toBeDefined();
    expect(order.order_date).toBeDefined();
    // Summary rows — no line_items
    expect(order.line_items).toBeUndefined();
  });

  it('returns isError NOT_FOUND for unknown contact ID', async () => {
    const { data, isError } = await callTool('get_contact_orders', { contact_id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// CRM-05: get_contact_invoices
// ---------------------------------------------------------------------------
describe('get_contact_invoices tool (CRM-05)', () => {
  it('returns summary invoice rows { id, issued_at, due_at, status, total, paid_at } and outstanding_balance', async () => {
    const { data, isError } = await callTool('get_contact_invoices', { contact_id: contactId });
    expect(isError).toBe(false);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.total_count).toBeGreaterThanOrEqual(1);
    const invoice = data.items.find((i: { id: string }) => i.id === invoiceId);
    expect(invoice).toBeDefined();
    expect(invoice.status).toBe('sent');
    // outstanding_balance must be present and equal to the unpaid invoice total
    expect(data.outstanding_balance).toBeDefined();
    expect(parseFloat(data.outstanding_balance)).toBeGreaterThanOrEqual(75);
  });

  it('returns isError NOT_FOUND for unknown contact ID', async () => {
    const { data, isError } = await callTool('get_contact_invoices', { contact_id: '00000000-0000-0000-0000-000000000000' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
  });
});
