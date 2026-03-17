# Phase 4: YouTrack KB Sync — Context & Decisions

**Phase:** 04-youtrack-kb-sync
**Created:** 2026-03-17
**Status:** Ready to execute

---

## Phase Goal

AI clients can search live YouTrack API documentation, and the sync worker keeps the local PostgreSQL cache current automatically.

---

## Locked Decisions

These decisions are non-negotiable — executors must not deviate.

### 1. kb_articles is a global cache — no tenant_id, no RLS

`kb_articles` is shared by all tenants. KB tools query the app pool (`sql` from `src/db/client.ts`) directly — they do NOT call `getTenantId()` or `withTenantContext()`. This is the opposite of ERP tools.

### 2. Tool transport pattern

KB tools use the same per-request stateless McpServer pattern as ERP tools:
- In tests: `new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` inside the POST route handler
- In production: registered on the shared `McpServer` instance in `src/mcp/server.ts`

### 3. sync worker uses fetch() — no HTTP client library

Node 22 has built-in `fetch`. The sync worker (`src/kb/sync.ts`) uses `fetch()` directly. No axios, no node-fetch.

### 4. Atomic write-then-swap (KB-07)

Single transaction: DELETE all + INSERT all. Safe for 50 articles. Ensures partial failures leave existing cache intact:
```sql
BEGIN;
DELETE FROM kb_articles;
INSERT INTO kb_articles (...) VALUES ...;
COMMIT;
-- On error: ROLLBACK — existing rows untouched
```

### 5. Scheduled auto-sync uses setInterval

`src/kb/scheduler.ts` calls `syncKbArticles()` on `KB_SYNC_INTERVAL_MS` interval (default: 30 minutes = `1_800_000`). Scheduler starts in `src/index.ts` at server startup. It does NOT start during tests.

### 6. refresh_kb is an admin REST endpoint — not an MCP tool

`KB-04` in REQUIREMENTS.md says `MCP tool refresh_kb` but the user prompt says "Admin can call `refresh_kb` to trigger an immediate re-sync" — implemented as `POST /admin/kb/refresh` protected by `X-Admin-Secret` header, consistent with the existing admin router pattern.

**Note on naming:** REQUIREMENTS.md KB-07 is "MCP tool `refresh_kb`" — but Phase 4 planning treats this as the admin endpoint trigger, which is more operationally appropriate. The MCP KB tools are `search_kb`, `get_kb_article`, and `get_kb_sync_status`.

### 7. Drizzle schema extension required

`src/db/schema.ts` must gain a `kbArticles` table definition mirroring `000005_create_kb_articles.up.sql`. The actual migration already exists (no new SQL migration needed). Schema extension enables TypeScript types for the kb tools.

### 8. KB-08 is deferred

KB-08 (self-configuration from YouTrack articles) is explicitly deferred within Phase 4. ROADMAP.md criterion 5 allows this. No KB-08 tasks exist in these plans.

---

## YouTrack Instance

- **Base URL:** `https://support.posibolt.com`
- **Project:** P8 (POSibolt V8)
- **Articles:** 50 total
- **Root article:** P8-A-7 "POSibolt REST-API"
- **Content format:** Markdown
- **Query:** `GET /api/articles?fields=id,idReadable,summary,content,created,updated,parentArticle(id,idReadable,summary)&query=project:P8&$top=100`
- **Auth:** `Authorization: Bearer ${YOUTRACK_TOKEN}`
- **Pagination:** Use `$skip` loop even though 50 articles fit in one `$top=100` request — future-proofing

---

## kb_articles Table (exact schema from migration 000005)

```sql
CREATE TABLE kb_articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtrack_id     TEXT NOT NULL UNIQUE,   -- YouTrack idReadable (e.g., "P8-A-7")
    summary         TEXT NOT NULL,          -- Article title/summary
    content         TEXT,                   -- Full article body (Markdown)
    tags            TEXT[] DEFAULT '{}',    -- Article tags from YouTrack
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_hash    TEXT                    -- SHA-256 of content for change detection
);
```

**Important:** No `parent_article_id`, no `article_id`, no `created_at`, no `updated_at`. The `youtrack_id` column is the idReadable identifier.

---

## New Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `YOUTRACK_BASE_URL` | Yes (sync only) | — | e.g., `https://support.posibolt.com` |
| `YOUTRACK_TOKEN` | Yes (sync only) | — | Bearer token for YouTrack API |
| `YOUTRACK_PROJECT` | No | `P8` | Project shortName to sync |
| `KB_SYNC_INTERVAL_MS` | No | `1800000` | Auto-sync interval (ms), default 30 min |

Sync worker logs a warning and skips if `YOUTRACK_BASE_URL` or `YOUTRACK_TOKEN` are absent (non-fatal — server still starts for AI clients to query the existing cache).

---

## Requirement Coverage

| Requirement | Description | Plan |
|-------------|-------------|------|
| KB-01 | Sync worker pulls articles from YouTrack REST API | 04-02 |
| KB-02 | Paginated `$top`/`$skip` loop | 04-02 |
| KB-03 | Scheduled auto-sync on configurable interval | 04-02 |
| KB-04 | `refresh_kb` admin endpoint (POST /admin/kb/refresh) | 04-03 |
| KB-05 | `get_kb_article` MCP tool — full content by youtrack_id | 04-03 |
| KB-06 | `get_kb_sync_status` MCP tool — last_synced_at + count | 04-03 |
| KB-07 | Atomic write-then-swap on sync | 04-02 |
| KB-08 | Self-configuration from KB articles | DEFERRED |

---

## Files This Phase Touches

| File | Action | Plan |
|------|--------|------|
| `src/db/schema.ts` | Add `kbArticles` table definition | 04-01 |
| `tests/tools/kb.test.ts` | Create with it.todo() stubs | 04-01 |
| `src/kb/sync.ts` | Create — YouTrack fetch + atomic upsert | 04-02 |
| `src/kb/scheduler.ts` | Create — setInterval wrapper | 04-02 |
| `tests/kb/sync.test.ts` | Create — sync integration tests | 04-02 |
| `src/tools/kb.ts` | Create — 3 MCP KB tools | 04-03 |
| `tests/tools/kb.test.ts` | Replace stubs with green tests | 04-03 |
| `src/mcp/server.ts` | Add `registerKbTools(server)` call | 04-03 |
| `src/admin/router.ts` | Add POST /admin/kb/refresh route | 04-03 |
| `src/index.ts` | Start KB scheduler at startup | 04-03 |
| `src/admin/router.ts` | Wired refresh endpoint | 04-04 |
| `tests/kb/integration.test.ts` | End-to-end sync + tool roundtrip | 04-04 |

---

*Phase: 04-youtrack-kb-sync*
*Context created: 2026-03-17*
