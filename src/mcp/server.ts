import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Create the MCP server instance.
 * Phase 2: empty tool list (tools are registered in Phase 3).
 * Phase 3 will call server.tool() on this instance.
 *
 * Returns the McpServer instance — caller is responsible for connecting a transport.
 *
 * NOTE: We explicitly register the tools capability so that tools/list returns []
 * rather than a "method not found" error. The MCP SDK only calls setToolRequestHandlers()
 * automatically when mcpServer.tool() is used, so we must trigger it manually here.
 * This is done via the internal server.registerCapabilities() call on the low-level
 * Server instance that McpServer wraps.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'pb-mcp',
    version: '1.0.0',
  });

  // Explicitly initialize the tools request handlers so that tools/list returns []
  // instead of -32601 Method Not Found. Without this, the tools capability is only
  // registered when the first tool is added via server.tool() — which happens in Phase 3.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).setToolRequestHandlers();

  return server;
}
