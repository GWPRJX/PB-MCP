---
phase: 06-admin-dashboard
name: Admin Dashboard + Doc Upload
requirements: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04]
depends_on: [phase-05]
---

# Phase 6 Context: Admin Dashboard + Doc Upload

## Goal

Admin can manage all aspects of the MCP server through a polished React dashboard — tenants, keys, tool permissions, ERP config, audit logs, and API documentation upload.

## What Already Exists

### Dashboard (Vite + React 19 + Tailwind v4 + React Router v7)

**Auth:** LoginPage accepts raw admin secret → stored in localStorage → sent as `X-Admin-Secret` header. App.tsx checks `getAdminSecret()` for auth state.

**Pages:**
- LoginPage — password-only input (no username), calls `onLogin(secret)`
- TenantsPage — lists tenants (name, slug, plan, status, key count, created) ✓
- CreateTenantPage — form with slug validation, one-time API key reveal ✓
- TenantDetailPage — 4 tabs:
  - KeysTab — create with label, revoke, no expiry input, no per-key scoping UI
  - ToolsTab — grouped toggles, enable/disable all, save ✓
  - ErpTab — 6 fields, save + test connection ✓
  - AuditTab — paginated list, no filter dropdowns

**API layer (api.ts):**
- Uses `X-Admin-Secret` header (not JWT)
- All CRUD functions for tenants, keys, tools, ERP, audit already exported
- Missing: `login()`, KB doc CRUD functions

### Backend

**JWT auth:** `POST /admin/auth/login` exists in `src/server.ts` (accepts username + password, returns `{ token }`). `jwtAuthHook` in router supports both `Authorization: Bearer` and `X-Admin-Secret` fallback.

**Admin endpoints:** All tenant/key/tool/ERP/audit endpoints exist and work.

**Key creation:** Already accepts `expiresAt` in body (router.ts line 153).

**KB articles table:** `kb_articles` — global, no tenant_id. Has youtrack_id, summary, content, tags, synced_at, content_hash. No source column to distinguish uploaded vs synced.

**Missing backend endpoints:** KB doc CRUD (upload, list, edit, delete).

**Static serving:** `@fastify/static` registered for `dashboard/dist/` with SPA fallback. Already works.

**Root package.json:** Missing `dashboard:dev` and `dashboard:build` scripts. Missing `dashboard/node_modules/` and `dashboard/dist/` in root .gitignore.

## Gap Analysis

| Requirement | Status | Gap |
|---|---|---|
| DASH-01 | Partial | Login uses raw secret, not JWT; no username field; no token expiry handling |
| DASH-02 | Done | Tenant list shows all required fields |
| DASH-03 | Done | Create form validates slug, reveals API key once |
| DASH-04 | Partial | Has 4 tabs; needs 5th "API Docs" tab |
| DASH-05 | Partial | Create/revoke works; missing expiry input, per-key tool scoping UI |
| DASH-06 | Done | Toggle on/off, bulk enable/disable, save |
| DASH-07 | Done | Save + test connection with live feedback |
| DASH-08 | Partial | Paginated; missing tool name and status filter dropdowns |
| DASH-09 | Partial | Backend static serving works; missing npm scripts + .gitignore entries |
| UPLOAD-01 | Not done | Need POST /admin/kb/upload endpoint |
| UPLOAD-02 | Not done | Need to store in kb_articles with upload-specific youtrack_id |
| UPLOAD-03 | Not done | Need API Docs tab with upload/list/edit/delete UI |
| UPLOAD-04 | Free | Already handled — kb_articles queried by search_kb and get_kb_article |

## Key Interfaces

### JWT Login (backend already exists)
```
POST /admin/auth/login
Body: { username: string, password: string }
Response: { token: string }
```

### Key Creation (backend already accepts expiresAt)
```
POST /admin/tenants/:id/keys
Body: { label?: string, expiresAt?: string | null }
Response: { keyId: string, apiKey: string }
```

### Per-Key Tool Scoping (backend already exists)
```
PUT /admin/tenants/:id/keys/:keyId/tools
Body: { allowedTools: string[] | null }
Response: { updated: boolean }
```

### Audit Log Query (backend supports filters)
```
GET /admin/tenants/:id/audit-log?toolName=X&status=success|error&limit=25&offset=0
Response: { entries: AuditEntry[], totalCount: number }
```

### All Available Tools
```
GET /admin/tools
Response: string[]
```

## Decisions

- **Doc upload IDs:** Use `DOC-{short-uuid}` as youtrack_id for uploaded docs (distinguishes from YouTrack-synced `P8-A-*` IDs)
- **Doc upload is global:** kb_articles has no tenant_id; API Docs tab shows same docs regardless of which tenant is viewed
- **API Docs as tenant detail tab only:** Keeping it as a tab in tenant detail (not a top-level nav route) is simpler and matches the DASH-04 requirement. A top-level route can be added later if needed.
- **Doc upload size limit:** 1MB (text content limit, configurable)
