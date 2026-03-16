---
phase: 02-tenant-mcp-shell
plan: "02"
subsystem: database
tags: [drizzle-orm, postgres, rls, async-local-storage, tenant-service, api-keys]

# Dependency graph
requires:
  - phase: 02-01
    provides: Phase 2 dependencies installed (drizzle-orm, postgres, fastify, mcp-sdk)
  - phase: 01-03
    provides: PostgreSQL schema with tenants and api_keys tables, RLS policies
provides:
  - src/db/schema.ts — Drizzle pgTable mirrors for tenants and api_keys
  - src/db/client.ts — Extended with drizzle db export (wraps existing sql pool)
  - src/context.ts — AsyncLocalStorage TenantContext with getTenantId() and isTenantContext()
  - src/admin/tenant-service.ts — All tenant and API key DB operations
affects: [02-03, 02-04, Phase 3 admin router, Phase 4 MCP auth]

# Tech tracking
tech-stack:
  added: [drizzle-orm/postgres-js adapter, drizzle-orm/pg-core pgTable]
  patterns:
    - "tx as unknown as postgres.Sql cast — required for TransactionSql template-tag callability in strict TypeScript"
    - "SET LOCAL via set_config('app.current_tenant_id', id, true) in transactions for RLS-bearing tables"
    - "DATABASE_MIGRATION_URL (superuser) for auth key lookup to bypass RLS when tenant_id is unknown"
    - "AsyncLocalStorage for tenant context propagation — never module-level state"
    - "pb_ prefix + 64 hex chars for API keys — raw key shown once, SHA-256 hash stored"

key-files:
  created:
    - src/db/schema.ts
    - src/context.ts
    - src/admin/tenant-service.ts
  modified:
    - src/db/client.ts

key-decisions:
  - "lookupApiKeyByHash uses DATABASE_MIGRATION_URL (superuser, no RLS) to resolve key_hash to tenant_id — necessary because RLS on api_keys returns zero rows when no context is set, and we don't know the tenant_id before resolving the key"
  - "TransactionSql cast pattern (tx as unknown as postgres.Sql) applied in tenant-service.ts matching the established client.ts pattern — safe at runtime, required for TypeScript strict-mode template-tag access"
  - "getTenant and revokeApiKey use SET LOCAL in transactions to satisfy api_keys RLS — admin operations using app_login role, not superuser"
  - "createTenant catches PostgreSQL error 23505 (unique_violation) and re-throws as DUPLICATE_SLUG for clean HTTP 409 conversion in the router layer"

patterns-established:
  - "RLS bypass for auth: use DATABASE_MIGRATION_URL pool (short-lived, max:2) only for auth lookups — never for tenant data operations"
  - "Tenant context in transactions: SET LOCAL via set_config() before querying RLS-bearing tables"
  - "API key format: pb_ + randomBytes(32).toString('hex') — 67 chars total, 256 bits of entropy"

requirements-completed: [TENANT-01, TENANT-02, TENANT-03, TENANT-04, TENANT-05, TENANT-07]

# Metrics
duration: 10min
completed: 2026-03-16
---

# Phase 2 Plan 02: Tenant Data Layer Summary

**Drizzle schema mirrors, AsyncLocalStorage tenant context, and TenantService with atomic tenant creation, RLS-aware key operations, and superuser auth lookup via DATABASE_MIGRATION_URL**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-16T10:03:48Z
- **Completed:** 2026-03-16T10:13:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Drizzle ORM schema mirrors for `tenants` and `api_keys` tables, exactly matching DB column names from Phase 1 migrations
- `src/db/client.ts` extended with type-safe `db` Drizzle export wrapping the existing `sql` postgres.js pool
- `src/context.ts` provides `AsyncLocalStorage<TenantContext>` with `getTenantId()` (throws outside context) and `isTenantContext()` (safe check)
- `src/admin/tenant-service.ts` exports 7 functions covering all tenant and API key operations, with correct RLS handling throughout

## Task Commits

1. **Task 1: Drizzle schema + extend db client + AsyncLocalStorage context** - `1581535` (feat)
2. **Task 2: TenantService — all tenant and API key DB operations** - `61c246e` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `src/db/schema.ts` — Drizzle `pgTable` definitions for `tenants` and `api_keys`; camelCase field names mapping to snake_case DB columns
- `src/db/client.ts` — Extended with `drizzle-orm/postgres-js` import and `db` export; existing `sql` and `withTenantContext` unchanged
- `src/context.ts` — `TenantContext` interface (`tenantId`, `keyId`), `tenantStorage` AsyncLocalStorage, `getTenantId()`, `isTenantContext()`
- `src/admin/tenant-service.ts` — All 7 exports: `generateApiKey`, `createTenant`, `listTenants`, `getTenant`, `createApiKey`, `revokeApiKey`, `lookupApiKeyByHash`

## Decisions Made

- **lookupApiKeyByHash RLS bypass:** The auth key lookup must run without a tenant context (we're resolving the tenant FROM the key). `api_keys` has RLS that returns zero rows when `app.current_tenant_id` is unset. Solution: use `DATABASE_MIGRATION_URL` (superuser, no RLS) for this single read-only lookup. The pool is short-lived (`max: 2`) and closed after each call — acceptable for v1 volume.
- **TransactionSql cast pattern:** `tx as unknown as postgres.Sql` is required throughout `tenant-service.ts` for the same reason it was needed in `client.ts` — TypeScript strict mode doesn't infer `TransactionSql` as callable via template literal, but the runtime behavior is correct.
- **getTenant uses SET LOCAL:** The admin `getTenant` call needs to return `api_keys` for a specific tenant. Using `set_config('app.current_tenant_id', id, true)` inside a transaction satisfies RLS without requiring superuser privileges.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `listTenants` type annotation typo and `TransactionSql` not callable errors**
- **Found during:** Task 2 (TenantService creation)
- **Issue:** Plan template had `sql<(TenantRow & { keyCount: string })`` (missing `[]>` closing). Also `tx` in `sql.begin()` callbacks is `TransactionSql` which TypeScript strict mode treats as non-callable without a cast — same issue as `client.ts`.
- **Fix:** Added `[]` to generic type annotation; applied `tx as unknown as postgres.Sql` cast pattern in all 3 transaction callbacks (`createTenant`, `getTenant`, `revokeApiKey`)
- **Files modified:** `src/admin/tenant-service.ts`
- **Verification:** `npx tsc --noEmit` exits 0 after fix
- **Committed in:** `61c246e` (Task 2 commit)

**2. [Rule 1 - Bug] Removed redundant first `keyRows` query in `getTenant`**
- **Found during:** Task 2
- **Issue:** Plan template had two queries — `keyRows` (without context, returns zero rows due to RLS) then `keyRowsAdmin` (with SET LOCAL). The first query was dead code.
- **Fix:** Removed the dead `keyRows` query; only `keyRowsAdmin` is used.
- **Files modified:** `src/admin/tenant-service.ts`
- **Verification:** Logic unchanged (only admin query ever returned data), TypeScript clean
- **Committed in:** `61c246e` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (Rule 1 — bugs in plan template code)
**Impact on plan:** Both fixes were necessary for correctness. No scope creep.

## Issues Encountered

- vitest shows 3 pre-existing test failures (database connection errors — `pb_mcp` DB doesn't exist locally; tests require running Docker stack). These failures existed before this plan and are unchanged. 50 `todo` tests remain as planned stubs from 02-01.

## How lookupApiKeyByHash Bypasses RLS

The `api_keys` table has Row-Level Security with a policy that filters by `app.current_tenant_id`. When no context is set (which is the case during auth resolution — we don't yet know the tenant), all rows are hidden.

Solution: Create a short-lived `postgres()` connection using `DATABASE_MIGRATION_URL` (the superuser URL established in Phase 1 for DDL). The superuser role is not subject to RLS. This connection performs a single `SELECT id, tenant_id, status FROM api_keys WHERE key_hash = $1` and is terminated immediately via `authSql.end()` in the `finally` block.

This pool is **only** used for this lookup. All other queries (including tenant data operations) continue to use `sql` (app_login, RLS enforced).

## Next Phase Readiness

- Wave 3 (admin REST API, plan 02-03) can import directly from `src/admin/tenant-service.ts`
- Wave 4 (MCP auth, plan 02-04) can import `lookupApiKeyByHash` and `tenantStorage` from `src/context.ts`
- All types exported (`TenantRow`, `ApiKeyRow`, `CreateTenantResult`, `CreateApiKeyResult`) — route handlers have full type safety
- TypeScript compiles clean; no new test failures introduced

## Self-Check: PASSED

- FOUND: src/db/schema.ts
- FOUND: src/db/client.ts
- FOUND: src/context.ts
- FOUND: src/admin/tenant-service.ts
- FOUND: .planning/phases/02-tenant-mcp-shell/02-02-SUMMARY.md
- FOUND commit: 1581535 (Task 1)
- FOUND commit: 61c246e (Task 2)

---
*Phase: 02-tenant-mcp-shell*
*Completed: 2026-03-16*
