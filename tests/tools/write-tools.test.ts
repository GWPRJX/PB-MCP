import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWriteTools } from '../../src/tools/write.js';
import { ALL_TOOLS } from '../../src/admin/tool-permissions-service.js';
import { createMcpServer } from '../../src/mcp/server.js';

// All 6 write tool names
const WRITE_TOOLS = [
  'create_stock_entry',
  'update_stock_entry',
  'create_invoice',
  'update_invoice',
  'create_contact',
  'update_contact',
] as const;

// ---------------------------------------------------------------------------
// ALL_TOOLS inclusion tests
// ---------------------------------------------------------------------------
describe('write tools in ALL_TOOLS', () => {
  it('ALL_TOOLS includes all 6 write tools', () => {
    for (const tool of WRITE_TOOLS) {
      expect(ALL_TOOLS).toContain(tool);
    }
  });

  it('ALL_TOOLS has 27 total tools (21 read + 6 write)', () => {
    expect(ALL_TOOLS).toHaveLength(27);
  });
});

// ---------------------------------------------------------------------------
// registerWriteTools — registration + filtering
// ---------------------------------------------------------------------------
describe('registerWriteTools', () => {
  it('registers all 6 write tools when no filter is set (null)', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;

    registerWriteTools(mockServer, null);

    expect(mockTool).toHaveBeenCalledTimes(6);

    const registeredNames = mockTool.mock.calls.map((c: unknown[]) => c[0]);
    for (const name of WRITE_TOOLS) {
      expect(registeredNames).toContain(name);
    }
  });

  it('registers all 6 write tools when filter is undefined', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;

    registerWriteTools(mockServer, undefined);

    expect(mockTool).toHaveBeenCalledTimes(6);
  });

  it('filters tools based on enabled set', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;
    const filter = new Set(['create_contact', 'update_contact']);

    registerWriteTools(mockServer, filter);

    expect(mockTool).toHaveBeenCalledTimes(2);

    const registeredNames = mockTool.mock.calls.map((c: unknown[]) => c[0]);
    expect(registeredNames).toContain('create_contact');
    expect(registeredNames).toContain('update_contact');
    expect(registeredNames).not.toContain('create_invoice');
    expect(registeredNames).not.toContain('update_invoice');
    expect(registeredNames).not.toContain('create_stock_entry');
    expect(registeredNames).not.toContain('update_stock_entry');
  });

  it('registers zero tools when filter excludes all write tools', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;
    const filter = new Set(['list_products']); // only a read tool

    registerWriteTools(mockServer, filter);

    expect(mockTool).toHaveBeenCalledTimes(0);
  });

  it('registers only matching tools from a mixed filter', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;
    // Mix of read + write tool names — only write tools should be registered by registerWriteTools
    const filter = new Set(['create_invoice', 'list_products', 'update_stock_entry', 'search_kb']);

    registerWriteTools(mockServer, filter);

    expect(mockTool).toHaveBeenCalledTimes(2);

    const registeredNames = mockTool.mock.calls.map((c: unknown[]) => c[0]);
    expect(registeredNames).toContain('create_invoice');
    expect(registeredNames).toContain('update_stock_entry');
  });
});

// ---------------------------------------------------------------------------
// createMcpServer integration
// ---------------------------------------------------------------------------
describe('createMcpServer with write tools', () => {
  it('creates server with all tools when no filter', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });

  it('creates server with mixed read + write tools filter', () => {
    const server = createMcpServer(['create_contact', 'list_products']);
    expect(server).toBeDefined();
  });

  it('creates server with only write tools in filter', () => {
    const server = createMcpServer(['create_stock_entry', 'update_contact']);
    expect(server).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tool metadata — description, schema, handler
// ---------------------------------------------------------------------------
describe('write tool metadata', () => {
  it('each write tool has a non-empty description (length > 10)', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;

    registerWriteTools(mockServer, null);

    expect(mockTool).toHaveBeenCalledTimes(6);

    for (const call of mockTool.mock.calls) {
      const [name, description] = call as [string, string, unknown, unknown];
      expect(typeof name).toBe('string');
      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(10);
    }
  });

  it('each write tool has a schema object and handler function', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;

    registerWriteTools(mockServer, null);

    for (const call of mockTool.mock.calls) {
      const [_name, _desc, schema, handler] = call as [string, string, unknown, unknown];
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('object');
      expect(typeof handler).toBe('function');
    }
  });

  it('tool names match the expected WRITE_TOOLS list exactly', () => {
    const mockTool = vi.fn();
    const mockServer = { tool: mockTool } as unknown as McpServer;

    registerWriteTools(mockServer, null);

    const registeredNames = mockTool.mock.calls.map((c: unknown[]) => c[0]).sort();
    const expectedNames = [...WRITE_TOOLS].sort();

    expect(registeredNames).toEqual(expectedNames);
  });
});
