# Phase 8: KB/Docs Management - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can configure YouTrack connection settings, trigger manual syncs, view sync status, and manually upload API docs — all from a dedicated dashboard page. KB articles (both YouTrack-synced and manually uploaded) are server-wide, not per-tenant. This phase does NOT add new MCP tools or change tenant-level tool permissions.

</domain>

<decisions>
## Implementation Decisions

### YouTrack Configuration
- Store YT connection settings (base URL, API token, project ID) in a new `server_settings` database table — not env vars
- Dashboard provides a form to configure/update YT credentials
- Sync interval (currently `KB_SYNC_INTERVAL_MS` env var) also moves to DB settings, configurable from dashboard
- On server startup, read settings from DB; if empty, no sync runs (clean behavior for fresh installs)

### Dashboard Layout
- KB/Docs management moves to a **new top-level page** in the dashboard sidebar ("Knowledge Base")
- Remove the `DocsTab` from `TenantDetailPage` — docs are server-wide, not tenant-scoped
- The tenant detail page retains its Tools tab for per-tenant tool permission selection
- New KB page houses: YT config section, sync button + status, doc list with upload/edit/delete

### Sync Behavior
- Current atomic sync pattern (DELETE non-DOC rows + INSERT) is kept — it works well
- "Sync Now" button shows inline spinner, then result: "Synced 52 articles" or "Failed: connection error"
- Dashboard displays last sync timestamp, article count, and success/failure status persistently
- Auto-sync scheduler reads interval from DB settings instead of env var

### Claude's Discretion
- YT API token masking approach (masked after save vs visible)
- Server settings table schema design (single row key-value vs structured columns)
- Whether to show a "last sync" banner at the top of the KB page or inline in the config section
- Upload form layout on the new KB page (reuse existing DocsTab component logic)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### KB Sync System
- `src/kb/sync.ts` — Current YouTrack sync implementation (fetch + atomic replace)
- `src/kb/scheduler.ts` — Auto-sync scheduler using `setInterval` and env var interval

### KB MCP Tools
- `src/tools/kb.ts` — 3 MCP tools: `search_kb`, `get_kb_article`, `get_kb_sync_status`

### Admin API (existing doc endpoints)
- `src/admin/router.ts` lines 540-780 — Existing KB doc CRUD: POST /kb/upload, GET /kb/docs, GET /kb/docs/:id, PUT /kb/docs/:id, DELETE /kb/docs/:id

### Dashboard (existing docs UI)
- `dashboard/src/pages/TenantDetailPage.tsx` lines 699+ — `DocsTab` component (upload, edit, delete)
- `dashboard/src/api.ts` lines 187-208 — API functions: `refreshKb`, `uploadDoc`, `listDocs`, `getDoc`, `updateDoc`, `deleteDoc`

### Database Schema
- `src/db/schema.ts` — Current schema definitions
- `db/migrations/000005_create_kb_articles.up.sql` — KB articles table structure

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DocsTab` component: Upload/edit/delete UI already built — can be extracted and moved to new KB page
- `refreshKb` API function: Already defined in `dashboard/src/api.ts` (POST /kb/refresh) — backend endpoint needs to be created
- `syncKbArticles()` function: Ready to call from a new admin endpoint
- `get_kb_sync_status` MCP tool: Already queries article count and last sync timestamp — same query can power the dashboard status display

### Established Patterns
- Admin routes use JWT auth hook (`jwtAuthHook`) — new KB admin endpoints follow same pattern
- Dashboard uses React Router for page navigation — new KB page follows existing routing pattern
- API functions in `api.ts` follow consistent `api<T>(path, opts)` pattern

### Integration Points
- `src/server.ts` — Register new admin endpoints (KB config, sync trigger)
- `src/kb/scheduler.ts` — Modify to read interval from DB instead of env var
- `src/kb/sync.ts` — Modify to read YT credentials from DB instead of env vars
- Dashboard router — Add new route for KB page
- Dashboard sidebar/nav — Add "Knowledge Base" navigation item

</code_context>

<specifics>
## Specific Ideas

- Sync interval should be configurable from the KB settings page alongside YT credentials
- Inline sync feedback (not toast) — button shows spinner, then result message
- Existing DocsTab logic can be largely reused on the new page

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-kb-docs-management*
*Context gathered: 2026-03-19*
