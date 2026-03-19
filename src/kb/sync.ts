import { createHash } from 'crypto';
import postgres from 'postgres';
import { sql } from '../db/client.js';
import { getSettings } from '../admin/settings-service.js';

export interface SyncResult {
  article_count: number;
  synced_at: Date;
}

interface YouTrackArticle {
  id: string;
  idReadable: string;
  summary: string;
  content?: string;
  tags?: Array<{ name: string }>;
}

/**
 * Fetch all KB articles from YouTrack using paginated $top/$skip loop,
 * then atomically replace all rows in kb_articles (DELETE + INSERT in one transaction).
 *
 * KB-01: pulls articles from YouTrack REST API
 * KB-02: uses $top/$skip pagination loop
 * KB-07: single transaction ensures partial failures leave existing cache intact
 */
export async function syncKbArticles(): Promise<SyncResult> {
  const dbSettings = await getSettings();
  const baseUrl = dbSettings.youtrackBaseUrl || process.env.YOUTRACK_BASE_URL;
  const token = dbSettings.youtrackToken || process.env.YOUTRACK_TOKEN;
  const project = dbSettings.youtrackProject || (process.env.YOUTRACK_PROJECT ?? 'P8');

  if (!baseUrl || !token) {
    process.stderr.write('[kb/sync] WARNING: YouTrack credentials not configured (neither DB nor env vars) -- skipping sync\n');
    return { article_count: 0, synced_at: new Date() };
  }

  const articles: YouTrackArticle[] = [];
  const pageSize = 100;
  let skip = 0;

  while (true) {
    const fields = 'id,idReadable,summary,content,tags(name),parentArticle(id,idReadable,summary)';
    const url = `${baseUrl}/api/articles?fields=${fields}&query=project:${project}&$top=${pageSize}&$skip=${skip}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[kb/sync] YouTrack API error ${res.status}: ${text}`);
    }

    const page: YouTrackArticle[] = await res.json() as YouTrackArticle[];
    articles.push(...page);

    if (page.length < pageSize) {
      break;
    }
    skip += pageSize;
  }

  process.stderr.write(`[kb/sync] Fetched ${articles.length} articles from YouTrack project:${project}\n`);

  const syncedAt = new Date();

  await sql.begin(async (tx) => {
    // Cast required: TransactionSql extends Omit<Sql, 'begin' | ...> which drops
    // the tagged-template call signature in TypeScript strict mode.
    // The cast is safe — TransactionSql retains the template tag at runtime.
    const txSql = tx as unknown as postgres.Sql;

    await txSql`DELETE FROM kb_articles`;

    if (articles.length > 0) {
      for (const a of articles) {
        const tags = (a.tags ?? []).map((t) => t.name);
        const contentHash = a.content
          ? createHash('sha256').update(a.content).digest('hex')
          : null;
        // Pass tags as a cast literal to avoid cross-connection sql.array() issues.
        // Pass synced_at as ISO string to avoid Date serialization issues in cast tx.
        const tagsLiteral = `{${tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(',')}}`;
        await txSql`
          INSERT INTO kb_articles (youtrack_id, summary, content, tags, synced_at, content_hash)
          VALUES (
            ${a.idReadable},
            ${a.summary},
            ${a.content ?? null},
            ${tagsLiteral}::text[],
            ${syncedAt.toISOString()}::timestamptz,
            ${contentHash}
          )
        `;
      }
    }
  });

  process.stderr.write(`[kb/sync] Sync complete: ${articles.length} articles stored\n`);
  return { article_count: articles.length, synced_at: syncedAt };
}
