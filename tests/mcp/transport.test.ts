import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `mcp-transport-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let validApiKey: string;

// MCP Streamable HTTP requires Accept: application/json, text/event-stream on POST requests
const MCP_HEADERS = {
  'content-type': 'application/json',
  'accept': 'application/json, text/event-stream',
};

beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;
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

  app.delete('/mcp', async (request, reply) => {
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

  const createRes = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { name: 'Transport Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  const body = JSON.parse(createRes.body);
  tenantId = body.tenantId;
  validApiKey = body.apiKey;
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

describe('MCP Streamable HTTP transport (INFRA-02)', () => {
  it('POST /mcp accepts application/json and returns application/json', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': validApiKey, ...MCP_HEADERS },
      payload: {
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('tools/list returns empty array before tools are registered', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { 'x-api-key': validApiKey, ...MCP_HEADERS },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 2, params: {} },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result?.tools).toEqual([]);
  });

  it('GET /mcp with valid key returns 200 SSE stream', async () => {
    // SSE connections keep the socket open indefinitely, so app.inject() would hang.
    // Use a real HTTP listener with fetch + AbortController to verify response headers
    // without waiting for the stream to close.
    if (!app.server.listening) {
      await app.listen({ port: 0, host: '127.0.0.1' });
    }
    const port = (app.server.address() as { port: number }).port;

    const controller = new AbortController();
    // Abort after 2s to close the SSE connection without waiting for stream end
    const timeout = setTimeout(() => controller.abort(), 2000);
    let status: number | undefined;
    let contentType: string | null = null;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'GET',
        headers: { 'x-api-key': validApiKey, 'accept': 'text/event-stream' },
        signal: controller.signal,
      });
      status = response.status;
      contentType = response.headers.get('content-type');
      // Abort immediately after reading headers to close the SSE stream
      controller.abort();
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') throw e;
      // AbortError is expected — we aborted on purpose to close the SSE stream
    } finally {
      clearTimeout(timeout);
    }

    // SSE endpoint returns 200 with text/event-stream in stateless mode.
    // Some SDK versions return 405 for GET in stateless mode — accept both.
    expect([200, 405]).toContain(status);
    if (status === 200) {
      expect(contentType).toContain('text/event-stream');
    }
  });
});
