---
phase: 06-admin-dashboard
plan: 02
subsystem: kb-doc-management
tags: [kb, crud, dashboard, upload, api-docs]
dependency_graph:
  requires: [06-01]
  provides: [kb-doc-crud, api-docs-tab]
  affects: [search_kb, get_kb_article]
tech_stack:
  added: []
  patterns: [dynamic-sql-update, DOC-prefix-guard]
key_files:
  created: []
  modified:
    - src/admin/router.ts
    - dashboard/src/api.ts
    - dashboard/src/pages/TenantDetailPage.tsx
decisions:
  - "DOC-* prefix on youtrack_id distinguishes uploaded docs from YouTrack-synced articles"
  - "Dynamic UPDATE with sql.unsafe for partial field updates in PUT endpoint"
  - "Content max 1MB enforced at API level"
  - "DocsTab is a flat component in TenantDetailPage.tsx, following existing tab patterns"
metrics:
  duration: "~3m"
  completed: "2026-03-18T10:29:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 6 Plan 02: KB Doc Management Summary

KB doc CRUD endpoints with DOC-* prefix guard and API Docs dashboard tab with upload/edit/delete UI

## What Was Done

### Task 1: KB Doc CRUD Endpoints (958edfc)

Added 5 new endpoints to `src/admin/router.ts`, all auto-protected by the existing JWT auth hook:

1. **POST /admin/kb/upload** -- Upload new API doc with DOC-{uuid-prefix} youtrack_id, SHA-256 content hash, 1MB content limit
2. **GET /admin/kb/docs** -- List uploaded docs (DOC-% filter) with pagination and total count
3. **GET /admin/kb/docs/:id** -- Get single doc with full content for editing (DOC-% guard)
4. **PUT /admin/kb/docs/:id** -- Update uploaded doc (partial fields, recomputes hash, DOC-% guard)
5. **DELETE /admin/kb/docs/:id** -- Delete uploaded doc (DOC-% guard prevents deleting YouTrack articles)

Imports added: `createHash` from crypto, `sql` from db/client.

### Task 2: API Docs Dashboard Tab (db04c39)

**dashboard/src/api.ts:**
- Added `KbDoc` and `KbDocFull` interfaces
- Added 5 API functions: `uploadDoc`, `listDocs`, `getDoc`, `updateDoc`, `deleteDoc`

**dashboard/src/pages/TenantDetailPage.tsx:**
- Extended Tab type to include `'docs'`
- Added 5th tab: "API Docs"
- Created `DocsTab` component with:
  - Upload form (title, markdown textarea, comma-separated tags)
  - Inline edit panel (loads full content via getDoc, saves via updateDoc)
  - Delete with confirmation dialog
  - Docs table with Title, ID, Tags, Created, Actions columns
  - Pagination (25 per page, same pattern as AuditTab)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error with sql.unsafe parameter types**
- **Found during:** Task 1
- **Issue:** `unknown[]` not assignable to postgres.js `ParameterOrJSON<never>[]` for sql.unsafe values
- **Fix:** Changed values array type from `unknown[]` to `(string | string[])[]`
- **Files modified:** src/admin/router.ts
- **Commit:** 958edfc

## Verification Results

- Backend TypeScript compilation: PASS (no errors)
- Dashboard TypeScript compilation: PASS (no errors)
- `grep "kb/upload" src/admin/router.ts`: FOUND (2 matches)
- `grep "DOC-" src/admin/router.ts`: FOUND (10 matches, all CRUD endpoints + guards)
- `grep "DocsTab" dashboard/src/pages/TenantDetailPage.tsx`: FOUND
- `grep "uploadDoc" dashboard/src/api.ts`: FOUND
- `grep "'docs'" dashboard/src/pages/TenantDetailPage.tsx`: FOUND (3 matches -- type, tab def, render)

## Success Criteria Check

- [x] POST /admin/kb/upload stores markdown doc in kb_articles with DOC-* youtrack_id
- [x] GET /admin/kb/docs lists only uploaded docs (DOC-* filter)
- [x] GET /admin/kb/docs/:id returns single doc with full content
- [x] PUT /admin/kb/docs/:id updates only uploaded docs (not YouTrack-synced)
- [x] DELETE /admin/kb/docs/:id deletes only uploaded docs
- [x] TenantDetailPage has 5 tabs: API Keys, Tool Permissions, ERP Config, Audit Log, API Docs
- [x] API Docs tab: upload form, doc list, edit, delete, pagination
- [x] Uploaded docs immediately appear in search_kb and get_kb_article results (no code changes needed)

## Self-Check: PASSED

All files exist, all commits verified (958edfc, db04c39).
