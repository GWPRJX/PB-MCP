import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Create the MCP server instance.
 * Phase 2: empty tool list (tools are registered in Phase 3).
 * Phase 3 will call server.tool() on this instance.
 *
 * Returns the McpServer instance — caller is responsible for connecting a transport.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'pb-mcp',
    version: '1.0.0',
  });

  // Phase 3 will register tools here.
  // For now, tools/list will return an empty array by default.

  return server;
}
