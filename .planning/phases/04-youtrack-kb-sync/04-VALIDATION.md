# Phase 4: YouTrack KB Sync — Validation Criteria

**Phase:** 04-youtrack-kb-sync
**Created:** 2026-03-17
**Status:** Pre-execution (plans ready)

---

## Goal-Backward Verification

**Goal:** AI clients can search live YouTrack API documentation, and the sync worker keeps the local PostgreSQL cache current automatically.

### Observable Truths (must be TRUE when phase is complete)

1. `npx vitest run` exits 0 — all tests in tests/kb/ and tests/tools/kb.test.ts pass
2. `npx tsc --noEmit` exits 0 — no TypeScript errors
3. `syncKbArticles()` can be called programmatically; it fetches from YouTrack (or a mock), performs a single transaction DELETE+INSERT, and populates `kb_articles` — a second call updates `synced_at`
4. `tools/list` includes `search_kb`, `get_kb_article`, and `get_kb_sync_status` alongside the 18 ERP tools (21 tools total)
5. `search_kb({ query: "API" })` returns `{ items, total_count, next_cursor }` where each item has `youtrack_id`, `summary`, `tags`, and `synced_at` but NOT `content`
6. `get_kb_article({ article_id: "P8-A-7" })` returns the full article including `content`
7. `get_kb_article({ article_id: "nonexistent" })` returns `{ isError: true, content: [{ text: '{"code":"NOT_FOUND"...}' }] }`
8. `get_kb_sync_status({})` returns `{ last_synced_at: string | null, article_count: number }`
9. `POST /admin/kb/refresh` with valid `X-Admin-Secret` triggers `syncKbArticles()` and returns `{ synced: true, article_count: N }`
10. `POST /admin/kb/refresh` with missing/invalid `X-Admin-Secret` returns HTTP 401
11. Scheduler starts at server startup using `KB_SYNC_INTERVAL_MS` (default 30 min); it does NOT run during vitest
12. If `YOUTRACK_BASE_URL` or `YOUTRACK_TOKEN` are absent, sync logs a warning to stderr and returns early — server still starts
13. No `console.log` or `console.error` anywhere in `src/kb/` or `src/tools/kb.ts` — only `process.stderr.write()`

---

## Required Artifacts

| File | Purpose | Required By |
|------|---------|-------------|
| `src/db/schema.ts` | Extended with `kbArticles` table definition | KB tools (TypeScript types) |
| `src/kb/sync.ts` | `syncKbArticles()` — fetch + atomic upsert | KB-01, KB-02, KB-07 |
| `src/kb/scheduler.ts` | `startKbScheduler()` — setInterval wrapper | KB-03, KB-05 |
| `src/tools/kb.ts` | `registerKbTools(server)` — 3 MCP tools | KB-04 (search), KB-05 (get), KB-06 (status) |
| `src/mcp/server.ts` | Import and call `registerKbTools(server)` | All KB MCP tools |
| `src/admin/router.ts` | `POST /admin/kb/refresh` route | KB-04 (refresh trigger) |
| `src/index.ts` | Call `startKbScheduler()` at startup | KB-03, KB-05 |
| `tests/kb/sync.test.ts` | Sync worker integration tests | KB-01, KB-02, KB-07 |
| `tests/tools/kb.test.ts` | MCP KB tool integration tests | KB-04, KB-05, KB-06 |

---

## Key Links (critical wiring)

| From | To | Via | Break symptom |
|------|----|-----|---------------|
| `src/mcp/server.ts` | `src/tools/kb.ts` | `registerKbTools(server)` | KB tools missing from tools/list |
| `src/index.ts` | `src/kb/scheduler.ts` | `startKbScheduler()` call | Auto-sync never runs |
| `src/admin/router.ts` | `src/kb/sync.ts` | `syncKbArticles()` call | Refresh endpoint does nothing |
| `src/tools/kb.ts` | `src/db/client.ts` | `sql` direct (no withTenantContext) | KB tools fail or crash |
| `src/kb/sync.ts` | `src/db/client.ts` | `sql.begin(tx => ...)` transaction | Write-then-swap not atomic |
| `search_kb handler` | `kb_articles` | `WHERE summary ILIKE OR content ILIKE` | No search results returned |
| `get_kb_article handler` | `kb_articles` | `WHERE youtrack_id = $article_id` | Article lookup fails |

---

## Requirement Coverage

| Requirement | Description | Plan | Tool/Artifact |
|-------------|-------------|------|---------------|
| KB-01 | Sync worker pulls articles from YouTrack | 04-02 | `src/kb/sync.ts` |
| KB-02 | Paginated `$top`/`$skip` loop | 04-02 | `src/kb/sync.ts` |
| KB-03 | Scheduled auto-sync | 04-02 | `src/kb/scheduler.ts` |
| KB-04 | `refresh_kb` admin endpoint | 04-03 | `POST /admin/kb/refresh` |
| KB-05 | `get_kb_article` MCP tool | 04-03 | `src/tools/kb.ts` |
| KB-06 | `get_kb_sync_status` MCP tool | 04-03 | `src/tools/kb.ts` |
| KB-07 | Atomic write-then-swap | 04-02 | `src/kb/sync.ts` |
| KB-08 | Self-configuration | DEFERRED | — |

---

## Automated Verification Commands

Run after all plans complete and human checkpoint approved:

```bash
# 1. Full test suite — must exit 0
npx vitest run 2>&1 | tail -20

# 2. TypeScript check — no errors
npx tsc --noEmit 2>&1 | head -10

# 3. No stdout writes in kb files
grep -rn "console\.log\|console\.error" src/kb/ src/tools/kb.ts 2>/dev/null && echo "FAIL: stdout writes found" || echo "OK: no stdout writes"

# 4. All 3 KB tools registered
grep -c "server\.tool(" src/tools/kb.ts

# 5. Correct column name used (youtrack_id, not article_id)
grep -q "youtrack_id" src/tools/kb.ts && echo "OK: youtrack_id used" || echo "FAIL: wrong column name"

# 6. Atomic swap pattern present in sync.ts
grep -q "DELETE FROM kb_articles" src/kb/sync.ts && echo "OK: delete in sync" || echo "FAIL: no delete"

# 7. tools/list count (should be 21 now: 18 ERP + 3 KB)
# Run via MCP Inspector or curl once server is live
```

---

*Phase: 04-youtrack-kb-sync*
*Validation created: 2026-03-17*
