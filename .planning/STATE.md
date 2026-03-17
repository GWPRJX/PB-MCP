---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 4
current_plan: 04-02 complete
status: in_progress
stopped_at: "04-02 complete — syncKbArticles() + startKbScheduler() + 4 tests green 2026-03-17"
last_updated: "2026-03-17T14:19:00Z"
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 16
  completed_plans: 14
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

**Current Phase:** 4
**Current Plan:** 04-02 complete
**Status:** In progress

**Progress:**
```
[██████████] 100% (Phase 1+2+3 complete)
Phase 1 [██████████] 100% Database Foundation (4/4 plans done — human-verified 2026-03-16)
Phase 2 [██████████] 100% Tenant Management + MCP Shell (4/4 plans done — human-verified 2026-03-16)
Phase 3 [██████████] 100% ERP Domain Tools (4/4 plans done — human-verified 2026-03-17)
Phase 4 [████      ] 50%  YouTrack KB Sync (2/4 plans complete)
```

**Overall:** 3/4 phases complete (14/16 plans total)

---

## Phase Summary

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 1 | Database Foundation | INFRA-01 to INFRA-07 (7) | Complete (4/4 plans — human-verified 2026-03-16) |
| 2 | Tenant Management + MCP Shell | TENANT-01 to TENANT-07 + INFRA-02 (8) | Complete (4/4 plans — human-verified 2026-03-16) |
| 3 | ERP Domain Tools | INV-01 to INV-07, ORD-01 to ORD-06, CRM-01 to CRM-05 (18) | Complete (4/4 plans — human-verified 2026-03-17) |
| 4 | YouTrack KB Sync | KB-01 to KB-08 (8) | In progress (2/4 plans — 04-02 complete 2026-03-17) |

---

## Performance Metrics

**Plans executed:** 14
**Plans passed verification:** 14
**Plans failed verification:** 0
**Requirements completed:** 37/40 (INFRA-01 through INFRA-07 complete; TENANT-01 through TENANT-07 complete; INFRA-02 complete; INV-01 through INV-07 complete; ORD-01 through ORD-06 complete; CRM-01 through CRM-05 complete; all Phase 1+2+3 requirements verified end-to-end; KB schema foundation added Phase 4; KB-01 through KB-03 + KB-07 implemented by sync worker)

| Plan | Duration | Tasks | Files | Completed |
|------|----------|-------|-------|-----------|
| 01-01 | 8min | 2 | 16 | 2026-03-16 |
| 01-02 | 4min | 2 | 7 | 2026-03-16 |
| 01-03 | 6min | 2 | 9 | 2026-03-16 |
| 01-04 | 5min | 2 | 1 | 2026-03-16 |
| 02-01 | 3min | 2 | 6 | 2026-03-16 |
| 02-02 | 10min | 2 | 4 | 2026-03-16 |
| 02-03 | 7min | 2 | 5 | 2026-03-16 |
| 02-04 | 25min | 2 | 7 | 2026-03-16 |
| 03-01 | 5min | 2 | 4 | 2026-03-17 |
| 03-02 | 10min | 2 | 3 | 2026-03-17 |
| 03-03 | 15min | 2 | 4 | 2026-03-17 |
| 03-04 | 30min | 4 | 11 | 2026-03-17 |
| 04-01 | 2min | 2 | 2 | 2026-03-17 |
| 04-02 | 7min | 2 | 3 | 2026-03-17 |

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
- **syncKbArticles() tags/date serialization:** tags cast as ::text[] literal string, synced_at as .toISOString()::timestamptz inside cast TransactionSql — avoids cross-connection postgres.js helper serialization conflict
- **tsconfig.test.json:** Separate tsconfig extending main to include tests/** with rootDir=. for tsc --noEmit; main tsconfig rootDir=src excludes test files
- **check-pending.ts:** Startup migration alert using MIGRATION_ALERT=true gate; compares .up.sql file count vs schema_migrations version; all output via process.stderr.write
- **CI (INFRA-07):** GitHub Actions with postgres:17-alpine service, golang-migrate v4.19.1 pinned, assert-rls.sh as build gate; DATABASE_MIGRATION_URL (superuser) for migrations, DATABASE_URL (app_login) for vitest
- **Phase 1 complete:** Schema with RLS verified end-to-end (human checkpoint approved 2026-03-16); CI gate active on all PRs
- **Phase 2 complete:** Admin REST API + MCP shell verified end-to-end (human checkpoint approved 2026-03-16); MCP Inspector connected, tools/list returns empty array, auth rejection confirmed
- **Phase 3 complete:** 18 ERP read-only MCP tools verified end-to-end (human checkpoint approved 2026-03-17); tools/list returns 18 tools, 94/94 tests green
- **Auth lookup RLS bypass:** `lookupApiKeyByHash` uses a short-lived `postgres()` connection via `DATABASE_MIGRATION_URL` (superuser, no RLS) to resolve `key_hash` to `tenant_id` — necessary because `api_keys` RLS hides all rows when `app.current_tenant_id` is unset; this pool is read-only and closed after each call
- **API key format:** `pb_` + `randomBytes(32).toString('hex')` = 67-char key; SHA-256 hash stored; raw key returned once at creation
- **TenantService pattern:** All admin DB operations in `src/admin/tenant-service.ts`; route handlers import service functions — no raw SQL in routes
- **FORCE RLS on api_keys affects INSERTs:** `createTenant` and `createApiKey` must call `set_config('app.current_tenant_id', id, true)` in the same transaction before inserting into api_keys — even admin operations are blocked without context
- **listTenants uses superuser connection:** Cross-tenant aggregate JOIN on api_keys requires DATABASE_MIGRATION_URL (BYPASSRLS) — app_login sees zero rows for the JOIN without per-tenant context
- **Test cleanup requires superuser:** `DELETE FROM tenants` uses DATABASE_MIGRATION_URL — app_login has SELECT/INSERT/UPDATE only (no DELETE), intentional security boundary
- **buildServer() factory pattern:** Fastify instance exported from src/server.ts; used by tests via inject() and by src/index.ts for actual listen(); MCP routes registered on same instance in src/index.ts
- **MCP transport pattern:** Single `StreamableHTTPServerTransport` instance with `sessionIdGenerator: undefined` (stateless); connected once via `mcpServer.connect(transport)`; all /mcp route handlers share the instance; `reply.hijack()` required after `transport.handleRequest()` to prevent Fastify double-response
- **MCP auth middleware:** `extractAndValidateApiKey(request, reply, handler)` is sole entry point for tenant context; SHA-256 hashes X-Api-Key header → DB lookup → `tenantStorage.run({ tenantId, keyId }, handler)`; returns 401 JSON-RPC error on missing/invalid/revoked key
- **SSE GET test approach:** GET /mcp tests use `fetch` + `AbortController` instead of `app.inject()` — inject() hangs waiting for SSE stream to close; fetch can be aborted after headers arrive
- **Streamable HTTP URL decision:** Single `/mcp` endpoint (POST/GET/DELETE); tenant identified via X-Api-Key header, not URL path — resolved Open Question #2
- **Tool handler pattern (LOCKED):** All 18 ERP tool handlers: call getTenantId() → withTenantContext(tenantId, async (tx) => { const txSql = tx as unknown as postgres.Sql; ... }) → return toolError/toolSuccess; never throw
- **Tool test transport pattern (LOCKED):** Integration tests use stateless per-request McpServer + transport with enableJsonResponse: true; register domain tools inside the route handler (not in beforeAll); matches tests/mcp/transport.test.ts
- **COUNT(*) as string:** postgres.js returns COUNT(*) as string — always parseInt(count, 10) in pagination handlers
- **ERP migration 000004 applied:** Phase 3 ERP tables (products, stock_levels, suppliers, contacts, orders, order_line_items, invoices) applied to test DB 2026-03-17
- **createMcpServer() registers all 18 tools:** Wave 4 wiring — server.ts imports and calls registerInventoryTools + registerOrdersTools + registerCrmTools; (server as any).setToolRequestHandlers() hack removed
- **noContextSql pattern:** Separate postgres.js pool for RLS no-context tests — prevents post-transaction empty-string UUID cast errors in the ::uuid cast of the RLS policy
- **app-role DDL test setup:** REVOKE CREATE ON SCHEMA public FROM PUBLIC in beforeAll / GRANT back in afterAll — enforces DDL restriction test without permanently changing schema (PostgreSQL default grants CREATE to PUBLIC)
- **spawnSync timeout 60s:** tsx startup under parallel 12-file test suite load on Windows can exceed 10s; vitest testTimeout also increased to 60s

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
| 5 | YouTrack sandbox access: real instance or mock? | Phase 4 planning — RESOLVED: real instance at https://support.posibolt.com/ |
| 6 | KB-08 self-configuration: deliver in Phase 4 or defer within phase? | Phase 4 planning — RESOLVED: defer within phase (Very High complexity; criterion 5 in ROADMAP.md explicitly allows deferral) |

### YouTrack Instance Details (Phase 4)

- **Base URL:** https://support.posibolt.com/
- **Token:** stored in `.env` as `YOUTRACK_TOKEN` (never committed to git)
- **Project:** POSibolt V8 (shortName: P8, id: 0-17)
- **Root article:** P8-A-7 — "POSibolt REST-API" (parent=null, root-level)
- **Article count:** 50 articles total in P8 project (fits in single $top=100 request; $skip=100 returns empty)
- **Content format:** Markdown — headers, tables, code blocks, links
- **Hierarchy:** parent-child via `parentArticle` field — 15 direct children of P8-A-7, several with their own children
- **Key fields:** id, idReadable, summary, content, created, updated, tags, parentArticle
- **Query pattern:** `GET /api/articles?fields=...&query=project:P8&$top=100`
- **YOUTRACK API folder:** user-added subfolder with MD files of API docs (sync should include these)

### Research Flags

- Phase 4 research NOT needed — YouTrack structure confirmed from live instance exploration

---

## Todos

- [x] Decide tool naming convention — resolved: flat naming (list_products, list_orders, list_contacts)
- [x] Decide Streamable HTTP URL structure — resolved: single /mcp endpoint, per-request stateless transport, X-Api-Key header identifies tenant
- [x] Confirm YouTrack sandbox access — resolved: real instance at https://support.posibolt.com/ (50 articles, project P8)

---

## Blockers

None.

---

## Session Continuity

**Last session:** 2026-03-17
**Stopped at:** 04-02 complete — syncKbArticles() + startKbScheduler() + 4 integration tests green
**Next action:** Execute 04-03 — KB MCP tools (search_kb, get_kb_article, get_kb_sync_status)

---
*State initialized: 2026-03-07*
*Last updated: 2026-03-16 after plan 02-04 complete — MCP server shell + auth middleware + full test suite (Phase 2 human checkpoint approved)*
