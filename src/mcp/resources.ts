import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { sql } from '../db/client.js';
import { logger } from '../logger.js';

/**
 * Register KB article resources on the MCP server.
 * Exposes kb://articles (list) and kb://articles/{id} (read individual) resources.
 */
export function registerKbResources(server: McpServer): void {
  // Static resource — list all KB articles as JSON
  server.resource(
    'kb-articles',
    'kb://articles',
    { description: 'List all YouTrack KB articles', mimeType: 'application/json' },
    async () => {
      try {
        const articles = await sql`SELECT youtrack_id, summary, tags FROM kb_articles ORDER BY summary`;
        return { contents: [{ uri: 'kb://articles', text: JSON.stringify(articles), mimeType: 'application/json' }] };
      } catch (err) {
        logger.error({ err }, 'Failed to read KB articles list');
        return { contents: [{ uri: 'kb://articles', text: '[]', mimeType: 'application/json' }] };
      }
    }
  );

  // Template resource — read individual article by YouTrack ID
  server.resource(
    'kb-article',
    new ResourceTemplate('kb://articles/{id}', {
      list: async () => {
        try {
          return {
            resources: (await sql`SELECT youtrack_id, summary FROM kb_articles ORDER BY summary`)
              .map((a) => ({
                uri: `kb://articles/${a.youtrack_id}`,
                name: a.summary as string,
                mimeType: 'text/markdown',
              })),
          };
        } catch (err) {
          logger.error({ err }, 'Failed to list KB article resources');
          return { resources: [] };
        }
      },
    }),
    { description: 'Read a specific KB article by YouTrack ID', mimeType: 'text/markdown' },
    async (uri, { id }) => {
      try {
        const rows = await sql`SELECT content FROM kb_articles WHERE youtrack_id = ${id}`;
        return { contents: [{ uri: uri.href, text: rows[0]?.content ?? 'Article not found', mimeType: 'text/markdown' }] };
      } catch (err) {
        logger.error({ err }, 'Failed to read KB article');
        return { contents: [{ uri: uri.href, text: 'Error reading article', mimeType: 'text/markdown' }] };
      }
    }
  );
}
