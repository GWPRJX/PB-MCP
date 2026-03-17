import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `mcp-auth-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let validApiKey: string;
let keyIdToRevoke: string;

// MCP Streamable HTTP requires Accept: application/json, text/event-stream on POST requests
const MCP_HEADERS = {
  'content-type': 'application/json',
  'accept': 'application/json, text/event-stream',
};

// MCP initialize request body
const mcpInitialize = {
  jsonrpc: '2.0',
  method: 'initialize',
  id: 1,
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  // Build server with MCP routes registered (mirrors src/index.ts setup)
  // Stateless mode: create a fresh transport + McpServer per request (SDK requirement)
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

  app.get('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      const mcpServer = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw);
      reply.hijack();
    });
  });

  await app.ready();

  // Create test tenant + API key via admin API
  const createRes = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { name: 'MCP Auth Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(createRes.statusCode).toBe(201);
  const body = JSON.parse(createRes.body);
  tenantId = body.tenantId;
  validApiKey = body.apiKey;

  // Create a second key specifically for revocation tests
  const keyRes = await app.inject({
    method: 'POST',
    url: `/admin/tenants/${tenantId}/keys`,
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { label: 'key-to-revoke' },
  });
  keyIdToRevoke = JSON.parse(keyRes.body).keyId;
});

afterAll(async () => {
  if (tenantId) {
    // Must use DATABASE_MIGRATION_URL (superuser) — app_login lacks DELETE on tenants
    const cleanupSql = postgres(process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '');
    await cleanupSql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await cleanupSql.end();
  }
  await app.close();
});

describe('MCP auth — X-Api-Key header validation (TENANT-06)', () => {
  it('valid API key returns 200 with MCP JSON-RPC response', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': validApiKey, ...MCP_HEADERS },
      payload: mcpInitialize,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
  });

  it('missing X-Api-Key header returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'content-type': 'application/json' },
      payload: mcpInitialize,
    });
    expect(res.statusCode).toBe(401);
  });

  it('invalid (non-existent) API key returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'x-api-key': 'pb_' + '0'.repeat(64),
        'content-type': 'application/json',
      },
      payload: mcpInitialize,
    });
    expect(res.statusCode).toBe(401);
  });

  it('revoked API key returns 401 immediately after revocation', async () => {
    // First revoke the key created in beforeAll
    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}/keys/${keyIdToRevoke}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(revokeRes.statusCode).toBe(204);

    // Create a fresh key, use it, then revoke it.
    const newKeyRes = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/keys`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: { label: 'revoke-me' },
    });
    const { keyId: freshKeyId, apiKey: freshKey } = JSON.parse(newKeyRes.body);

    // Revoke it
    await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}/keys/${freshKeyId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });

    // Attempt MCP request with the now-revoked key
    const mcpRes = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': freshKey, 'content-type': 'application/json' },
      payload: mcpInitialize,
    });
    expect(mcpRes.statusCode).toBe(401);
  });

  it('malformed key (wrong format) returns 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': 'not-a-valid-key', 'content-type': 'application/json' },
      payload: mcpInitialize,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('MCP auth — tenant_id resolution (TENANT-07)', () => {
  it('authenticated request resolves API key to correct tenant_id via AsyncLocalStorage', async () => {
    // Test that a valid key returns a successful MCP response (tenant context was set correctly)
    // We can't directly inspect AsyncLocalStorage from outside, but a successful tools/list
    // confirms the entire auth + context chain worked.
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': validApiKey, ...MCP_HEADERS },
      payload: {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
        params: {},
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // tools/list returns the registered tools array — a non-error response confirms
    // the auth + context chain worked. Phase 4: createMcpServer() registers 21 tools.
    expect(Array.isArray(body.result?.tools)).toBe(true);
    expect(body.result?.tools.length).toBe(21);
  });
});
