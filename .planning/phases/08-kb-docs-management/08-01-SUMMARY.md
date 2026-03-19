---
phase: 08-kb-docs-management
plan: "01"
subsystem: kb-settings
tags: [settings, youtrack, sync, admin-api, dashboard]
dependency_graph:
  requires: []
  provides: [server_settings-table, settings-service, kb-settings-endpoints, kb-sync-status-endpoint]
  affects: [src/kb/sync.ts, src/kb/scheduler.ts, src/admin/router.ts, dashboard/src/api.ts]
tech_stack:
  added: []
  patterns: [key-value-store, db-over-env-fallback, sync-status-recording]
key_files:
  created:
    - db/migrations/000010_create_server_settings.up.sql
    - db/migrations/000010_create_server_settings.down.sql
    - src/admin/settings-service.ts
  modified:
    - src/db/schema.ts
    - src/admin/router.ts
    - src/kb/sync.ts
    - src/kb/scheduler.ts
    - dashboard/src/api.ts
decisions:
  - "Used unknown cast for postgres.js Row type to avoid TS2345 (Row is not assignable to typed object)"
  - "Added 500 response schema to POST /kb/refresh to allow typed 500 reply in Fastify"
  - "scheduler returns void instead of ReturnType<typeof setInterval> — DB-read interval requires async init"
metrics:
  duration_seconds: 266
  completed_date: "2026-03-19"
  tasks_completed: 2
  files_changed: 8
---

# Phase 8 Plan 01: KB Settings Backend Summary

**One-liner:** YouTrack connection settings moved from env vars to DB-stored key-value table with admin REST API (GET/PUT /kb/settings, GET /kb/sync-status) and dashboard API functions.

## What Was Built

### Task 1: Database migration, Drizzle schema, and settings service

- `db/migrations/000010_create_server_settings.up.sql` — creates `server_settings` global key-value table (key TEXT PK, value TEXT, updated_at TIMESTAMPTZ), seeds default sync interval of 1800000ms, grants full access to app_user
- `db/migrations/000010_create_server_settings.down.sql` — DROP TABLE IF EXISTS server_settings
- `src/db/schema.ts` — added `serverSettings` Drizzle table definition (GLOBAL, no tenant_id, no RLS)
- `src/admin/settings-service.ts` — exports `getSettings`, `updateSettings`, `getSyncStatus`, `updateSyncStatus` functions; defines `KbSettings` and `SyncStatus` interfaces

### Task 2: Admin API endpoints, updated sync/scheduler, and dashboard API functions

- `src/admin/router.ts` — added 3 new endpoints:
  - `GET /admin/kb/settings` — returns current settings with masked token
  - `PUT /admin/kb/settings` — updates YouTrack credentials and sync interval
  - `GET /admin/kb/sync-status` — returns last sync timestamp, article count, and last error
  - Updated `POST /kb/refresh` to record sync status (success or error) to server_settings
- `src/kb/sync.ts` — reads YouTrack credentials from DB via `getSettings()`, falls back to env vars; warns if neither configured
- `src/kb/scheduler.ts` — reads sync interval from DB with env var fallback; records sync status after initial sync and each scheduled run; return type changed from `ReturnType<typeof setInterval>` to `void` (async init pattern)
- `dashboard/src/api.ts` — added `KbSettings`, `SyncStatus` interfaces and `getKbSettings`, `updateKbSettings`, `getKbSyncStatus` API functions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed postgres.js Row type incompatibility**
- **Found during:** Task 1
- **Issue:** `rows.map((r: { key: string; value: string }) => ...)` fails TS2345 — postgres.js `Row` type doesn't match the inline object type
- **Fix:** Used `(rows as unknown as { key: string; value: string }[]).map(...)` pattern consistent with other files in the codebase
- **Files modified:** `src/admin/settings-service.ts`
- **Commit:** 13038f0

**2. [Rule 1 - Bug] Fixed operator precedence error in sync.ts**
- **Found during:** Task 2
- **Issue:** `dbSettings.youtrackProject || process.env.YOUTRACK_PROJECT ?? 'P8'` fails TS5076 — mixing `||` and `??` without parentheses
- **Fix:** `dbSettings.youtrackProject || (process.env.YOUTRACK_PROJECT ?? 'P8')`
- **Files modified:** `src/kb/sync.ts`
- **Commit:** 8a4a837

**3. [Rule 2 - Missing] Added 500 response schema to POST /kb/refresh**
- **Found during:** Task 2
- **Issue:** Fastify typed reply doesn't allow `reply.status(500)` unless 500 is declared in response schema
- **Fix:** Added `500: { type: 'object', properties: { synced: boolean, error: string } }` to schema
- **Files modified:** `src/admin/router.ts`
- **Commit:** 8a4a837

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git log:
- `13038f0` — feat(08-01): add server_settings migration, Drizzle schema, and settings service
- `8a4a837` — feat(08-01): add KB settings endpoints, update sync/scheduler, add dashboard API functions
