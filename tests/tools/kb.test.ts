import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `kb-test-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let apiKey: string;

// Superuser connection for seeding kb_articles (no tenant_id — global table)
const seedSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');

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
// Setup: build server, create tenant, seed kb_articles
// ---------------------------------------------------------------------------
beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // Build Fastify server with MCP routes.
  // Stateless pattern: fresh McpServer + transport per request (SDK requirement).
  // createMcpServer() includes all 21 tools (ERP + KB) after Phase 4 wiring.
  app = await buildServer();

  app.post('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
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

  // Create test tenant via admin API (KB tools still require a valid API key)
  const createRes = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { name: 'KB Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(createRes.statusCode).toBe(201);
  const tenantBody = JSON.parse(createRes.body);
  tenantId = tenantBody.tenantId;
  apiKey = tenantBody.apiKey;

  // Seed kb_articles with 3 test rows via superuser connection.
  // TRUNCATE first to ensure a clean slate for this test run.
  // kb_articles is global (no tenant_id) — safe to truncate in test env.
  await seedSql`TRUNCATE TABLE kb_articles`;

  await seedSql`
    INSERT INTO kb_articles (youtrack_id, summary, content, tags, synced_at, content_hash)
    VALUES
      ('P8-A-1', 'How to reset your password', 'Go to settings and click reset.', ARRAY['auth', 'account'], NOW(), 'hash1'),
      ('P8-A-2', 'Getting started guide', 'Welcome! This guide helps you get started with our product.', ARRAY['onboarding'], NOW(), 'hash2'),
      ('P8-A-3', 'API rate limits explained', 'Content about rate limiting policies and best practices.', ARRAY['api', 'docs'], NOW(), 'hash3')
  `;
});

// ---------------------------------------------------------------------------
// Teardown: delete tenant, clean up kb_articles, close connections
// ---------------------------------------------------------------------------
afterAll(async () => {
  if (tenantId) {
    await seedSql`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  await seedSql`TRUNCATE TABLE kb_articles`;
  await seedSql.end();
  await app.close();
});

// ---------------------------------------------------------------------------
// search_kb
// ---------------------------------------------------------------------------
describe('search_kb tool (KB-06)', () => {
  it('returns { items, total_count, next_cursor } matching articles by summary ILIKE', async () => {
    const { data, isError } = await callTool('search_kb', { query: 'password' });
    expect(isError).toBe(false);
    expect(data.total_count).toBe(1);
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items[0].youtrack_id).toBe('P8-A-1');
    expect(data.items[0].summary).toBe('How to reset your password');
    expect(data.next_cursor).toBeNull();
  });

  it('returns { items, total_count, next_cursor } matching articles by content ILIKE', async () => {
    const { data, isError } = await callTool('search_kb', { query: 'rate limiting' });
    expect(isError).toBe(false);
    expect(data.total_count).toBe(1);
    expect(data.items[0].youtrack_id).toBe('P8-A-3');
  });

  it('returns items without content field (summaries only)', async () => {
    const { data, isError } = await callTool('search_kb', { query: 'guide' });
    expect(isError).toBe(false);
    expect(data.items.length).toBeGreaterThanOrEqual(1);
    // search_kb MUST NOT return content — summaries only
    for (const item of data.items) {
      expect(item).not.toHaveProperty('content');
    }
  });

  it('returns empty items array when no articles match the query', async () => {
    const { data, isError } = await callTool('search_kb', { query: 'xyzzy-nonexistent-term-12345' });
    expect(isError).toBe(false);
    expect(data.total_count).toBe(0);
    expect(data.items).toEqual([]);
    expect(data.next_cursor).toBeNull();
  });

  it('respects limit and offset pagination parameters', async () => {
    // All 3 articles match empty-ish broad query; use limit=2 to test pagination
    // "the" appears in at least the getting started article, use broad "e" to match all
    const { data: page1, isError: e1 } = await callTool('search_kb', { query: 'e', limit: 2, offset: 0 });
    expect(e1).toBe(false);
    expect(page1.items.length).toBeLessThanOrEqual(2);
    expect(page1.total_count).toBeGreaterThanOrEqual(2);
    // If there are more items beyond limit, next_cursor should be non-null
    if (page1.total_count > 2) {
      expect(page1.next_cursor).not.toBeNull();
    }

    // Fetch page 2 with offset=2
    const { data: page2, isError: e2 } = await callTool('search_kb', { query: 'e', limit: 2, offset: 2 });
    expect(e2).toBe(false);
    // Page 2 items should not overlap with page 1 items
    const page1Ids = page1.items.map((i: { youtrack_id: string }) => i.youtrack_id);
    const page2Ids = page2.items.map((i: { youtrack_id: string }) => i.youtrack_id);
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });
});

// ---------------------------------------------------------------------------
// get_kb_article
// ---------------------------------------------------------------------------
describe('get_kb_article tool (KB-05)', () => {
  it('returns full article including content by youtrack_id', async () => {
    const { data, isError } = await callTool('get_kb_article', { article_id: 'P8-A-2' });
    expect(isError).toBe(false);
    expect(data.youtrack_id).toBe('P8-A-2');
    expect(data.summary).toBe('Getting started guide');
    // get_kb_article MUST return content
    expect(data).toHaveProperty('content');
    expect(typeof data.content).toBe('string');
    expect(data.content.length).toBeGreaterThan(0);
  });

  it('returns isError NOT_FOUND for unknown youtrack_id', async () => {
    const { data, isError } = await callTool('get_kb_article', { article_id: 'P8-A-9999' });
    expect(isError).toBe(true);
    expect(data.code).toBe('NOT_FOUND');
    expect(data.message).toContain('P8-A-9999');
  });
});

// ---------------------------------------------------------------------------
// get_kb_sync_status
// ---------------------------------------------------------------------------
describe('get_kb_sync_status tool (KB-06)', () => {
  it('returns { last_synced_at, article_count } — last_synced_at is null when no articles exist', async () => {
    // Temporarily empty the table to test null last_synced_at
    await seedSql`TRUNCATE TABLE kb_articles`;
    const { data, isError } = await callTool('get_kb_sync_status');
    expect(isError).toBe(false);
    expect(data.article_count).toBe(0);
    expect(data.last_synced_at).toBeNull();

    // Restore the 3 seeded articles
    await seedSql`
      INSERT INTO kb_articles (youtrack_id, summary, content, tags, synced_at, content_hash)
      VALUES
        ('P8-A-1', 'How to reset your password', 'Go to settings and click reset.', ARRAY['auth', 'account'], NOW(), 'hash1'),
        ('P8-A-2', 'Getting started guide', 'Welcome! This guide helps you get started with our product.', ARRAY['onboarding'], NOW(), 'hash2'),
        ('P8-A-3', 'API rate limits explained', 'Content about rate limiting policies and best practices.', ARRAY['api', 'docs'], NOW(), 'hash3')
    `;
  });

  it('returns article_count matching actual row count in kb_articles', async () => {
    const { data, isError } = await callTool('get_kb_sync_status');
    expect(isError).toBe(false);
    expect(data.article_count).toBe(3);
    expect(typeof data.last_synced_at).toBe('string');
    // Should be a valid ISO timestamp
    expect(new Date(data.last_synced_at).getTime()).toBeGreaterThan(0);
  });
});
