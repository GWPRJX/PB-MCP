import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerInventoryTools } from '../tools/inventory.js';
import { registerOrdersTools } from '../tools/orders.js';
import { registerCrmTools } from '../tools/crm.js';
import { registerKbTools } from '../tools/kb.js';
import { registerWriteTools } from '../tools/write.js';
import { registerKbResources } from './resources.js';
import { registerPrompts } from './prompts.js';

/**
 * Create the MCP server instance with tools, resources, and prompts.
 *
 * If enabledTools is provided, only tools in that list are registered.
 * This enforces tenant-level and per-key tool access control.
 * Resources and prompts are always registered (not tenant-filtered).
 */
export function createMcpServer(enabledTools?: string[]): McpServer {
  const server = new McpServer({
    name: 'pb-mcp',
    version: '3.0.0',
  });

  const filter = enabledTools ? new Set(enabledTools) : null;

  registerInventoryTools(server, filter);
  registerOrdersTools(server, filter);
  registerCrmTools(server, filter);
  registerKbTools(server, filter);
  registerWriteTools(server, filter);

  // MCP Resources — KB articles (global, not tenant-filtered)
  registerKbResources(server);

  // MCP Prompts — workflow templates (global, not tenant-filtered)
  registerPrompts(server);

  return server;
}
