---
plan: 04-01
phase: 04-youtrack-kb-sync
subsystem: schema + tests
status: complete
completed: 2026-03-17
tags: [schema, drizzle, kb-articles, test-stubs]
dependency_graph:
  requires: []
  provides: [kbArticles-schema, kb-test-stubs]
  affects: [src/db/schema.ts, tests/tools/kb.test.ts]
tech_stack:
  added: []
  patterns: [drizzle-pgTable, global-table-no-rls]
key_files:
  created: [tests/tools/kb.test.ts]
  modified: [src/db/schema.ts]
decisions:
  - kbArticles is a global table with no tenant_id (all tenants share YouTrack docs cache)
  - No parent_article_id, no created_at, no updated_at — mirrors SQL migration exactly
  - Test stubs use it.todo() so vitest exits 0 before Wave 3 implements them
metrics:
  duration: "~2 minutes"
  completed: "2026-03-17"
  tasks_completed: 2
  files_changed: 2
---

# Phase 4 Plan 01: KB Schema + Test Stubs Summary

**One-liner:** Added global `kbArticles` Drizzle table (no tenant_id, 7 columns) and 9 `it.todo()` test stubs for KB tools.

---

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Add `kbArticles` pgTable to `src/db/schema.ts` | fd5f49e |
| 2 | Create `tests/tools/kb.test.ts` with `it.todo()` stubs | 927db3b |

---

## Schema Change

**Table added:** `kb_articles`

**Columns:**
- `id` — UUID PRIMARY KEY, default random
- `youtrack_id` — TEXT NOT NULL UNIQUE (idReadable e.g. "P8-A-7")
- `summary` — TEXT NOT NULL (article title/summary)
- `content` — TEXT nullable (Markdown body)
- `tags` — TEXT[] NOT NULL DEFAULT '{}' (YouTrack tags)
- `synced_at` — TIMESTAMPTZ NOT NULL DEFAULT now()
- `content_hash` — TEXT nullable (SHA-256 of content)

**Design notes:**
- Global table — no `tenant_id`, no RLS. All tenants share the YouTrack documentation cache.
- Mirrors `000005_create_kb_articles.up.sql` exactly.
- No `parent_article_id`, no `created_at`, no `updated_at` (per plan spec).

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASSED (exit 0, no errors) |
| `npx vitest run` | PASSED (94 passing, 9 todo, exit 0) |
| `grep "export const kbArticles" src/db/schema.ts` | FOUND |
| `grep "youtrack_id" src/db/schema.ts` | FOUND |
| `grep -c "it.todo" tests/tools/kb.test.ts` | 9 stubs (10 matches inc. comment) |

---

## Test Stubs Created

File: `tests/tools/kb.test.ts`

Describe blocks:
- `search_kb tool (KB-06)` — 5 stubs
- `get_kb_article tool (KB-05)` — 2 stubs
- `get_kb_sync_status tool (KB-06)` — 2 stubs

Wave 3 (04-03-PLAN.md) will implement these tests.

---

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/db/schema.ts
- FOUND: tests/tools/kb.test.ts
- FOUND: .planning/phases/04-youtrack-kb-sync/04-01-SUMMARY.md
- FOUND commit: fd5f49e (feat: add kbArticles table to schema)
- FOUND commit: 927db3b (test: add kb.test.ts with it.todo() stubs)
