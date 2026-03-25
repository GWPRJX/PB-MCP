import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockLogger, mockSql } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  mockSql: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../src/db/client.js', () => ({ sql: mockSql }));

import { registerKbResources } from '../../src/mcp/resources.js';

describe('registerKbResources()', () => {
  const mockServer = { resource: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
  });

  it('registers 2 resources on the server', () => {
    registerKbResources(mockServer as any);
    expect(mockServer.resource).toHaveBeenCalledTimes(2);
  });

  it('registers static kb://articles resource', () => {
    registerKbResources(mockServer as any);
    const [name, uri] = mockServer.resource.mock.calls[0];
    expect(name).toBe('kb-articles');
    expect(uri).toBe('kb://articles');
  });

  it('registers template kb://articles/{id} resource', () => {
    registerKbResources(mockServer as any);
    const [name, template] = mockServer.resource.mock.calls[1];
    expect(name).toBe('kb-article');
    expect(template).toBeDefined();
    expect(template.uriTemplate).toBeDefined();
  });

  it('static resource returns all articles as JSON', async () => {
    registerKbResources(mockServer as any);

    // Extract the read callback (4th arg: name, uri, metadata, callback)
    const readCallback = mockServer.resource.mock.calls[0][3];

    const mockArticles = [
      { youtrack_id: 'P8-A-1', summary: 'Getting Started', tags: ['intro'] },
      { youtrack_id: 'P8-A-2', summary: 'REST API', tags: ['api'] },
    ];
    mockSql.mockResolvedValueOnce(mockArticles);

    const result = await readCallback();
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('kb://articles');
    expect(result.contents[0].mimeType).toBe('application/json');
    expect(JSON.parse(result.contents[0].text)).toEqual(mockArticles);
  });

  it('template resource returns single article content as Markdown', async () => {
    registerKbResources(mockServer as any);

    // Extract the read callback (4th arg: name, template, metadata, callback)
    const readCallback = mockServer.resource.mock.calls[1][3];

    mockSql.mockResolvedValueOnce([{ content: '# Hello World\nArticle body' }]);

    const result = await readCallback(new URL('kb://articles/P8-A-7'), { id: 'P8-A-7' });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toBe('# Hello World\nArticle body');
    expect(result.contents[0].mimeType).toBe('text/markdown');
  });

  it('template resource returns "Article not found" for unknown ID', async () => {
    registerKbResources(mockServer as any);

    const readCallback = mockServer.resource.mock.calls[1][3];

    mockSql.mockResolvedValueOnce([]); // no article found

    const result = await readCallback(new URL('kb://articles/UNKNOWN'), { id: 'UNKNOWN' });
    expect(result.contents[0].text).toBe('Article not found');
  });
});
