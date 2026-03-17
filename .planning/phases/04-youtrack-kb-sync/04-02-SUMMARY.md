---
plan: 04-02
phase: 04-youtrack-kb-sync
subsystem: kb-sync
status: complete
completed: 2026-03-17
tags: [sync-worker, scheduler, youtrack, fetch, atomic-swap, kb-articles]
dependency_graph:
  requires: [04-01]
  provides: [syncKbArticles, startKbScheduler]
  affects: [src/kb/sync.ts, src/kb/scheduler.ts, tests/kb/sync.test.ts]
tech_stack:
  added: []
  patterns: [paginated-fetch, atomic-delete-insert, sha256-content-hash, setInterval-scheduler]
key_files:
  created:
    - src/kb/sync.ts
    - src/kb/scheduler.ts
    - tests/kb/sync.test.ts
  modified: []
decisions:
  - "Cast tx as unknown as postgres.Sql required inside sql.begin() — TransactionSql uses Omit<Sql,...> which drops call signatures in TypeScript strict mode; same pattern as withTenantContext"
  - "tags cast as ::text[] literal string inside txSql to avoid cross-connection sql.array() serialization conflict; synced_at passed as .toISOString()::timestamptz for same reason"
  - "vi.resetModules() added to beforeEach so each test gets a fresh module with current process.env values"
  - "Migration 000005_create_kb_articles.up.sql applied to database before tests could run (was not applied by plan 04-01)"
metrics:
  duration: "~7 minutes"
  completed: "2026-03-17"
  tasks_completed: 2
  files_changed: 3
---

# Phase 4 Plan 02: KB Sync Worker + Scheduler Summary

**One-liner:** Paginated YouTrack REST fetch with atomic DELETE+INSERT swap via sql.begin() transaction, plus setInterval scheduler defaulting to 30 minutes.

---

## Files Created

- `src/kb/sync.ts` — `syncKbArticles()` with paginated `$top/$skip` fetch + atomic DELETE+INSERT in one postgres.js transaction
- `src/kb/scheduler.ts` — `startKbScheduler()` setInterval wrapper (KB-03)
- `tests/kb/sync.test.ts` — 4 integration tests using `vi.stubGlobal('fetch')` for mocked HTTP

---

## syncKbArticles() Behavior

- Reads `YOUTRACK_BASE_URL`, `YOUTRACK_TOKEN`, `YOUTRACK_PROJECT` env vars
- Returns early with `{ article_count: 0 }` warning if `BASE_URL` or `TOKEN` absent
- Paginates with `$top=100`, `$skip` loop until `page.length < pageSize`
- Atomic swap: `sql.begin(tx => { DELETE FROM kb_articles; INSERT rows })` — rolls back on error (KB-07)
- Computes SHA-256 `content_hash` for articles with `content`
- Returns `{ article_count: N, synced_at: Date }`
- No `console.log` or `console.error` — only `process.stderr.write()`

---

## Test Results

| Test | Status |
|------|--------|
| inserts fetched articles into kb_articles | PASSED |
| second sync replaces all rows (atomic swap) — row count unchanged | PASSED |
| returns { article_count: 0 } and logs warning when YOUTRACK_BASE_URL absent | PASSED |
| stores content_hash for articles with content | PASSED |

```
Test Files  1 passed (1)
Tests       4 passed (4)
Duration    738ms
```

Full suite: 98 passing, 9 todo, 0 failures.

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TransactionSql call signature error**
- **Found during:** Task 1 TypeScript compile check
- **Issue:** `tx` parameter in `sql.begin()` is `TransactionSql` which uses `Omit<Sql, 'begin' | ...>` — TypeScript strict mode drops call signatures on Omit types, making `tx` not directly callable as a template tag
- **Fix:** Cast `tx as unknown as postgres.Sql` (same pattern as `withTenantContext` in `src/db/client.ts`)
- **Files modified:** `src/kb/sync.ts`
- **Commit:** 3fd3f2c

**2. [Rule 1 - Bug] Date serialization error inside cast TransactionSql**
- **Found during:** Task 2 test run
- **Issue:** `sql.array(tags)` from the outer connection used inside `txSql` (cast transaction) caused postgres.js to fail serializing the `Date` value for `synced_at`: "The string argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Date"
- **Fix:** Pass `tags` as a cast literal string `{...}::text[]` and `syncedAt.toISOString()::timestamptz` to avoid cross-connection type helper conflicts
- **Files modified:** `src/kb/sync.ts`
- **Commit:** a026a51

**3. [Rule 3 - Blocking] Migration 000005 not applied to database**
- **Found during:** Task 2 test run — `relation "kb_articles" does not exist`
- **Issue:** Plan 04-01 created the migration SQL file and Drizzle schema, but did not apply the migration to the running database
- **Fix:** Applied `db/migrations/000005_create_kb_articles.up.sql` via `psql`
- **Files modified:** None (database-only change)

**4. [Rule 1 - Bug] Module caching between tests**
- **Found during:** Task 2 test implementation (pre-emptive fix per plan note)
- **Issue:** Dynamic `await import('../../src/kb/sync.js')` would return cached module if `process.env.YOUTRACK_BASE_URL` was previously set, causing the env-absent test to fail
- **Fix:** Added `vi.resetModules()` to `beforeEach`
- **Files modified:** `tests/kb/sync.test.ts`
- **Commit:** a026a51

---

## Self-Check: PASSED

- FOUND: `src/kb/sync.ts`
- FOUND: `src/kb/scheduler.ts`
- FOUND: `tests/kb/sync.test.ts`
- FOUND commit: 3fd3f2c (feat(04-02): add syncKbArticles() and startKbScheduler())
- FOUND commit: a026a51 (test(04-02): add sync.test.ts — 4 green integration tests)
