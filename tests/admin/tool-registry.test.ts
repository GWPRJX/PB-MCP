import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the logger to avoid side-effects in tests
// ---------------------------------------------------------------------------
vi.mock('../../src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// We cannot import BUILTIN_TOOLS directly (it's not exported), so we test it
// indirectly via syncBuiltinTools. However, for the constant validation tests
// we re-read the source and parse it. Instead, let's use a different approach:
// import the functions and test through their behavior, plus use a snapshot
// approach for the constant by calling syncBuiltinTools with a capturing mock.
// ---------------------------------------------------------------------------

import {
  syncBuiltinTools,
  getRegisteredTools,
  getActiveToolNames,
  registerToolFromDoc,
} from '../../src/admin/tool-registry-service.js';

// ---------------------------------------------------------------------------
// Helper: create a mock SQL tagged-template function
// ---------------------------------------------------------------------------

function createMockSql(returnValue: unknown[] = []) {
  const fn = vi.fn().mockResolvedValue(returnValue);

  // postgres uses tagged template literals: sql`...`
  // The function receives (strings, ...values) when used as a template tag.
  // We wrap it so it works as both a tagged template and captures the values.
  const sqlProxy = new Proxy(fn, {
    apply(_target, _thisArg, args) {
      return fn(...args);
    },
  });

  return { sql: sqlProxy as unknown as any, fn };
}

// ---------------------------------------------------------------------------
// BUILTIN_TOOLS constant validation
// ---------------------------------------------------------------------------

describe('BUILTIN_TOOLS constant (via syncBuiltinTools)', () => {
  it('has exactly 27 entries', async () => {
    const { sql, fn } = createMockSql();
    fn.mockResolvedValue([]);

    await syncBuiltinTools(sql);

    // syncBuiltinTools calls sql once per tool + 1 deactivation cleanup
    expect(fn).toHaveBeenCalledTimes(28);
  });

  it('has no duplicate tool names', async () => {
    const { sql, fn } = createMockSql();
    fn.mockResolvedValue([]);

    const toolNames: string[] = [];
    fn.mockImplementation((...args: unknown[]) => {
      // The tagged template call passes (strings, ...values)
      // The first interpolated value is tool.toolName
      const strings = args[0] as TemplateStringsArray;
      const values = args.slice(1);
      // For the INSERT statement, toolName is the first interpolated value
      // Only capture INSERT calls (4+ interpolated values), skip the UPDATE deactivation call
      if (values.length >= 4) {
        toolNames.push(values[0] as string);
      }
      return Promise.resolve([]);
    });

    await syncBuiltinTools(sql);

    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
    expect(uniqueNames.size).toBe(27);
  });

  it('each tool has required fields (toolName, displayName, description, category)', async () => {
    const { sql, fn } = createMockSql();
    const capturedTools: Array<{ toolName: string; displayName: string; description: string; category: string }> = [];

    fn.mockImplementation((...args: unknown[]) => {
      const values = args.slice(1);
      // syncBuiltinTools interpolates: toolName, displayName, description, category, 'builtin'
      if (values.length >= 4) {
        capturedTools.push({
          toolName: values[0] as string,
          displayName: values[1] as string,
          description: values[2] as string,
          category: values[3] as string,
        });
      }
      return Promise.resolve([]);
    });

    await syncBuiltinTools(sql);

    expect(capturedTools).toHaveLength(27);
    for (const tool of capturedTools) {
      expect(tool.toolName).toBeTruthy();
      expect(typeof tool.toolName).toBe('string');
      expect(tool.displayName).toBeTruthy();
      expect(typeof tool.displayName).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(tool.category).toBeTruthy();
      expect(typeof tool.category).toBe('string');
    }
  });

  it('categories are from expected set', async () => {
    const { sql, fn } = createMockSql();
    const expectedCategories = new Set(['inventory', 'orders', 'crm', 'kb', 'write']);
    const capturedCategories: string[] = [];

    fn.mockImplementation((...args: unknown[]) => {
      const values = args.slice(1);
      if (values.length >= 4) {
        capturedCategories.push(values[3] as string);
      }
      return Promise.resolve([]);
    });

    await syncBuiltinTools(sql);

    for (const category of capturedCategories) {
      expect(expectedCategories.has(category)).toBe(true);
    }

    // All expected categories should be present
    const uniqueCategories = new Set(capturedCategories);
    expect(uniqueCategories).toEqual(expectedCategories);
  });
});

// ---------------------------------------------------------------------------
// syncBuiltinTools
// ---------------------------------------------------------------------------

describe('syncBuiltinTools', () => {
  it('calls INSERT for each builtin tool plus deactivation cleanup', async () => {
    const { sql, fn } = createMockSql();
    fn.mockResolvedValue([]);

    await syncBuiltinTools(sql);

    // 27 INSERTs + 1 UPDATE for stale deactivation
    expect(fn).toHaveBeenCalledTimes(28);
  });
});

// ---------------------------------------------------------------------------
// getRegisteredTools
// ---------------------------------------------------------------------------

describe('getRegisteredTools', () => {
  it('returns mapped tool registry entries', async () => {
    const mockRows = [
      {
        id: 'uuid-1',
        tool_name: 'list_products',
        display_name: 'List Products',
        description: 'List products with pagination',
        category: 'inventory',
        source: 'builtin',
        source_doc_id: null,
        is_active: true,
        parameters: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
      {
        id: 'uuid-2',
        tool_name: 'search_kb',
        display_name: 'Search KB',
        description: 'Search knowledge base',
        category: 'kb',
        source: 'builtin',
        source_doc_id: null,
        is_active: false,
        parameters: { query: 'string' },
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-03T00:00:00Z',
      },
    ];

    const { sql } = createMockSql(mockRows);

    const result = await getRegisteredTools(sql);

    expect(result).toHaveLength(2);

    expect(result[0]).toEqual({
      id: 'uuid-1',
      toolName: 'list_products',
      displayName: 'List Products',
      description: 'List products with pagination',
      category: 'inventory',
      source: 'builtin',
      sourceDocId: null,
      isActive: true,
      parameters: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });

    expect(result[1]).toEqual({
      id: 'uuid-2',
      toolName: 'search_kb',
      displayName: 'Search KB',
      description: 'Search knowledge base',
      category: 'kb',
      source: 'builtin',
      sourceDocId: null,
      isActive: false,
      parameters: { query: 'string' },
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-03T00:00:00Z',
    });
  });

  it('returns empty array when no tools registered', async () => {
    const { sql } = createMockSql([]);

    const result = await getRegisteredTools(sql);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getActiveToolNames
// ---------------------------------------------------------------------------

describe('getActiveToolNames', () => {
  it('returns only active tool names', async () => {
    const mockRows = [
      { tool_name: 'get_product' },
      { tool_name: 'list_orders' },
      { tool_name: 'search_kb' },
    ];

    const { sql } = createMockSql(mockRows);

    const result = await getActiveToolNames(sql);

    expect(result).toEqual(['get_product', 'list_orders', 'search_kb']);
  });

  it('returns empty array when no active tools', async () => {
    const { sql } = createMockSql([]);

    const result = await getActiveToolNames(sql);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// registerToolFromDoc
// ---------------------------------------------------------------------------

describe('registerToolFromDoc', () => {
  it('calls SQL with correct parameters for youtrack source', async () => {
    const { sql, fn } = createMockSql();
    fn.mockResolvedValue([]);

    const toolDef = {
      toolName: 'custom_report',
      displayName: 'Custom Report',
      description: 'Generate a custom report from YouTrack data',
      category: 'kb',
      sourceDocId: 'doc-123',
      source: 'youtrack' as const,
    };

    await registerToolFromDoc(sql, toolDef);

    expect(fn).toHaveBeenCalledTimes(1);

    // Verify the interpolated values passed to the tagged template
    const callArgs = fn.mock.calls[0];
    const values = callArgs.slice(1);
    expect(values).toContain('custom_report');
    expect(values).toContain('Custom Report');
    expect(values).toContain('Generate a custom report from YouTrack data');
    expect(values).toContain('kb');
    expect(values).toContain('youtrack');
    expect(values).toContain('doc-123');
  });

  it('calls SQL with correct parameters for uploaded source', async () => {
    const { sql, fn } = createMockSql();
    fn.mockResolvedValue([]);

    const toolDef = {
      toolName: 'uploaded_tool',
      displayName: 'Uploaded Tool',
      description: 'A tool from an uploaded doc',
      category: 'write',
      sourceDocId: 'upload-456',
      source: 'uploaded' as const,
    };

    await registerToolFromDoc(sql, toolDef);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
