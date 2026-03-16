---
phase: 01-database-foundation
plan: 02
subsystem: infra
tags: [sql, postgres, rls, migrations, golang-migrate, typescript, postgres-js]

# Dependency graph
requires:
  - "01-01 (package.json migrate scripts, tsconfig, vitest infrastructure)"
provides:
  - "db/migrations/000001: app_user (NOLOGIN) + app_login (LOGIN) PostgreSQL roles"
  - "db/migrations/000002: tenants control table without RLS"
  - "db/migrations/000003: api_keys table with ENABLE+FORCE RLS and tenant_isolation policy"
  - "src/db/client.ts: postgres.js singleton (sql) + withTenantContext transaction helper"
affects:
  - "01-03 (RLS test stubs filled in using these migration artifacts)"
  - "01-04 (CI pipeline asserts RLS coverage introduced here)"
  - "All Phase 2+ plans: api_keys FK parent (tenants) and RLS pattern established here"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ENABLE+FORCE ROW LEVEL SECURITY on all tenant-bearing tables"
    - "RLS policy: current_setting('app.current_tenant_id', true)::uuid — null-safe (no error when unset)"
    - "withTenantContext: sql.begin() wraps fn with SET LOCAL via set_config — transaction-scoped, prevents pool contamination"
    - "Role hierarchy: app_user (NOLOGIN, grants) -> app_login (LOGIN, inherits grants via GRANT app_user TO app_login)"
    - "Idempotent role creation: DO $$ IF NOT EXISTS (SELECT FROM pg_roles...) pattern"

key-files:
  created:
    - "db/migrations/000001_create_roles.up.sql — app_user NOLOGIN + app_login LOGIN + GRANT app_user TO app_login"
    - "db/migrations/000001_create_roles.down.sql — REVOKE + DROP both roles"
    - "db/migrations/000002_create_tenants.up.sql — tenants table (id, name, slug UNIQUE, plan, status, timestamps), no RLS"
    - "db/migrations/000002_create_tenants.down.sql — REVOKE grants + DROP TABLE"
    - "db/migrations/000003_create_api_keys.up.sql — api_keys with ENABLE+FORCE RLS, tenant_isolation policy, GRANT to app_user"
    - "db/migrations/000003_create_api_keys.down.sql — DROP POLICY + DISABLE RLS + REVOKE + DROP TABLE"
    - "src/db/client.ts — postgres.js singleton (sql) + withTenantContext<T> function"
  modified: []

key-decisions:
  - "tenants table has NO RLS — it is the tenant registry itself, not a tenant-bearing table; app_user needs SELECT for API key resolution"
  - "api_keys uses both ENABLE and FORCE ROW LEVEL SECURITY — ENABLE alone does not protect the table owner"
  - "current_setting(..., true) second arg true returns NULL (not error) when app.current_tenant_id is unset — queries outside tenant context return zero rows, not exceptions"
  - "withTenantContext casts tx to postgres.Sql to access tagged-template call signature lost through Omit<> in strict TypeScript"
  - "Roles are non-superuser with no BYPASSRLS — required for FORCE ROW LEVEL SECURITY to take effect (INFRA-05)"

requirements-completed:
  - INFRA-03
  - INFRA-04
  - INFRA-05

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 1 Plan 02: SQL Migrations + Database Client Summary

**Three migration pairs creating the PostgreSQL role hierarchy (app_user/app_login), tenants control table, and api_keys as the first RLS-protected tenant-bearing table — establishing the canonical RLS pattern for all subsequent ERP tables.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-16T08:15:04Z
- **Completed:** 2026-03-16T08:18:55Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Migration 000001 creates `app_user` (NOLOGIN) and `app_login` (LOGIN) with idempotent IF NOT EXISTS guards — both roles are non-superuser with no BYPASSRLS, satisfying INFRA-05
- Migration 000002 creates the `tenants` control table with all required columns (`id`, `name`, `slug` UNIQUE, `plan`, `status`, `created_at`, `updated_at`) — intentionally has NO RLS since it is the registry itself
- Migration 000003 creates `api_keys` with `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` and `CREATE POLICY tenant_isolation` using `current_setting('app.current_tenant_id', true)::uuid` — null-safe behavior returns zero rows (not error) when no tenant context is set
- `src/db/client.ts` exports `sql` (postgres.js singleton, max 10 connections) and `withTenantContext<T>` (transaction-scoped SET LOCAL prevents pool contamination)
- `npx tsc --noEmit` exits 0 — TypeScript strict mode satisfied
- `npx vitest run tests/db/` exits 0 — all 18 todo stubs pass

## Task Commits

1. **Task 1: Migrations 000001 (roles) and 000002 (tenants)** — `ff358fc` (feat)
2. **Task 2: Migration 000003 (api_keys RLS) + postgres.js client** — `eec14fd` (feat)

**Plan metadata:** (docs commit to follow)

## RLS Pattern Established

The canonical pattern used by `000003_create_api_keys.up.sql` (and all future tenant-bearing tables):

```sql
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON api_keys TO app_user;
```

## Files Created

- `db/migrations/000001_create_roles.up.sql` — roles migration (idempotent)
- `db/migrations/000001_create_roles.down.sql` — roles rollback
- `db/migrations/000002_create_tenants.up.sql` — tenants table, no RLS
- `db/migrations/000002_create_tenants.down.sql` — tenants rollback
- `db/migrations/000003_create_api_keys.up.sql` — api_keys with RLS
- `db/migrations/000003_create_api_keys.down.sql` — api_keys rollback
- `src/db/client.ts` — postgres.js client singleton + withTenantContext helper

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type error in withTenantContext**
- **Found during:** Task 2
- **Issue:** `TransactionSql` in postgres.js types is defined as `Omit<Sql, 'begin' | ...>`, which can cause TypeScript strict mode to lose the tagged-template call signatures when the type is used as a callback parameter. `tsc --noEmit` reported: "This expression is not callable. Type 'TransactionSql<{}>' has no call signatures."
- **Fix:** Inside the `sql.begin()` callback, cast `tx` to `postgres.Sql` via `as unknown as postgres.Sql` before using the tagged-template literal. The `TransactionSql` type retains full functionality at runtime; the cast is safe and documented in the source comment.
- **Files modified:** `src/db/client.ts`
- **Commit:** `eec14fd`

## Self-Check: PASSED

All 7 files confirmed present on disk. Both task commits (ff358fc, eec14fd) confirmed in git log.
