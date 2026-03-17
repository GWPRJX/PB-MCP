import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import { createMcpServer } from '../../src/mcp/server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extractAndValidateApiKey } from '../../src/mcp/auth.js';
import postgres from 'postgres';

// Wave 3 (04-03-PLAN.md) implements this file.
// Stubs are it.todo() so vitest exits 0 before implementation.

describe('search_kb tool (KB-06)', () => {
  it.todo('returns { items, total_count, next_cursor } matching articles by summary ILIKE');
  it.todo('returns { items, total_count, next_cursor } matching articles by content ILIKE');
  it.todo('returns items without content field (summaries only)');
  it.todo('returns empty items array when no articles match the query');
  it.todo('respects limit and offset pagination parameters');
});

describe('get_kb_article tool (KB-05)', () => {
  it.todo('returns full article including content by youtrack_id');
  it.todo('returns isError NOT_FOUND for unknown youtrack_id');
});

describe('get_kb_sync_status tool (KB-06)', () => {
  it.todo('returns { last_synced_at, article_count } — last_synced_at is null when no articles exist');
  it.todo('returns article_count matching actual row count in kb_articles');
});
