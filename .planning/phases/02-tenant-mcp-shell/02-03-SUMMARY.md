---
phase: 02-tenant-mcp-shell
plan: "03"
subsystem: api
tags: [fastify, fastify-swagger, scalar, rest-api, admin, rls, postgres, vitest]

# Dependency graph
requires:
  - phase: 02-02
    provides: src/admin/tenant-service.ts — all 5 admin DB operations, TenantRow/ApiKeyRow types
  - phase: 01-03
    provides: PostgreSQL schema with tenants and api_keys tables, RLS policies (FORCE RLS on api_keys)
provides:
  - src/server.ts — buildServer() factory: Fastify + swagger + scalar + adminRouter
  - src/admin/router.ts — 5 admin routes with X-Admin-Secret auth hook
  - tests/admin/tenant-crud.test.ts — TENANT-01, TENANT-02, TENANT-03 fully implemented
  - tests/admin/api-keys.test.ts — TENANT-04, TENANT-05 fully implemented
affects: [02-04, Phase 3 ERP tools, any test suite consumer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildServer() factory exported from src/server.ts — used by tests via inject() and by src/index.ts for actual listen()"
    - "Fastify plugin: adminRouter registers onRequest hook + 5 routes in encapsulated scope"
    - "FORCE RLS on api_keys requires set_config() before any INSERT — even admin operations"
    - "listTenants uses DATABASE_MIGRATION_URL (superuser) for cross-tenant aggregate JOIN on api_keys"
    - "Test cleanup uses DATABASE_MIGRATION_URL (app_login lacks DELETE on tenants)"
    - "fastify.inject() for all admin tests — no real HTTP port opened"

key-files:
  created:
    - src/server.ts
    - src/admin/router.ts
  modified:
    - src/admin/tenant-service.ts
    - tests/admin/tenant-crud.test.ts
    - tests/admin/api-keys.test.ts

key-decisions:
  - "Fastify logger: false — all output via process.stderr.write(); stdout must remain clean for MCP transport"
  - "FORCE ROW LEVEL SECURITY on api_keys affects INSERTs too: createTenant and createApiKey must call set_config before inserting key rows"
  - "listTenants uses DATABASE_MIGRATION_URL pool (superuser) for the cross-tenant key count aggregate — app_login would see zero rows for the api_keys JOIN under RLS without per-tenant context"
  - "Test cleanup (DELETE FROM tenants) requires DATABASE_MIGRATION_URL — app_login has SELECT/INSERT/UPDATE only"

patterns-established:
  - "Admin operations that span multiple tenants (aggregates, counts) must use superuser connection to bypass RLS"
  - "Any INSERT to api_keys requires set_config('app.current_tenant_id', id, true) in the same transaction"
  - "Test afterAll cleanup: always use DATABASE_MIGRATION_URL for DELETE on tenants (app_login lacks DELETE)"

requirements-completed: [TENANT-01, TENANT-02, TENANT-03, TENANT-04, TENANT-05]

# Metrics
duration: 7min
completed: 2026-03-16
---

# Phase 2 Plan 3: Admin REST API (Wave 3) Summary

**Fastify HTTP server with 5 admin REST routes (buildServer factory, Scalar UI, OpenAPI schema), plus full TENANT-01 through TENANT-05 test suite — 24 tests passing against real PostgreSQL**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-16T10:13:18Z
- **Completed:** 2026-03-16T10:20:24Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- buildServer() factory in src/server.ts: Fastify + @fastify/swagger + @scalar/fastify-api-reference + adminRouter
- src/admin/router.ts: onRequest auth hook (X-Admin-Secret) + all 5 admin routes with OpenAPI schemas
- All 24 admin tests pass (TENANT-01 through TENANT-05) with real database via fastify.inject()
- Fixed 3 RLS correctness bugs in tenant-service.ts that blocked INSERT operations on api_keys

## Task Commits

Each task was committed atomically:

1. **Task 1: Fastify server factory + admin router with all 5 routes** - `99f81a5` (feat)
2. **Task 2: Implement admin test suite (TENANT-01 through TENANT-05)** - `43627d4` (feat)

## Route Table

| Method | Path | Status Codes | Auth |
|--------|------|-------------|------|
| POST | /admin/tenants | 201, 400, 409, 500 | X-Admin-Secret |
| GET | /admin/tenants | 200 | X-Admin-Secret |
| GET | /admin/tenants/:id | 200, 404 | X-Admin-Secret |
| POST | /admin/tenants/:id/keys | 201, 404 | X-Admin-Secret |
| DELETE | /admin/tenants/:id/keys/:keyId | 204, 404 | X-Admin-Secret |
| GET | /docs | 200 | None (Scalar UI) |

## Test Results

| Suite | Tests | Passed | Failed |
|-------|-------|--------|--------|
| tests/admin/tenant-crud.test.ts | 14 | 14 | 0 |
| tests/admin/api-keys.test.ts | 10 | 10 | 0 |
| **Total** | **24** | **24** | **0** |

## Files Created/Modified

- `src/server.ts` — buildServer() async factory: Fastify instance with swagger, scalar, adminRouter
- `src/admin/router.ts` — Fastify plugin: onRequest auth hook + 5 admin CRUD routes
- `src/admin/tenant-service.ts` — 3 RLS correctness fixes (see Deviations)
- `tests/admin/tenant-crud.test.ts` — Full TENANT-01, TENANT-02, TENANT-03 implementations
- `tests/admin/api-keys.test.ts` — Full TENANT-04, TENANT-05 implementations

## Decisions Made

- Fastify logger set to `false` — all output via `process.stderr.write()` to keep stdout clean for MCP Streamable HTTP transport.
- FORCE RLS on `api_keys` affects INSERTs — `createTenant` and `createApiKey` must call `set_config('app.current_tenant_id', id, true)` before inserting key rows. This was discovered during testing.
- `listTenants` aggregate JOIN uses `DATABASE_MIGRATION_URL` (superuser) because RLS would return zero rows for the `api_keys` JOIN without per-tenant context when computing cross-tenant key counts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] createTenant: missing set_config before api_keys INSERT**
- **Found during:** Task 2 (running admin tests)
- **Issue:** The `api_keys` table has `FORCE ROW LEVEL SECURITY`. The plan's `createTenant` transaction inserted into `api_keys` without first calling `set_config('app.current_tenant_id', ...)`. PostgreSQL rejected the INSERT with "new row violates row-level security policy".
- **Fix:** Added `await txSql\`SELECT set_config('app.current_tenant_id', ${tenant.id}, true)\`` before the api_keys INSERT inside the transaction.
- **Files modified:** `src/admin/tenant-service.ts`
- **Verification:** `createTenant` test passes (201 response)
- **Committed in:** `43627d4` (Task 2 commit)

**2. [Rule 1 - Bug] createApiKey: direct INSERT without RLS context**
- **Found during:** Task 2 (same test run)
- **Issue:** `createApiKey` performed a direct INSERT to `api_keys` without a transaction or `set_config`. Same FORCE RLS violation as above.
- **Fix:** Wrapped in `sql.begin()` transaction with `set_config` before the INSERT, following the pattern from `revokeApiKey`.
- **Files modified:** `src/admin/tenant-service.ts`
- **Verification:** `createApiKey` tests pass (201 response, key label stored correctly)
- **Committed in:** `43627d4` (Task 2 commit)

**3. [Rule 1 - Bug] listTenants: zero keyCount due to RLS on api_keys JOIN**
- **Found during:** Task 2 (test for TENANT-02 keyCount)
- **Issue:** `listTenants` performed a LEFT JOIN on `api_keys` using `app_login` without any tenant context. FORCE RLS filtered out all `api_keys` rows from the JOIN, causing `keyCount` to always be 0 for all tenants.
- **Fix:** Changed `listTenants` to open a short-lived `postgres(DATABASE_MIGRATION_URL)` connection (superuser, BYPASSRLS) for the aggregate query, following the pattern established in `lookupApiKeyByHash`.
- **Files modified:** `src/admin/tenant-service.ts`
- **Verification:** `keyCount >= 1` for newly created tenant with one key
- **Committed in:** `43627d4` (Task 2 commit)

**4. [Rule 1 - Bug] Test cleanup: DELETE FROM tenants fails for app_login**
- **Found during:** Task 2 (afterAll cleanup)
- **Issue:** Test `afterAll` used `DATABASE_URL` (app_login) for `DELETE FROM tenants`. The migration grants only SELECT/INSERT/UPDATE to `app_user` — DELETE was never granted (intentional design). This caused afterAll to throw `permission denied for table tenants`, making vitest report test suite failures even though all 24 tests passed.
- **Fix:** Changed both test files to use `DATABASE_MIGRATION_URL` (postgres superuser) for cleanup connections.
- **Files modified:** `tests/admin/tenant-crud.test.ts`, `tests/admin/api-keys.test.ts`
- **Verification:** afterAll completes cleanly, vitest exits 0
- **Committed in:** `43627d4` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs in plan template code)
**Impact on plan:** All 4 fixes were required for correctness. The FORCE RLS behavior was known (documented in STATE.md) but the plan template code did not account for it in 3 of 5 service functions. No scope creep.

## Issues Encountered

- Local PostgreSQL 11 is installed but the `pb_mcp` database did not exist (normally set up via Docker). Created the database, enabled `pgcrypto` extension (PostgreSQL 11 needs it for `gen_random_uuid()`), and ran the first 3 migrations manually. Tests then ran successfully against the local DB.

## Next Phase Readiness

- Wave 4 (MCP server + auth, plan 02-04) can import `buildServer()` from `src/server.ts` and register the MCP plugin on the same Fastify instance.
- `lookupApiKeyByHash` from `src/admin/tenant-service.ts` is ready for MCP auth middleware.
- All TENANT-01 through TENANT-05 requirements complete and verified.
- TypeScript compiles clean (`npx tsc --noEmit` exits 0).

## Self-Check: PASSED

- FOUND: src/server.ts
- FOUND: src/admin/router.ts
- FOUND: src/admin/tenant-service.ts
- FOUND: tests/admin/tenant-crud.test.ts
- FOUND: tests/admin/api-keys.test.ts
- FOUND: .planning/phases/02-tenant-mcp-shell/02-03-SUMMARY.md
- FOUND commit: 99f81a5 (Task 1)
- FOUND commit: 43627d4 (Task 2)

---
*Phase: 02-tenant-mcp-shell*
*Completed: 2026-03-16*
