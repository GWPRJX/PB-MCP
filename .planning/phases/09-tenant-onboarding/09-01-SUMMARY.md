---
phase: 09-tenant-onboarding
plan: "01"
subsystem: backend-api
tags: [tenant-onboarding, erp-credentials, backend, dashboard-api]
dependency_graph:
  requires: []
  provides:
    - POST /admin/test-erp-credentials endpoint
    - testErpCredentials() function in connection-tester.ts
    - ERP fields in POST /admin/tenants body
    - testErpCredentials() and updated createTenant() in dashboard/src/api.ts
  affects:
    - src/admin/connection-tester.ts
    - src/admin/router.ts
    - dashboard/src/api.ts
tech_stack:
  added: []
  patterns:
    - Dynamic import for testErpCredentials in router (consistent with existing testErpConnection pattern)
    - Conditional erpConfig object construction (only passed when at least one ERP field is present)
key_files:
  created: []
  modified:
    - src/admin/connection-tester.ts
    - src/admin/router.ts
    - dashboard/src/api.ts
decisions:
  - testErpCredentials placed before testErpConnection in connection-tester.ts — new function logically precedes the DB-lookup variant
  - erpConfig only passed to createTenant when at least one ERP field is present — avoids passing empty object for non-ERP tenant creation
  - Dynamic import used for testErpCredentials in router (same pattern as testErpConnection) — avoids circular dependency risk
metrics:
  duration: "2m 34s"
  completed: "2026-03-19"
  tasks_completed: 2
  files_modified: 3
---

# Phase 9 Plan 1: Backend ERP Credentials Endpoint Summary

One-liner: Added `POST /admin/test-erp-credentials` endpoint and `testErpCredentials()` function for credential testing before tenant creation, plus optional ERP fields on `POST /admin/tenants` and dashboard API functions.

## What Was Built

Backend support for credentials-first tenant onboarding. Previously, testing ERP credentials required an existing tenant record. Now credentials can be tested before any tenant is created, and tenant creation accepts ERP config in the same atomic request.

## Tasks Completed

| Task | Description | Commit | Files Modified |
|------|-------------|--------|----------------|
| 1 | Add testErpCredentials function and POST /admin/test-erp-credentials endpoint | 0592568 | src/admin/connection-tester.ts, src/admin/router.ts |
| 2 | Add testErpCredentials and update createTenant in dashboard API layer | 9cb443b | dashboard/src/api.ts |

## Key Changes

**src/admin/connection-tester.ts:**
- Added `export async function testErpCredentials(credentials)` — accepts raw credentials directly, no DB lookup
- Includes 5 specific error hint messages for common failure modes (ENOTFOUND, ECONNREFUSED, ETIMEDOUT, 401/Unauthorized, SSL/TLS)
- Existing `testErpConnection(tenantId)` function unchanged

**src/admin/router.ts:**
- New `POST /admin/test-erp-credentials` route with full JSON Schema body validation (6 required fields)
- Updated `POST /admin/tenants` body schema with 6 optional ERP fields
- Updated handler to extract ERP fields and pass conditional `erpConfig` object to `createTenant()`

**dashboard/src/api.ts:**
- New `export const testErpCredentials(credentials)` function calling `POST /test-erp-credentials`
- Updated `createTenant()` parameter type to include 6 optional ERP fields (erpBaseUrl through erpTerminal)

## Verification

- `npx tsc --noEmit` passes in both root and dashboard directories
- `src/admin/connection-tester.ts` exports both `testErpConnection` (unchanged) and `testErpCredentials` (new)
- `src/admin/router.ts` has `POST /admin/test-erp-credentials` route
- `src/admin/router.ts` POST /admin/tenants body schema includes 6 ERP fields
- `dashboard/src/api.ts` exports `testErpCredentials` function
- `dashboard/src/api.ts` `createTenant` accepts ERP config fields

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- FOUND: src/admin/connection-tester.ts
- FOUND: src/admin/router.ts
- FOUND: dashboard/src/api.ts
- FOUND: .planning/phases/09-tenant-onboarding/09-01-SUMMARY.md
- FOUND commit 0592568: feat(09-01): add testErpCredentials endpoint and update POST /tenants with ERP fields
- FOUND commit 9cb443b: feat(09-01): add testErpCredentials and update createTenant in dashboard API layer
