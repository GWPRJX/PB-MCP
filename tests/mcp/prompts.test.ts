import { describe, it, expect, beforeEach, vi } from 'vitest';

import { registerPrompts } from '../../src/mcp/prompts.js';

describe('registerPrompts()', () => {
  const mockServer = { prompt: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers 6 prompts on the server', () => {
    registerPrompts(mockServer as any);
    expect(mockServer.prompt).toHaveBeenCalledTimes(6);
  });

  it('prompt names match expected set', () => {
    registerPrompts(mockServer as any);
    const names = mockServer.prompt.mock.calls.map((call: unknown[]) => call[0]);
    expect(names).toEqual([
      'inventory_report',
      'overdue_followup',
      'order_lookup',
      'stock_reorder',
      'new_customer_onboard',
      'kb_research',
    ]);
  });

  it('each zero-arg prompt returns valid GetPromptResult shape', async () => {
    registerPrompts(mockServer as any);

    const zeroArgPrompts = mockServer.prompt.mock.calls.filter(
      (call: unknown[]) => call.length === 3,
    );

    for (const call of zeroArgPrompts) {
      const cb = call[2] as () => Promise<unknown>;
      const result = await cb() as { messages: Array<{ role: string; content: { type: string; text: string } }> };

      expect(result.messages).toBeInstanceOf(Array);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
      expect(typeof result.messages[0].content.text).toBe('string');
    }
  });

  it('order_lookup prompt includes customer name in message', async () => {
    registerPrompts(mockServer as any);

    const call = mockServer.prompt.mock.calls.find(
      (c: unknown[]) => c[0] === 'order_lookup',
    );
    // 4-arg: (name, description, schema, cb)
    const cb = call[3] as (args: { customer_name: string }) => Promise<{ messages: Array<{ content: { text: string } }> }>;
    const result = await cb({ customer_name: 'Acme Corp' });

    expect(result.messages[0].content.text).toContain('Acme Corp');
    expect(result.messages[0].content.text).toContain('search_contacts');
  });

  it('kb_research prompt includes topic in message', async () => {
    registerPrompts(mockServer as any);

    const call = mockServer.prompt.mock.calls.find(
      (c: unknown[]) => c[0] === 'kb_research',
    );
    // 4-arg: (name, description, schema, cb)
    const cb = call[3] as (args: { topic: string }) => Promise<{ messages: Array<{ content: { text: string } }> }>;
    const result = await cb({ topic: 'inventory management' });

    expect(result.messages[0].content.text).toContain('inventory management');
    expect(result.messages[0].content.text).toContain('search_kb');
  });

  it('write-operation prompts include warning in description', () => {
    registerPrompts(mockServer as any);

    const stockReorder = mockServer.prompt.mock.calls.find(
      (c: unknown[]) => c[0] === 'stock_reorder',
    );
    const newCustomer = mockServer.prompt.mock.calls.find(
      (c: unknown[]) => c[0] === 'new_customer_onboard',
    );

    // Description is the 2nd argument
    expect(stockReorder[1]).toContain('write');
    expect(newCustomer[1]).toContain('write');
  });
});
