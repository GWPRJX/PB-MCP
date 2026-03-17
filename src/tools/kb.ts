import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { sql } from '../db/client.js';
import { toolError, toolSuccess } from './errors.js';

/**
 * Register all 3 KB MCP tools on the provided McpServer instance.
 *
 * IMPORTANT: KB tools query kb_articles directly via the app pool (sql).
 * They do NOT call getTenantId() or withTenantContext() — kb_articles has no
 * tenant_id and no RLS. This is intentional (locked decision from Phase 1).
 */
export function registerKbTools(server: McpServer): void {
  // search_kb — keyword search across summary and content
  server.tool(
    'search_kb',
    'Search the YouTrack KB for articles matching a keyword or phrase. Returns article summaries (no full content). Use get_kb_article to retrieve full content of a specific article.',
    {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ query, limit = 20, offset = 0 }) => {
      try {
        const pattern = `%${query}%`;
        const [{ count }] = await sql`
          SELECT COUNT(*) AS count FROM kb_articles
          WHERE summary ILIKE ${pattern} OR content ILIKE ${pattern}
        ` as [{ count: string }];
        const totalCount = parseInt(count, 10);

        const items = await sql`
          SELECT youtrack_id, summary, tags, synced_at
          FROM kb_articles
          WHERE summary ILIKE ${pattern} OR content ILIKE ${pattern}
          ORDER BY summary ASC
          LIMIT ${limit} OFFSET ${offset}
        `;

        const nextCursor = offset + items.length < totalCount ? offset + limit : null;
        return toolSuccess({ items, total_count: totalCount, next_cursor: nextCursor });
      } catch (err) {
        process.stderr.write(`[tools/kb] search_kb error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // get_kb_article — full article content by youtrack_id
  server.tool(
    'get_kb_article',
    'Get the full content of a specific KB article by its YouTrack article ID (e.g., "P8-A-7"). Returns Markdown content.',
    {
      article_id: z.string().min(1),
    },
    async ({ article_id }) => {
      try {
        const rows = await sql`
          SELECT youtrack_id, summary, content, tags, synced_at, content_hash
          FROM kb_articles
          WHERE youtrack_id = ${article_id}
        `;
        if (rows.length === 0) {
          return toolError('NOT_FOUND', `KB article not found: ${article_id}`);
        }
        return toolSuccess(rows[0]);
      } catch (err) {
        process.stderr.write(`[tools/kb] get_kb_article error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );

  // get_kb_sync_status — last sync timestamp and article count
  server.tool(
    'get_kb_sync_status',
    'Get the timestamp of the last KB sync and the total number of cached articles. Useful for checking whether the KB cache is up to date.',
    {},
    async () => {
      try {
        const [{ count }] = await sql`
          SELECT COUNT(*) AS count FROM kb_articles
        ` as [{ count: string }];
        const articleCount = parseInt(count, 10);

        const lastSyncedRows = await sql`
          SELECT MAX(synced_at) AS last_synced_at FROM kb_articles
        ` as [{ last_synced_at: Date | string | null }];

        const rawLastSynced = lastSyncedRows[0]?.last_synced_at ?? null;
        let lastSyncedAtIso: string | null = null;
        if (rawLastSynced instanceof Date) {
          lastSyncedAtIso = rawLastSynced.toISOString();
        } else if (typeof rawLastSynced === 'string') {
          lastSyncedAtIso = rawLastSynced;
        }

        return toolSuccess({
          last_synced_at: lastSyncedAtIso,
          article_count: articleCount,
        });
      } catch (err) {
        process.stderr.write(`[tools/kb] get_kb_sync_status error: ${err instanceof Error ? err.message : String(err)}\n`);
        return toolError('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  );
}
