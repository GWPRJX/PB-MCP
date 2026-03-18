import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInventoryTools } from '../tools/inventory.js';
import { registerOrdersTools } from '../tools/orders.js';
import { registerCrmTools } from '../tools/crm.js';
import { registerKbTools } from '../tools/kb.js';
import { registerWriteTools } from '../tools/write.js';

/**
 * Create the MCP server instance with tools filtered by the enabled tools list.
 *
 * If enabledTools is provided, only tools in that list are registered.
 * This enforces tenant-level and per-key tool access control.
 */
export function createMcpServer(enabledTools?: string[]): McpServer {
  const server = new McpServer({
    name: 'pb-mcp',
    version: '2.0.0',
  });

  const filter = enabledTools ? new Set(enabledTools) : null;

  registerInventoryTools(server, filter);
  registerOrdersTools(server, filter);
  registerCrmTools(server, filter);
  registerKbTools(server, filter);
  registerWriteTools(server, filter);

  return server;
}
