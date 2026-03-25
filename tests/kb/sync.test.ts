import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import postgres from 'postgres';

// Mock the structured pino logger so tests don't write to stderr
// and can assert on log calls.
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
};

vi.mock('../../src/logger.js', () => ({
  logger: mockLogger,
}));

const cleanSql = postgres(process.env.DATABASE_MIGRATION_URL ?? 'postgres://postgres:postgres@localhost:5432/pb_mcp');

function mockYouTrackFetch(articles: Array<{ idReadable: string; summary: string; content?: string; tags?: Array<{ name: string }> }>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => articles,
    text: async () => '',
  }));
}

beforeEach(async () => {
  vi.resetModules();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  await cleanSql`DELETE FROM kb_articles`;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanSql`DELETE FROM kb_articles`;
});

afterAll(async () => {
  await cleanSql.end();
});

describe('syncKbArticles()', () => {
  it('inserts fetched articles into kb_articles', async () => {
    process.env.YOUTRACK_BASE_URL = 'https://mock.example.com';
    process.env.YOUTRACK_TOKEN = 'mock-token';
    process.env.YOUTRACK_PROJECT = 'P8';

    mockYouTrackFetch([
      { idReadable: 'P8-A-1', summary: 'Getting Started', content: 'Hello world' },
      { idReadable: 'P8-A-2', summary: 'REST API', content: 'API docs here' },
    ]);

    const { syncKbArticles } = await import('../../src/kb/sync.js');
    const result = await syncKbArticles();

    expect(result.article_count).toBe(2);
    expect(result.synced_at).toBeInstanceOf(Date);

    const [{ count }] = await cleanSql`SELECT COUNT(*) AS count FROM kb_articles` as [{ count: string }];
    expect(parseInt(count, 10)).toBe(2);
  });

  it('second sync replaces all rows (atomic swap) — row count unchanged', async () => {
    process.env.YOUTRACK_BASE_URL = 'https://mock.example.com';
    process.env.YOUTRACK_TOKEN = 'mock-token';

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { idReadable: 'P8-A-1', summary: 'Article 1', content: 'body 1' },
        { idReadable: 'P8-A-2', summary: 'Article 2', content: 'body 2' },
      ], text: async () => '' })
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { idReadable: 'P8-A-1', summary: 'Article 1', content: 'body 1' },
        { idReadable: 'P8-A-2', summary: 'Article 2', content: 'body 2' },
      ], text: async () => '' })
    );

    const { syncKbArticles } = await import('../../src/kb/sync.js');
    await syncKbArticles();
    const result2 = await syncKbArticles();

    expect(result2.article_count).toBe(2);
    const [{ count }] = await cleanSql`SELECT COUNT(*) AS count FROM kb_articles` as [{ count: string }];
    expect(parseInt(count, 10)).toBe(2);
  });

  it('returns { article_count: 0 } and logs warning when YOUTRACK_BASE_URL absent', async () => {
    const savedUrl = process.env.YOUTRACK_BASE_URL;
    delete process.env.YOUTRACK_BASE_URL;

    const { syncKbArticles } = await import('../../src/kb/sync.js');
    const result = await syncKbArticles();

    expect(result.article_count).toBe(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('YouTrack credentials not configured'),
    );
    const [{ count }] = await cleanSql`SELECT COUNT(*) AS count FROM kb_articles` as [{ count: string }];
    expect(parseInt(count, 10)).toBe(0);

    process.env.YOUTRACK_BASE_URL = savedUrl;
  });

  it('stores content_hash for articles with content', async () => {
    process.env.YOUTRACK_BASE_URL = 'https://mock.example.com';
    process.env.YOUTRACK_TOKEN = 'mock-token';

    mockYouTrackFetch([
      { idReadable: 'P8-A-1', summary: 'Article with content', content: 'Some markdown body' },
    ]);

    const { syncKbArticles } = await import('../../src/kb/sync.js');
    await syncKbArticles();

    const [row] = await cleanSql`SELECT content_hash FROM kb_articles WHERE youtrack_id = 'P8-A-1'`;
    expect(row.content_hash).toBeTruthy();
    expect(typeof row.content_hash).toBe('string');
    expect(row.content_hash).toHaveLength(64);
  });
});
