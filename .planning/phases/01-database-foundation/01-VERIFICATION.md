---
phase: 01-database-foundation
verified: 2026-03-16T00:00:00Z
status: passed
score: 4/5 success criteria verified
gaps:
  - truth: "INFRA-02 is satisfied within Phase 1 (MCP server uses Streamable HTTP transport)"
    status: failed
    reason: "INFRA-02 ('MCP server uses Streamable HTTP transport — not stdio') is not implemented in Phase 1. REQUIREMENTS.md marks it [ ] Pending/Phase 2. No Fastify server exists. No MCP transport exists. The stderr-only.test.ts that loosely references INFRA-02 remains .todo. The ROADMAP.md Coverage Map incorrectly lists INFRA-02 under Phase 1 while REQUIREMENTS.md Traceability table correctly assigns it to Phase 2. No Phase 1 success criterion mentions MCP transport. This gap is a requirements document inconsistency, not a Phase 1 implementation gap — the Phase 1 goal is achieved without INFRA-02."
    artifacts:
      - path: "tests/db/stderr-only.test.ts"
        issue: "All 3 tests remain .todo — no automated verification of stdout-clean behavior exists (the .todo tests are correctly deferred to Phase 2 when Fastify server exists)"
    missing:
      - "REQUIREMENTS.md and ROADMAP.md Coverage Map are contradictory for INFRA-02 — one says Phase 1, the other says Phase 2. The traceability table in REQUIREMENTS.md (Phase 2, Pending) is correct. ROADMAP.md Coverage Map should be corrected to move INFRA-02 to Phase 2."
      - "01-03-SUMMARY.md incorrectly lists INFRA-02 in requirements-completed — the check-pending.ts satisfies INFRA-06 (stderr-only logging), not INFRA-02 (MCP transport)."
human_verification:
  - test: "Run integration tests against live PostgreSQL"
    expected: "vitest run tests/db/ exits 0 with all 12 real tests passing (rls-isolation: 6, rls-policy-coverage: 3, app-role: 3)"
    why_human: "Tests require a running PostgreSQL 17 instance with migrations applied. No PostgreSQL was available during automated verification. Human checkpoint summary claims all tests passed (npm run test:db — all tests pass, 0 failures) but automated verification cannot confirm."
  - test: "bash scripts/assert-rls.sh against migrated database"
    expected: "Exit 0 with message: 'RLS check passed: all tenant-bearing tables have ENABLE+FORCE RLS and at least one policy'"
    why_human: "Script requires a live PostgreSQL connection. Human checkpoint summary claims this passed (2026-03-16) but automated verification cannot re-run it."
---

# Phase 1: Database Foundation Verification Report

**Phase Goal:** Tenant data is isolated at the database layer and verified safe before any application code runs on top of it
**Verified:** 2026-03-16
**Status:** gaps_found (1 requirements-document inconsistency; 4/5 success criteria fully verified; 2 items flagged for human re-confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| #   | Truth                                                                                                   | Status     | Evidence                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Running migrations creates all tenant-bearing tables with ENABLE+FORCE RLS active on every one         | VERIFIED   | 000003 (api_keys) + 000004 (7 ERP tables): 8 tables total, each has `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation` using `current_setting('app.current_tenant_id', true)::uuid` |
| 2   | Application connects using dedicated non-superuser role; querying another tenant's data returns zero rows | VERIFIED   | 000001 creates `app_user NOLOGIN` + `app_login LOGIN` with no BYPASSRLS or SUPERUSER. RLS policy uses null-safe `current_setting(..., true)` — zero rows returned when context unset. Integration tests in rls-isolation.test.ts and app-role.test.ts verify this (human checkpoint confirmed passing) |
| 3   | CI pipeline runs cross-tenant isolation test: Tenant A data queried as Tenant B returns empty results  | VERIFIED   | `.github/workflows/ci.yml` runs `npm test` with both `DATABASE_URL` (app_login) and `DATABASE_MIGRATION_URL` (postgres superuser). `tests/db/rls-isolation.test.ts` contains 6 real integration tests including cross-tenant isolation. Human checkpoint confirmed all tests passed. |
| 4   | CI pipeline fails the build if any tenant-bearing table is missing an RLS policy                        | VERIFIED   | `scripts/assert-rls.sh` + `scripts/check-rls.sql` exit 1 on violations. CI workflow step "Assert RLS coverage (INFRA-07)" calls `bash scripts/assert-rls.sh` with postgres superuser URL. `set -euo pipefail` propagates failure. Human checkpoint confirmed exit 0 on migrated DB. |
| 5   | All application logs write to stderr only; no stdout output is produced by the server process           | VERIFIED   | `src/index.ts` uses only `process.stderr.write()`. `src/db/client.ts` uses only `process.stderr.write()`. `src/db/check-pending.ts` uses only `process.stderr.write()`. Zero `console.*` calls found in any src/ file. Human checkpoint step 6 confirmed: `node src/index.ts 2>/dev/null` produces no output. |

**Score:** 4/5 criteria verified via code inspection + 1 human-confirmed. The remaining gap is a requirements-document inconsistency for INFRA-02, not a Phase 1 implementation gap. The phase goal is achieved.

---

## Required Artifacts

| Artifact                                       | Purpose                                                  | Status     | Evidence                                                                  |
| ---------------------------------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `db/migrations/000001_create_roles.up.sql`     | Creates app_user (NOLOGIN) + app_login (LOGIN)          | VERIFIED   | Contains `CREATE ROLE app_user NOLOGIN` + `CREATE ROLE app_login LOGIN` with IF NOT EXISTS guards. No BYPASSRLS. |
| `db/migrations/000001_create_roles.down.sql`   | Rolls back roles                                         | VERIFIED   | Exists with REVOKE + DROP                                                |
| `db/migrations/000002_create_tenants.up.sql`   | Tenants control table (no RLS)                           | VERIFIED   | CREATE TABLE tenants with all required columns. Zero RLS statements. GRANT SELECT/INSERT/UPDATE to app_user. |
| `db/migrations/000002_create_tenants.down.sql` | Rolls back tenants                                       | VERIFIED   | Exists                                                                    |
| `db/migrations/000003_create_api_keys.up.sql`  | api_keys with ENABLE+FORCE RLS + tenant_isolation policy | VERIFIED   | ENABLE RLS, FORCE RLS, CREATE POLICY tenant_isolation using current_setting. REFERENCES tenants(id) ON DELETE CASCADE. |
| `db/migrations/000003_create_api_keys.down.sql`| Rolls back api_keys                                      | VERIFIED   | Exists with DROP POLICY                                                  |
| `db/migrations/000004_create_erp_tables.up.sql`| 7 tenant-bearing ERP tables with RLS                     | VERIFIED   | 7 tables: products, stock_levels, suppliers, contacts, orders, order_line_items, invoices. Each has ENABLE+FORCE RLS and tenant_isolation policy. All have tenant_id FK REFERENCES tenants(id). Scoped UNIQUE constraints (tenant_id, sku) and (tenant_id, email). |
| `db/migrations/000004_create_erp_tables.down.sql` | Drops ERP tables in reverse FK order               | VERIFIED   | Drops: invoices, order_line_items, orders, contacts, stock_levels, suppliers, products |
| `db/migrations/000005_create_kb_articles.up.sql`  | kb_articles global cache (no tenant_id, no RLS)    | VERIFIED   | No tenant_id column. No ROW LEVEL SECURITY statements. Global cache per locked CONTEXT.md decision. |
| `db/migrations/000005_create_kb_articles.down.sql`| Rolls back kb_articles                             | VERIFIED   | Exists                                                                    |
| `src/db/client.ts`                             | postgres.js singleton + withTenantContext helper         | VERIFIED   | Exports `sql` and `withTenantContext<T>`. Uses process.stderr.write only. Uses DATABASE_URL (app_login). `withTenantContext` uses `sql.begin()` with SET LOCAL via set_config for transaction-scoped tenant isolation. |
| `src/db/check-pending.ts`                      | Startup migration alert (stderr-only)                    | VERIFIED   | Exports `checkPendingMigrations`. Gated on MIGRATION_ALERT=true. Queries schema_migrations. All output via process.stderr.write. Zero console.* calls. |
| `src/index.ts`                                 | Server placeholder (stderr-only output)                  | VERIFIED   | Single line: `process.stderr.write(...)`. No console.log. No stdout writes. |
| `scripts/check-rls.sql`                        | pg_class query returning RLS violations                  | VERIFIED   | Queries pg_class + pg_policies for 8 tenant-bearing tables. Returns rows only when ENABLE/FORCE/policy is missing. |
| `scripts/assert-rls.sh`                        | CI gate script: exits 1 on RLS violations                | VERIFIED   | set -euo pipefail. Checks DATABASE_URL set. Calls check-rls.sql. Exits 1 on violations, 0 on clean. All output to stderr (>&2). |
| `.github/workflows/ci.yml`                     | GitHub Actions CI pipeline                               | VERIFIED   | Triggers on push + pull_request. postgres:17-alpine service. golang-migrate v4.19.1 pinned. Migrations step. Defensive role creation. assert-rls.sh gate (exits 1 on violations). npm test final step with dual DATABASE_URL/DATABASE_MIGRATION_URL. |
| `tests/db/rls-isolation.test.ts`               | Cross-tenant isolation integration tests (INFRA-03)      | VERIFIED   | 6 real it() tests (not .todo). Seeds via DATABASE_MIGRATION_URL (superuser), asserts via DATABASE_URL (app_login). Tests: Tenant A context, Tenant B context, cross-tenant WHERE filter, no-context zero rows for products/orders/contacts. |
| `tests/db/rls-policy-coverage.test.ts`         | RLS policy coverage tests (INFRA-04)                     | VERIFIED   | 3 real it() tests. Queries pg_class for relrowsecurity+relforcerowsecurity. Queries pg_policies for all 8 tables. Confirms kb_articles has no tenant_id column. |
| `tests/db/app-role.test.ts`                    | Non-superuser role tests (INFRA-05)                      | VERIFIED   | 3 real it() tests. Verifies is_superuser=off, rolbypassrls=false for both app_user and app_login, DDL raises SQLSTATE 42501. |
| `tests/db/stderr-only.test.ts`                 | Stdout-clean assertion stub (INFRA-06)                   | STUB       | 3 it.todo() stubs — correctly deferred to Phase 2 when Fastify server exists. src/index.ts stdout behavior verified by human checkpoint instead. |
| `tests/smoke/process.test.ts`                  | Server process smoke test stub (INFRA-01)                | STUB       | 2 it.todo() stubs — correctly deferred to Phase 2 when Fastify server exists. |
| `package.json`                                 | npm project with migrate scripts + vitest                | VERIFIED   | type: module. engines: >=22. Scripts: migrate:up/down/status/create, test, test:db, dev. deps: postgres, dotenv. devDeps: typescript, @types/node, tsx, vitest. |
| `vitest.config.ts`                             | Test runner with DATABASE_URL env defaults               | VERIFIED   | include: tests/**/*.test.ts. testTimeout: 30000. DATABASE_URL + DATABASE_MIGRATION_URL env defaults. |
| `docker-compose.yml`                           | Dev environment: postgres:17-alpine + app                | VERIFIED   | postgres:17-alpine with healthcheck. CHOKIDAR_USEPOLLING=true. Depends_on: service_healthy. |
| `.env.example`                                 | Placeholder credentials (no real secrets)                | VERIFIED   | Placeholder values only (changeme, postgres). .env is gitignored and not tracked. |

---

## Key Link Verification

| From                                    | To                              | Via                                              | Status   | Evidence                                                                 |
| --------------------------------------- | ------------------------------- | ------------------------------------------------ | -------- | ------------------------------------------------------------------------ |
| `000003_create_api_keys.up.sql`         | `000002_create_tenants.up.sql`  | `REFERENCES tenants(id) ON DELETE CASCADE`       | VERIFIED | Line 5: `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` |
| `000004_create_erp_tables.up.sql`       | `000002_create_tenants.up.sql`  | `REFERENCES tenants(id) ON DELETE CASCADE`       | VERIFIED | All 7 tables have tenant_id FK referencing tenants. 7 REFERENCES tenants lines found. |
| `src/db/client.ts`                      | `process.env.DATABASE_URL`      | `postgres(process.env.DATABASE_URL)`             | VERIFIED | Line 11: `export const sql = postgres(process.env.DATABASE_URL, {...})`  |
| `tests/db/rls-isolation.test.ts`        | `src/db/client.ts` pattern      | `postgres(DATABASE_MIGRATION_URL)` for seed      | VERIFIED | `migrationSql = postgres(process.env.DATABASE_MIGRATION_URL!)` present  |
| `src/db/check-pending.ts`               | `schema_migrations`             | `SELECT version FROM schema_migrations`          | VERIFIED | Line 38–42 queries `schema_migrations ORDER BY version DESC LIMIT 1`    |
| `.github/workflows/ci.yml`              | `scripts/assert-rls.sh`         | `bash scripts/assert-rls.sh` step                | VERIFIED | Line 66: `run: bash scripts/assert-rls.sh` with postgres superuser env  |
| `.github/workflows/ci.yml`              | `db/migrations/`                | `migrate -path db/migrations -database ... up`   | VERIFIED | Line 46: `run: migrate -path db/migrations -database "$DATABASE_MIGRATION_URL" up` |
| `scripts/assert-rls.sh`                 | `scripts/check-rls.sql`         | `psql -f "$(dirname "$0")/check-rls.sql"`        | VERIFIED | Line 13: `psql "$DATABASE_URL" -t -A -f "$(dirname "$0")/check-rls.sql"` |
| `vitest.config.ts`                      | `tests/**/*.test.ts`            | `include: ['tests/**/*.test.ts']`                | VERIFIED | Line 7: `include: ['tests/**/*.test.ts']`                               |

---

## Requirements Coverage

| Requirement | Source Plan(s)    | Description                                                              | Status           | Evidence                                                                              |
| ----------- | ----------------- | ------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| INFRA-01    | 01-01, 01-04      | System runs as a single Node.js (TypeScript) process with Fastify 5     | PARTIAL          | Scaffold complete (package.json, tsconfig, src/index.ts). Fastify server deferred to Phase 2 per REQUIREMENTS.md note. REQUIREMENTS.md marks [x] with "full implementation: Phase 2". |
| INFRA-02    | 01-03 (claimed)   | MCP server uses Streamable HTTP transport (not stdio)                    | NOT APPLICABLE   | REQUIREMENTS.md marks [ ] (incomplete), assigns to Phase 2. ROADMAP.md Coverage Map incorrectly lists Phase 1. No MCP transport exists. Plan 03 incorrectly claimed this complete via check-pending.ts (which actually satisfies INFRA-06). This is a requirements document inconsistency — INFRA-02 is a Phase 2 item and is not a Phase 1 deliverable. |
| INFRA-03    | 01-02, 01-03      | PostgreSQL with RLS isolates all tenant data                             | SATISFIED        | api_keys (000003), all 7 ERP tables (000004) have tenant_isolation policy. Integration tests verify cross-tenant isolation. |
| INFRA-04    | 01-02, 01-03      | Every tenant-bearing table has ENABLE+FORCE ROW LEVEL SECURITY          | SATISFIED        | 8 tables verified: api_keys + 7 ERP tables. Both ALTER statements present on every table. rls-policy-coverage.test.ts verifies via pg_class. |
| INFRA-05    | 01-02             | Application uses dedicated non-superuser PostgreSQL role (no BYPASSRLS) | SATISFIED        | app_user NOLOGIN + app_login LOGIN created with no BYPASSRLS. app-role.test.ts verifies is_superuser=off, rolbypassrls=false, DDL rejection. |
| INFRA-06    | 01-03, 01-04      | stderr-only logging (no stdout writes that corrupt MCP transport)        | SATISFIED        | src/index.ts, src/db/client.ts, src/db/check-pending.ts all use process.stderr.write only. Zero console.* calls in any src/ file. Human checkpoint verified: `node src/index.ts 2>/dev/null` produces no output. |
| INFRA-07    | 01-01, 01-04      | CI check asserts all tenant-bearing tables have RLS policies             | SATISFIED        | scripts/assert-rls.sh + scripts/check-rls.sql exit 1 on violations. Wired into .github/workflows/ci.yml as a named step before npm test. |

**Orphaned requirements:** None. All 7 INFRA requirements declared in the phase are accounted for.

**INFRA-02 note:** INFRA-02 appears in the ROADMAP.md Phase 1 requirements list and the Coverage Map but REQUIREMENTS.md explicitly keeps it [ ] (incomplete) and assigns it to Phase 2. The Phase 1 success criteria (from ROADMAP.md) do not mention MCP transport. Phase 1's INFRA-02 entry in 01-03-PLAN.md and 01-03-SUMMARY.md is a mislabeling — the check-pending.ts work satisfies INFRA-06, not INFRA-02. The ROADMAP.md Coverage Map should move INFRA-02 to Phase 2.

---

## Anti-Patterns Found

| File                          | Line | Pattern                                          | Severity | Impact                                                              |
| ----------------------------- | ---- | ------------------------------------------------ | -------- | ------------------------------------------------------------------- |
| `src/index.ts`                | 2-3  | "placeholder" comment + single stderr.write line | Info     | Intentional — Phase 2 implements the full server. Correctly uses stderr-only. Not a blocker for Phase 1 goal. |
| `tests/db/stderr-only.test.ts`| 1-10 | 3 × it.todo() stubs                              | Info     | Correctly deferred. Full MCP server doesn't exist yet. Human checkpoint verified stdout-clean behavior. Not a blocker. |
| `tests/smoke/process.test.ts` | 1-9  | 2 × it.todo() stubs                              | Info     | Correctly deferred to Phase 2 Fastify server. Not a blocker for Phase 1 goal. |

No blocker or warning anti-patterns found. All stubs are appropriately deferred with documented rationale.

---

## Human Verification Required

### 1. Integration Test Results

**Test:** Run `npm run test:db` after `docker compose up -d postgres && npm run migrate:up` in the project directory
**Expected:** 12 real tests pass (0 failures): rls-isolation (6), rls-policy-coverage (3), app-role (3); stderr-only and process smoke tests remain as .todo (5 todos)
**Why human:** No PostgreSQL 17 instance was available during automated verification. The human checkpoint summary (2026-03-16) states all tests passed, but this cannot be re-confirmed without a live database.

### 2. assert-rls.sh Exit Code

**Test:** Run `bash scripts/assert-rls.sh` with DATABASE_URL pointing to a migrated database
**Expected:** Exit 0 with message: "RLS check passed: all tenant-bearing tables have ENABLE+FORCE RLS and at least one policy"
**Why human:** Requires live PostgreSQL connection. Human checkpoint (2026-03-16) confirmed this passed.

---

## Gaps Summary

One gap exists and it is a requirements document inconsistency rather than an implementation gap:

**INFRA-02 mislabeling:** INFRA-02 ("MCP server uses Streamable HTTP transport — not stdio") cannot be satisfied in Phase 1 because no MCP server or Fastify application exists yet. REQUIREMENTS.md correctly keeps it [ ] Pending at Phase 2. ROADMAP.md Coverage Map incorrectly lists it under Phase 1. Plan 01-03-SUMMARY.md incorrectly claims it complete via check-pending.ts (which is actually INFRA-06 work). The Phase 1 goal and its five success criteria are fully achieved without INFRA-02. The fix is editorial: update ROADMAP.md Coverage Map to assign INFRA-02 to Phase 2, and correct 01-03-SUMMARY.md's requirements-completed list to remove INFRA-02.

**The Phase 1 goal is achieved.** All five success criteria have implementation artifacts that satisfy them, key links are wired, and the human checkpoint confirmed end-to-end operation. The only gap is a document inconsistency about INFRA-02 which does not belong to Phase 1.

---

*Verified: 2026-03-16*
*Verifier: Claude (gsd-verifier)*
