import 'dotenv/config';
import { buildServer } from './server.js';
import { createMcpServer } from './mcp/server.js';
import { extractAndValidateApiKey } from './mcp/auth.js';
import { getEnabledToolNames } from './context.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { startKbScheduler } from './kb/scheduler.js';
import { sql, authSql } from './db/client.js';
import { syncBuiltinTools } from './admin/tool-registry-service.js';
import { seedDemoTenant } from './admin/seed-service.js';
import { logger } from './logger.js';

// Validate required environment variables before starting
if (!process.env.DATABASE_URL) {
  logger.fatal('DATABASE_URL environment variable is not set');
  process.exit(1);
}

if (!process.env.ADMIN_SECRET) {
  logger.fatal('ADMIN_SECRET environment variable is not set');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  logger.fatal('JWT_SECRET environment variable is not set');
  process.exit(1);
}

// Warn about missing encryption key; enforce in production
if (!process.env.ERP_ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    logger.fatal('ERP_ENCRYPTION_KEY is required in production. Generate with: openssl rand -hex 32');
    process.exit(1);
  }
  logger.warn('ERP_ENCRYPTION_KEY not set — ERP credentials will be stored in PLAINTEXT');
}

const PORT = parseInt(process.env.PORT ?? '3000', 10);

/**
 * Start the HTTP server, register MCP routes, and begin listening.
 *
 * Registers POST/GET/DELETE /mcp endpoints using stateless StreamableHTTP transport,
 * starts the KB scheduler (outside test mode), and installs SIGTERM/SIGINT handlers
 * for graceful shutdown.
 *
 * @throws {Error} If the server fails to bind or any plugin registration fails.
 */
async function main(): Promise<void> {
  // Sync builtin tools to the tool_registry table on startup
  await syncBuiltinTools(sql);

  // Seed demo tenant in development mode (no-op in production)
  await seedDemoTenant();

  const server = await buildServer();

  // Health check endpoint — responds before MCP routes so load balancers can probe it
  server.get('/health', async (req, reply) => {
    try {
      await sql`SELECT 1`;
      return reply.send({ status: 'healthy', database: 'connected', uptime: process.uptime(), timestamp: new Date().toISOString() });
    } catch {
      return reply.status(503).send({ status: 'unhealthy', database: 'disconnected' });
    }
  });

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

  // KB bootstrap sync — blocks until initial sync completes so KB data is ready
  let kbTimer: NodeJS.Timeout | undefined;
  if (process.env.NODE_ENV !== 'test') {
    kbTimer = await startKbScheduler();
  }

  // Start listening
  const address = await server.listen({ port: PORT, host: '0.0.0.0' });
  logger.info({ address }, 'Server listening');
  logger.info({ docs: `${address}/docs` }, 'Admin UI available');

  /**
   * Gracefully stop the server and exit the process.
   * Registered as the handler for SIGTERM and SIGINT signals.
   */
  const shutdown = async (): Promise<void> => {
    logger.info('Shutting down...');
    if (kbTimer) clearInterval(kbTimer);
    await server.close();
    await sql.end();
    await authSql.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: Error) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
