---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 1 — Database Foundation
current_plan: 01-04 (ready to execute)
status: In progress
stopped_at: Completed 01-03-PLAN.md — ERP migrations, kb_articles, RLS integration tests, check-pending.ts
last_updated: "2026-03-16T08:30:46Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# STATE: PB MCP

*Project memory — updated at each session boundary*

---

## Project Reference

**Core Value:** Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

**Total Phases:** 4
**Total v1 Requirements:** 40

---

## Current Position

**Current Phase:** 1 — Database Foundation
**Current Plan:** 01-04 (ready to execute)
**Status:** In progress — plan 01-03 complete

**Progress:**
```
Phase 1 [██████    ] 75%  Database Foundation (3/4 plans done)
Phase 2 [          ] 0%   Tenant Management + MCP Shell
Phase 3 [          ] 0%   ERP Domain Tools
Phase 4 [          ] 0%   YouTrack KB Sync
```

**Overall:** 0/4 phases complete (3/16 total plans)

---

## Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Database Foundation | INFRA-01 to INFRA-07 (7) | In progress (2/4 plans) |
| 2 | Tenant Management + MCP Shell | TENANT-01 to TENANT-07 (7) | Not started |
| 3 | ERP Domain Tools | INV-01 to INV-07, ORD-01 to ORD-06, CRM-01 to CRM-05 (18) | Not started |
| 4 | YouTrack KB Sync | KB-01 to KB-08 (8) | Not started |

---

## Performance Metrics

**Plans executed:** 2
**Plans passed verification:** 2
**Plans failed verification:** 0
**Requirements completed:** 7/40 (INFRA-01, INFRA-07, INFRA-03, INFRA-04, INFRA-05, INFRA-02 (partial), INFRA-06 (partial))

| Plan | Duration | Tasks | Files | Completed |
|------|----------|-------|-------|-----------|
| 01-01 | 8min | 2 | 16 | 2026-03-16 |
| 01-02 | 4min | 2 | 7 | 2026-03-16 |
| 01-03 | 6min | 2 | 9 | 2026-03-16 |

---

## Accumulated Context

### Architectural Decisions

- **Stack:** TypeScript / Node.js 22 LTS, Fastify 5, PostgreSQL with RLS, Drizzle ORM 0.45.x, postgres.js 3.4.x, MCP SDK 1.27.x, zod 3.25+
- **Transport:** MCP Streamable HTTP (not stdio)
- **Tenant isolation:** PostgreSQL Row-Level Security on shared schema (not per-schema, not per-database)
- **Auth (v1):** API-key-per-tenant, SHA-256 hashed at rest, resolved per request to `tenant_id`, sets `SET LOCAL app.current_tenant_id` for RLS
- **Tenant context propagation:** `AsyncLocalStorage` — never module-level variables
- **Logging:** stderr only — stdout must never receive writes (MCP transport corruption risk)
- **Admin UI:** Scalar auto-generated from OpenAPI schema (no custom frontend)
- **Write tools:** Deferred to v2 — all Phase 3 tools are read-only
- **OAuth 2.1:** Deferred to v2
- **golang-migrate:** Static binary, not an npm package — npm scripts are wrappers only
- **Test stubs:** Use `it.todo()` (not empty `it()` bodies) so vitest exits 0 before DB infrastructure exists
- **Dual database URLs:** `DATABASE_URL` (app_login, non-superuser, RLS enforced) vs `DATABASE_MIGRATION_URL` (postgres, DDL privileges)
- **RLS pattern:** ENABLE+FORCE ROW LEVEL SECURITY on all tenant-bearing tables; `current_setting('app.current_tenant_id', true)::uuid` in policy (null-safe — returns zero rows, not error, when unset)
- **tenants table:** No RLS — it IS the tenant registry itself, not a tenant-bearing table
- **postgres.js TransactionSql:** Cast `tx as unknown as postgres.Sql` to access template-tag call signature in strict TypeScript (safe — runtime behavior unchanged)
- **Scoped uniqueness:** UNIQUE(tenant_id, sku) and UNIQUE(tenant_id, email) — NOT global — prevents cross-tenant uniqueness leaks via constraint errors
- **order_line_items:** No updated_at column — financial line items are append-only records
- **kb_articles:** Global cache, no tenant_id, no RLS — locked decision from Phase 1 context; all tenants share YouTrack article data
- **tsconfig.test.json:** Separate tsconfig extending main to include tests/** with rootDir=. for tsc --noEmit; main tsconfig rootDir=src excludes test files
- **check-pending.ts:** Startup migration alert using MIGRATION_ALERT=true gate; compares .up.sql file count vs schema_migrations version; all output via process.stderr.write

### Critical Pitfalls (must not skip)

1. **Pool contamination** — use `SET LOCAL` (transaction-scoped), not `SET` (session-scoped); reset in `finally` block; CI cross-tenant test required
2. **RLS bypass** — app must connect as dedicated non-superuser role (no BYPASSRLS); table owner must not be the app role; enforce `FORCE ROW LEVEL SECURITY`
3. **New tables missing RLS** — CI check must assert every tenant-bearing table has policies; must fail the build, not warn
4. **Global tenant state** — `AsyncLocalStorage` for all tenant context; concurrent request race condition is silent and catastrophic
5. **Idempotency on financial writes** — `create_invoice`, `create_order` must accept `idempotency_key` (v2 write tools)

### Open Questions (decide before/during planning)

| # | Question | Decide Before |
|---|----------|---------------|
| 1 | Tool naming: flat `list_products` vs domain-namespaced `list_inventory_products` | Phase 3 planning |
| 2 | Streamable HTTP URL: single `/mcp` endpoint vs per-tenant `/{slug}/mcp` | Phase 2 planning |
| 3 | Tax calculation scope: fixed rate per tenant vs per-line-item configurable | Phase 3 planning |
| 4 | PgBouncer in v1 or plain postgres.js pool? | Phase 1 planning (document either way) |
| 5 | YouTrack sandbox access: real instance or mock? | Phase 4 planning |
| 6 | KB-08 self-configuration: deliver in Phase 4 or defer within phase? | Phase 4 planning |

### Research Flags

- Phase 3: Consider `/gsd:research-phase` for invoice tax calculation and order state machine edge cases
- Phase 4: Consider `/gsd:research-phase` for YouTrack pagination edge cases and article content format variability

---

## Todos

- [ ] Decide tool naming convention before Phase 3 planning begins
- [ ] Decide Streamable HTTP URL structure before Phase 2 planning begins
- [ ] Confirm YouTrack sandbox access before Phase 4 planning begins

---

## Blockers

None.

---

## Session Continuity

**Last session:** 2026-03-16T08:30:46Z
**Stopped at:** Completed 01-03-PLAN.md — ERP migrations (7 tables with RLS), kb_articles (global cache), RLS integration tests (12 real it() tests), check-pending.ts startup alert
**Next action:** Run plan 01-04 (GitHub Actions CI workflow + human verification checkpoint)

---
*State initialized: 2026-03-07*
*Last updated: 2026-03-16 after plan 01-02 execution*
