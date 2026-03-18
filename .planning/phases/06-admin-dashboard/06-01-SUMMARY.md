---
phase: 06-admin-dashboard
plan: 01
subsystem: dashboard
tags: [jwt-auth, dashboard, api-keys, audit-log, build-pipeline]
dependency_graph:
  requires: [05-02 JWT auth backend, 05-01 audit wiring]
  provides: [JWT dashboard auth, key expiry UI, per-key scoping UI, audit filters, build scripts]
  affects: [dashboard/src/, src/admin/tenant-service.ts, src/admin/router.ts, package.json]
tech_stack:
  added: []
  patterns: [JWT Bearer auth in dashboard, per-key tool scoping expand panel, audit filter dropdowns]
key_files:
  created:
    - dashboard/ (entire dashboard app first committed)
  modified:
    - dashboard/src/api.ts
    - dashboard/src/App.tsx
    - dashboard/src/pages/LoginPage.tsx
    - dashboard/src/pages/TenantDetailPage.tsx
    - dashboard/src/components/Layout.tsx
    - src/admin/tenant-service.ts
    - src/admin/router.ts
    - package.json
decisions:
  - Existing .gitignore patterns (node_modules/, dist/) already cover dashboard subdirectories; no new entries needed
  - Per-key scoping uses expandable table row with checkbox list rather than a separate modal
  - Audit filters use simple select dropdowns for tool name and status
metrics:
  duration: ~4m
  completed: "2026-03-18T10:23:54Z"
---

# Phase 6 Plan 01: Dashboard JWT Auth, Key Expiry/Scoping UI, Audit Filters Summary

JWT auth with username/password login replacing raw admin secret, per-key tool scoping via expandable row, audit log filtering by tool and status, and dashboard build pipeline scripts.

## What Was Done

### Task 1: Rewrite dashboard auth to use JWT

- **dashboard/src/api.ts**: Replaced `adminSecret`/`setAdminSecret`/`getAdminSecret`/`clearAdminSecret` with `token`/`setToken`/`getToken`/`clearToken` using `jwt_token` localStorage key. Added `login(username, password)` function that POSTs to `/admin/auth/login`. Changed `api()` header from `X-Admin-Secret` to `Authorization: Bearer <token>`. 401 responses clear token and reload.
- **dashboard/src/pages/LoginPage.tsx**: Changed from single password field to username + password form. Username defaults to 'admin'. Shows inline error messages on login failure. Added loading state.
- **dashboard/src/App.tsx**: Imports `login`, `setToken`, `getToken`, `clearToken` from api. Auth check uses `getToken()`. Login callback calls `login()` then `setToken()`. Logout calls `clearToken()`.
- **dashboard/src/components/Layout.tsx**: Updated import and usage from `clearAdminSecret` to `clearToken`.

### Task 2: Key expiry, per-key scoping, and audit filters

- **src/admin/tenant-service.ts**: Added `expiresAt: Date | null` and `allowedTools: string[] | null` to `ApiKeyRow` interface. Updated `getTenant()` SELECT query to include `expires_at AS "expiresAt"` and `allowed_tools AS "allowedTools"`.
- **src/admin/router.ts**: Updated GET `/admin/tenants/:id` response schema to include `expiresAt` and `allowedTools` in the apiKeys items properties.
- **dashboard/src/api.ts**: Added `expiresAt: string | null` and `allowedTools: string[] | null` to `ApiKey` interface. Updated `createApiKey` to accept and pass `expiresAt` parameter.
- **dashboard/src/pages/TenantDetailPage.tsx**:
  - KeysTab: Added datetime-local input for key expiry on creation. Added "Expires" column showing locale date or "Never". Shows "expired" badge for expired keys. Added per-key tool scoping via expandable rows with checkbox list of all tools, "Save Scope" and "Reset to Tenant Default" buttons. Shows "scoped" badge on keys with custom allowedTools.
  - AuditTab: Added tool name dropdown (populated from listAllTools) and status dropdown (All/Success/Error). Filters reset offset to 0. "Clear Filters" link appears when filters are active. Shows "(filtered)" in count when filters applied.

### Task 3: Build scripts and .gitignore entries

- **package.json**: Added `"dashboard:dev"` and `"dashboard:build"` scripts.
- **.gitignore**: No changes needed -- existing `node_modules/` and `dist/` patterns already cover `dashboard/node_modules/` and `dashboard/dist/` (verified with `git check-ignore`).

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

All 7 verification checks passed:
1. `cd dashboard && npx tsc --noEmit` -- clean (no output)
2. `grep "Authorization" dashboard/src/api.ts` -- confirmed Bearer token auth
3. `grep "username" dashboard/src/pages/LoginPage.tsx` -- confirmed username field
4. `grep "expiresAt" dashboard/src/pages/TenantDetailPage.tsx` -- confirmed expiry UI
5. `grep "filterTool|filterStatus" dashboard/src/pages/TenantDetailPage.tsx` -- confirmed audit filters
6. `grep "dashboard:build" package.json` -- confirmed build script
7. `git check-ignore dashboard/node_modules/ dashboard/dist/` -- confirmed gitignore coverage

## Commits

| Hash | Message |
|------|---------|
| eb8bbeb | feat(06-01): JWT dashboard auth, key expiry/scoping UI, audit filters, build pipeline |
