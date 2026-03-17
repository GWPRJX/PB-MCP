import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInventoryTools } from '../tools/inventory.js';
import { registerOrdersTools } from '../tools/orders.js';
import { registerCrmTools } from '../tools/crm.js';
import { registerKbTools } from '../tools/kb.js';

/**
 * Create the MCP server instance with all 21 ERP + KB domain tools registered.
 *
 * Returns the McpServer instance — caller is responsible for connecting a transport.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'pb-mcp',
    version: '1.0.0',
  });

  registerInventoryTools(server);
  registerOrdersTools(server);
  registerCrmTools(server);
  registerKbTools(server);

  return server;
}
