import 'dotenv/config';
import { buildServer } from './server.js';
import { createMcpServer } from './mcp/server.js';
import { extractAndValidateApiKey } from './mcp/auth.js';
import { getEnabledToolNames } from './context.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { startKbScheduler } from './kb/scheduler.js';

// Validate required environment variables before starting
if (!process.env.DATABASE_URL) {
  process.stderr.write('[pb-mcp] ERROR: DATABASE_URL environment variable is not set\n');
  process.exit(1);
}

if (!process.env.ADMIN_SECRET) {
  process.stderr.write('[pb-mcp] ERROR: ADMIN_SECRET environment variable is not set\n');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  process.stderr.write('[pb-mcp] ERROR: JWT_SECRET environment variable is not set\n');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main(): Promise<void> {
  const server = await buildServer();

  // MCP Streamable HTTP — stateless mode requires a fresh transport + McpServer per request.
  // The MCP SDK's WebStandardStreamableHTTPServerTransport throws if reused across requests
  // when sessionIdGenerator is undefined (stateless mode). Creating a new McpServer per
  // request is cheap since no tools are registered yet (Phase 3 adds tools).
  //
  // POST /mcp — main JSON-RPC endpoint (initialize, tools/list, tools/call, etc.)
  server.post('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      const enabledTools = getEnabledToolNames();
      const mcpServer = createMcpServer(enabledTools);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode — no session ID
        enableJsonResponse: true,      // return direct JSON responses (not SSE) for POST requests
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      reply.hijack();
    });
  });

  // GET /mcp — SSE endpoint for server-initiated messages (server push)
  server.get('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      const enabledTools = getEnabledToolNames();
      const mcpServer = createMcpServer(enabledTools);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw);
      reply.hijack();
    });
  });

  // DELETE /mcp — session termination
  server.delete('/mcp', async (request, reply) => {
    await extractAndValidateApiKey(request, reply, async () => {
      const enabledTools = getEnabledToolNames();
      const mcpServer = createMcpServer(enabledTools);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(request.raw, reply.raw);
      reply.hijack();
    });
  });

  if (process.env.NODE_ENV !== 'test') {
    startKbScheduler();
  }

  // Start listening
  const address = await server.listen({ port: PORT, host: '0.0.0.0' });
  process.stderr.write(`[pb-mcp] Server listening on ${address}\n`);
  process.stderr.write(`[pb-mcp] Admin UI: ${address}/docs\n`);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    process.stderr.write('[pb-mcp] Shutting down...\n');
    await server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: Error) => {
  process.stderr.write(`[pb-mcp] FATAL: ${err.message}\n${err.stack ?? ''}\n`);
  process.exit(1);
});
