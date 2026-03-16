# Roadmap: PB MCP

**Project:** Multi-Tenant ERP MCP Server
**Granularity:** Coarse
**Total v1 Requirements:** 40
**Coverage:** 40/40 mapped (100%) ✓
**Created:** 2026-03-07

---

## Phases

- [x] **Phase 1: Database Foundation** - PostgreSQL schema with RLS enforcing tenant isolation; CI-verified cross-tenant data separation before any application layer is built
- [ ] **Phase 2: Tenant Management + MCP Shell** - Admin REST API for tenant provisioning, API key management, and the MCP server transport layer with per-request tenant auth middleware
- [ ] **Phase 3: ERP Domain Tools** - All read-only MCP tools for Inventory, Orders/Billing, and CRM giving AI clients full query access to tenant ERP data
- [ ] **Phase 4: YouTrack KB Sync** - YouTrack article cache, scheduled sync, and KB query tools so AI clients can search live API documentation

---

## Phase Details

### Phase 1: Database Foundation
**Goal**: Tenant data is isolated at the database layer and verified safe before any application code runs on top of it
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. Running migrations creates all tenant-bearing tables with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` active on every one of them
  2. The application connects using a dedicated non-superuser role; connecting as that role and querying another tenant's data returns zero rows, not an error
  3. CI pipeline runs a cross-tenant isolation test: seeding data for Tenant A and querying as Tenant B returns empty results
  4. CI pipeline fails the build if any tenant-bearing table is missing an RLS policy
  5. All application logs write to stderr only; no stdout output is produced by the server process
**Plans:** 4 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffold + all test stubs (Wave 1) — completed 2026-03-16
- [x] 01-02-PLAN.md — Foundation migrations: roles, tenants, api_keys (Wave 2) — completed 2026-03-16
- [x] 01-03-PLAN.md — ERP + KB migrations, integration tests, startup check (Wave 3) — completed 2026-03-16
- [x] 01-04-PLAN.md — GitHub Actions CI workflow + human verification checkpoint (Wave 4) — completed 2026-03-16

### Phase 2: Tenant Management + MCP Shell
**Goal**: A developer can provision a new tenant, receive an API key, and connect an MCP client that authenticates correctly and receives an empty tool list
**Depends on**: Phase 1
**Requirements**: TENANT-01, TENANT-02, TENANT-03, TENANT-04, TENANT-05, TENANT-06, TENANT-07
**Success Criteria** (what must be TRUE):
  1. `POST /admin/tenants` with name, slug, and plan returns `{ tenantId, apiKey }` — the raw API key is shown exactly once and never retrievable again
  2. `GET /admin/tenants` lists all tenants with status and key count; `GET /admin/tenants/:id` returns full tenant detail
  3. Admin can issue additional API keys for a tenant and revoke any key; revoked keys are immediately rejected
  4. An MCP client presenting a valid API key in the request header receives a successful `tools/list` response (empty list) from the MCP server; an invalid or missing key is rejected with an auth error
  5. Developer onboarding end-to-end — clone repo, run migrations, create tenant, connect Claude Desktop or MCP Inspector — completes in under 10 minutes
**Plans**: TBD

### Phase 3: ERP Domain Tools
**Goal**: An AI client authenticated as a tenant can query inventory, orders, billing, and contacts through MCP tools, covering all read-only ERP operations
**Depends on**: Phase 2
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, ORD-01, ORD-02, ORD-03, ORD-04, ORD-05, ORD-06, CRM-01, CRM-02, CRM-03, CRM-04, CRM-05
**Success Criteria** (what must be TRUE):
  1. AI client can ask "what products do we carry?" and receive a paginated product list with name, SKU, price, and description; "which products are low on stock?" returns only those below reorder threshold
  2. AI client can ask "show me open orders this month" and receive filtered, paginated orders with line items and linked contact; "which invoices are overdue?" returns only past-due unpaid invoices with a payment summary
  3. AI client can ask "look up customer Jane Smith" and receive contact detail, order history, and outstanding invoice balance in separate tool calls — all scoped to the authenticated tenant's data
  4. All 18 tools enforce tenant isolation: a query run with Tenant A's API key never returns data belonging to Tenant B
  5. All list tools support pagination (limit + cursor) and return total_count; all tools return structured error responses with error code and field on invalid input
**Plans**: TBD

### Phase 4: YouTrack KB Sync
**Goal**: AI clients can search live YouTrack API documentation, and the sync worker keeps the local cache current automatically
**Depends on**: Phase 3
**Requirements**: KB-01, KB-02, KB-03, KB-04, KB-05, KB-06, KB-07, KB-08
**Success Criteria** (what must be TRUE):
  1. Sync worker pulls all articles from the YouTrack REST API using paginated requests (looping past the 42-item default) and stores them in the local PostgreSQL cache; a KB with more than 42 articles is fully captured, not silently truncated
  2. AI client can call `search_kb` with a keyword and receive matching article summaries; `get_kb_article` returns the full content of a specific article
  3. Admin can call `refresh_kb` to trigger an immediate re-sync; sync runs automatically on the configured schedule (e.g., every 30 minutes) without manual intervention
  4. AI client can ask "when was the KB last synced?" and receive a timestamp; partial sync failures do not corrupt existing cached content (write-then-swap atomic update)
  5. (**KB-08 — high complexity, noted**) At sync time, the server reads designated YouTrack KB articles and updates MCP tool descriptions/schemas accordingly; if this capability is deferred within the phase, the other four criteria above are sufficient for phase completion
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 4/4 | Complete | 2026-03-16 |
| 2. Tenant Management + MCP Shell | 0/? | Not started | - |
| 3. ERP Domain Tools | 0/? | Not started | - |
| 4. YouTrack KB Sync | 0/? | Not started | - |

---

## Coverage Map

| Requirement | Phase |
|-------------|-------|
| INFRA-01 | Phase 1 |
| INFRA-02 | Phase 2 |
| INFRA-03 | Phase 1 |
| INFRA-04 | Phase 1 |
| INFRA-05 | Phase 1 |
| INFRA-06 | Phase 1 |
| INFRA-07 | Phase 1 |
| TENANT-01 | Phase 2 |
| TENANT-02 | Phase 2 |
| TENANT-03 | Phase 2 |
| TENANT-04 | Phase 2 |
| TENANT-05 | Phase 2 |
| TENANT-06 | Phase 2 |
| TENANT-07 | Phase 2 |
| INV-01 | Phase 3 |
| INV-02 | Phase 3 |
| INV-03 | Phase 3 |
| INV-04 | Phase 3 |
| INV-05 | Phase 3 |
| INV-06 | Phase 3 |
| INV-07 | Phase 3 |
| ORD-01 | Phase 3 |
| ORD-02 | Phase 3 |
| ORD-03 | Phase 3 |
| ORD-04 | Phase 3 |
| ORD-05 | Phase 3 |
| ORD-06 | Phase 3 |
| CRM-01 | Phase 3 |
| CRM-02 | Phase 3 |
| CRM-03 | Phase 3 |
| CRM-04 | Phase 3 |
| CRM-05 | Phase 3 |
| KB-01 | Phase 4 |
| KB-02 | Phase 4 |
| KB-03 | Phase 4 |
| KB-04 | Phase 4 |
| KB-05 | Phase 4 |
| KB-06 | Phase 4 |
| KB-07 | Phase 4 |
| KB-08 | Phase 4 |

**Mapped:** 40/40 ✓
**Orphaned:** 0 ✓

---

## Key Decisions Captured

| Decision | Rationale |
|----------|-----------|
| MCP server shell folds into Phase 2 | TENANT-06 and TENANT-07 own the auth middleware requirements; no separate INFRA requirements for MCP transport exist; coarse granularity favors merging |
| ERP domain tools in one phase | INV, ORD, CRM are all read-only, share the same handler shape, and have no inter-phase dependencies; coarse granularity warrants grouping |
| KB-08 flagged high complexity | Research rates this "Very High" complexity and recommends deferring; criterion 5 in Phase 4 explicitly allows deferral within the phase |
| Write tools deferred to v2 | WRITE-01 through WRITE-07 are v2 requirements; no v1 requirement covers MCP write operations |

---
*Roadmap created: 2026-03-07*
*Updated: 2026-03-10 — Phase 1 planned (4 plans, 4 waves)*
*Updated: 2026-03-16 — Plan 01-01 complete (project scaffold + test stubs)*
*Updated: 2026-03-16 — Plan 01-02 complete (SQL migrations: roles, tenants, api_keys with RLS + postgres.js client)*
*Updated: 2026-03-16 — Plan 01-03 complete (ERP migrations: 7 RLS tables + kb_articles global cache + integration tests + check-pending.ts)*
*Updated: 2026-03-16 — Phase 1 complete: Plan 01-04 done (GitHub Actions CI workflow created + human checkpoint approved — all 7 INFRA requirements verified)*
