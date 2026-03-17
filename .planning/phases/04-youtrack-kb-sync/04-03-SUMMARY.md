---
plan: 04-03
phase: 04-youtrack-kb-sync
status: complete
completed: 2026-03-17
subsystem: kb-tools
tags: [kb, mcp-tools, search, admin-api, scheduler]
dependency-graph:
  requires: [04-01, 04-02]
  provides: [search_kb, get_kb_article, get_kb_sync_status, POST /admin/kb/refresh]
  affects: [src/mcp/server.ts, src/admin/router.ts, src/index.ts]
tech-stack:
  added: []
  patterns: [global-table-no-rls, tool-success-error-helpers, per-request-stateless-mcp]
key-files:
  created:
    - src/tools/kb.ts
    - tests/tools/kb.test.ts
  modified:
    - src/mcp/server.ts
    - src/admin/router.ts
    - src/index.ts
    - tests/mcp/transport.test.ts
    - tests/mcp/auth.test.ts
decisions:
  - KB tools query kb_articles via global sql pool — no getTenantId()/withTenantContext() (locked)
  - search_kb returns summaries only — no content field in results
  - get_kb_sync_status handles postgres returning MAX(synced_at) as string (not Date)
metrics:
  duration: ~10 minutes
  tasks: 3
  files_created: 2
  files_modified: 5
---

# Phase 4 Plan 03: KB MCP Tools Summary

## One-liner

Three KB MCP tools (search_kb, get_kb_article, get_kb_sync_status) backed by global kb_articles table — no RLS, no tenant context.

## Files Created/Modified

- `src/tools/kb.ts` — registerKbTools() with 3 tools: search_kb, get_kb_article, get_kb_sync_status
- `src/mcp/server.ts` — registerKbTools(server) added (21 tools total: 7 INV + 6 ORD + 5 CRM + 3 KB)
- `src/admin/router.ts` — POST /admin/kb/refresh added, imports syncKbArticles
- `src/index.ts` — startKbScheduler() called at startup (skipped when NODE_ENV=test)
- `tests/tools/kb.test.ts` — full implementation, no todos remaining (9 tests)
- `tests/mcp/transport.test.ts` — updated tool count 18 -> 21 (auto-fix)
- `tests/mcp/auth.test.ts` — updated tool count 18 -> 21 (auto-fix)

## KB Tools

1. **search_kb**: ILIKE search on summary+content, returns summaries only (no content field), limit/offset pagination with next_cursor
2. **get_kb_article**: full article by youtrack_id (includes content, tags, content_hash), NOT_FOUND on miss
3. **get_kb_sync_status**: `{ last_synced_at: ISO|null, article_count: number }` — null when table empty

## Admin Endpoint

- `POST /admin/kb/refresh` → syncKbArticles() → `{ synced: true, article_count: N }`

## Test Results

- `tests/tools/kb.test.ts`: 9/9 passed
- Full suite: 107/107 passed (14 test files)
- TypeScript: 0 errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] postgres MAX(synced_at) returns string not Date**
- **Found during:** Task 3 (test run)
- **Issue:** `lastSyncedAt.toISOString is not a function` — postgres returns aggregate results as strings
- **Fix:** Added instanceof/typeof guard in get_kb_sync_status to handle both Date and string values
- **Files modified:** `src/tools/kb.ts`
- **Commit:** 599c319

**2. [Rule 1 - Bug] Stale tool count assertions (18 expected, 21 actual)**
- **Found during:** Task 3 (full suite run)
- **Issue:** tests/mcp/transport.test.ts and tests/mcp/auth.test.ts checked for 18 tools; adding 3 KB tools broke them
- **Fix:** Updated both assertions and comments to 21, added search_kb spot-check in transport test
- **Files modified:** `tests/mcp/transport.test.ts`, `tests/mcp/auth.test.ts`
- **Commit:** 599c319

## Self-Check: PASSED

- src/tools/kb.ts: FOUND
- tests/tools/kb.test.ts: FOUND
- Commit 5cdeacb: FOUND
- Commit 599c319: FOUND
