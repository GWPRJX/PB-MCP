# Roadmap: PB MCP

**Project:** Multi-Tenant ERP MCP Server
**Granularity:** Coarse
**Created:** 2026-03-07

---

## v1.0 — Core MCP Server (COMPLETE)

**Requirements:** 40 | **Coverage:** 40/40 mapped | **Completed:** 2026-03-17

### v1 Phases

- [x] **Phase 1: Database Foundation** - PostgreSQL schema with RLS enforcing tenant isolation; CI-verified cross-tenant data separation before any application layer is built
- [x] **Phase 2: Tenant Management + MCP Shell** - Admin REST API for tenant provisioning, API key management, and the MCP server transport layer with per-request tenant auth middleware
- [x] **Phase 3: ERP Domain Tools** - All read-only MCP tools for Inventory, Orders/Billing, and CRM giving AI clients full query access to tenant ERP data via live POSibolt API
- [x] **Phase 4: YouTrack KB Sync** - YouTrack article cache, scheduled sync, and KB query tools so AI clients can search live API documentation

---

## v2.0 — Admin Dashboard + Write Operations

**Requirements:** 26 | **Coverage:** 26/26 mapped

### v2 Phases

- [ ] **Phase 5: Backend Services** - Complete tool access control, audit logging, JWT dashboard auth, API key expiry; apply pending migrations and write tests for all new backend services
- [ ] **Phase 6: Admin Dashboard + Doc Upload** - Finish React admin dashboard with all management tabs, add API doc upload/management, wire production build serving
- [ ] **Phase 7: Write Tools** - MCP write tools for stock adjustments, invoice creation/editing, and contact management via POSibolt POST API

---

## Phase Details

### Phase 5: Backend Services
**Goal**: All v2 backend services are migrated, tested, and production-ready — tool access control filters MCP tools per tenant/key, audit log records every tool call, dashboard auth uses JWT, and API keys support expiry
**Depends on**: v1 complete (Phases 1-4)
**Requirements**: TAC-01, TAC-02, TAC-03, TAC-04, TAC-05, AUTH-01, AUTH-02
**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Apply migrations, update CI RLS checks, wire audit logging into all MCP tool handlers
- [x] 05-02-PLAN.md — JWT auth login endpoint + middleware, API key expiry (migration 000009)
- [ ] 05-03-PLAN.md — Integration tests for tool permissions, audit log, JWT auth, and key expiry

**Existing code**: Significant v2 backend code already exists in working tree (tool-permissions-service, audit-service, connection-tester, updated auth middleware, updated context). Migrations 000007 + 000008 written but not applied. Audit logging written but not wired into tool handlers.
**Success Criteria** (what must be TRUE):
  1. Migrations 000007 (tool_permissions) and 000008 (audit_log) applied; CI updated to include them
  2. Admin can toggle tools per tenant via `PUT /admin/tenants/:id/tools`; disabled tools do not appear in MCP `tools/list` for that tenant
  3. Admin can restrict a specific API key to a subset of tools via `PUT /admin/tenants/:id/keys/:keyId/tools`; MCP session only sees the intersection of tenant-enabled and key-allowed tools
  4. Every MCP tool call (success or error) creates an audit_log row with tenant_id, key_id, tool_name, params, status, and duration_ms; admin can query via `GET /admin/tenants/:id/audit-log`
  5. `POST /admin/auth/login` returns a signed JWT; dashboard uses JWT (not raw admin secret) for all subsequent requests; JWT has configurable expiry
  6. API keys accept an optional `expires_at` timestamp; expired keys return 401 with "API key expired" message
  7. All new backend services have integration tests (tool permissions CRUD, audit recording + query, JWT auth flow, key expiry rejection)

### Phase 6: Admin Dashboard + Doc Upload
**Goal**: Admin can manage all aspects of the MCP server through a polished React dashboard — tenants, keys, tool permissions, ERP config, audit logs, and API documentation upload
**Depends on**: Phase 5
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08, DASH-09, UPLOAD-01, UPLOAD-02, UPLOAD-03, UPLOAD-04
**Existing code**: Dashboard scaffolded with Vite + React + Tailwind. Pages exist for login, tenant list, create tenant, tenant detail with tabs. API client wired. Needs JWT auth integration, doc upload feature, build/serve pipeline, polish.
**Success Criteria** (what must be TRUE):
  1. Dashboard login flow uses JWT endpoint from Phase 5; session persists across page refresh; expired JWT redirects to login
  2. Tenant list page loads all tenants with name, slug, plan, status, and key count; create tenant form validates slug and reveals API key once
  3. Tenant detail page has working tabs: API Keys (create/revoke/scope), Tool Permissions (toggle on/off), ERP Config (save/test), Audit Log (paginated/filterable)
  4. API Docs tab: admin can upload markdown files, view uploaded docs, edit content, delete docs; uploaded docs appear in `search_kb` and `get_kb_article` MCP tool results
  5. `POST /admin/kb/upload` accepts markdown content with title and optional tags; stores as kb_articles row
  6. Dashboard production build (`dashboard/dist/`) served by Fastify via @fastify/static at `/dashboard/`; SPA fallback handles client-side routing
  7. Root package.json has `dashboard:dev` and `dashboard:build` scripts; `.gitignore` includes `dashboard/node_modules/` and `dashboard/dist/`

### Phase 7: Write Tools
**Goal**: AI clients can create and modify stock entries, invoices, and contacts through MCP tools — all write operations go through the live POSibolt API with proper validation
**Depends on**: Phase 5 (audit logging wired), Phase 6 (dashboard for testing)
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-04, WRITE-05, WRITE-06
**Existing code**: `pbPost()` helper already exists in `src/posibolt/client.ts`. Read tools pattern established. `shouldRegister()` filter in place.
**Success Criteria** (what must be TRUE):
  1. MCP tool `create_stock_entry` accepts product ID, warehouse, quantity, and adjustment type; calls POSibolt inventory API; returns created entry details
  2. MCP tool `update_stock_entry` modifies an existing stock/inventory record in POSibolt; returns updated details
  3. MCP tool `create_invoice` accepts customer ID, line items, and optional dates; calls POSibolt sales invoice API; returns invoice number and total
  4. MCP tool `update_invoice` modifies an existing invoice (e.g., add line, change status); returns updated invoice
  5. MCP tool `create_contact` accepts name, email, phone, type (customer/vendor), and optional fields; calls POSibolt customer master API; returns created partner ID
  6. MCP tool `update_contact` modifies existing business partner fields; returns updated contact
  7. All 6 write tools are audit-logged, respect tool access control, and return structured errors on POSibolt API failures
  8. Write tools registered in ALL_TOOLS list and manageable via dashboard tool permissions

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Database Foundation | 4/4 | Complete | 2026-03-16 |
| 2. Tenant Management + MCP Shell | 4/4 | Complete | 2026-03-16 |
| 3. ERP Domain Tools | 4/4 | Complete | 2026-03-17 |
| 4. YouTrack KB Sync | 4/4 | Complete | 2026-03-17 |
| 5. Backend Services | 1/3 | In progress | — |
| 6. Admin Dashboard + Doc Upload | 0/? | Not started | — |
| 7. Write Tools | 0/? | Not started | — |

---

## Coverage Map

### v1

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
| KB-08 | Phase 4 (deferred) |

### v2

| Requirement | Phase |
|-------------|-------|
| TAC-01 | Phase 5 |
| TAC-02 | Phase 5 |
| TAC-03 | Phase 5 |
| TAC-04 | Phase 5 |
| TAC-05 | Phase 5 |
| AUTH-01 | Phase 5 |
| AUTH-02 | Phase 5 |
| DASH-01 | Phase 6 |
| DASH-02 | Phase 6 |
| DASH-03 | Phase 6 |
| DASH-04 | Phase 6 |
| DASH-05 | Phase 6 |
| DASH-06 | Phase 6 |
| DASH-07 | Phase 6 |
| DASH-08 | Phase 6 |
| DASH-09 | Phase 6 |
| UPLOAD-01 | Phase 6 |
| UPLOAD-02 | Phase 6 |
| UPLOAD-03 | Phase 6 |
| UPLOAD-04 | Phase 6 |
| WRITE-01 | Phase 7 |
| WRITE-02 | Phase 7 |
| WRITE-03 | Phase 7 |
| WRITE-04 | Phase 7 |
| WRITE-05 | Phase 7 |
| WRITE-06 | Phase 7 |

**v1 Mapped:** 40/40
**v2 Mapped:** 26/26
**Orphaned:** 0

---

## Key Decisions Captured

### v1

| Decision | Rationale |
|----------|-----------|
| MCP server shell folds into Phase 2 | TENANT-06 and TENANT-07 own the auth middleware requirements; no separate INFRA requirements for MCP transport exist |
| ERP domain tools in one phase | INV, ORD, CRM are all read-only, share the same handler shape, and have no inter-phase dependencies |
| KB-08 flagged high complexity | Research rates this "Very High" complexity and recommends deferring |
| Write tools deferred to v2 | v1 is read-only; write operations require additional validation and audit |
| Single /mcp endpoint | Tenant identified via X-Api-Key header, not URL path |
| kb_articles global cache | No tenant_id, no RLS — all tenants share API documentation |
| Tools call POSibolt API live | Not local DB — direct REST calls via OAuth token to tenant's POSibolt instance |

### v2

| Decision | Rationale |
|----------|-----------|
| JWT for dashboard auth | Raw admin secret in localStorage is insecure; JWT with expiry is standard practice |
| API key expiry (not OAuth 2.1) | OAuth 2.1 is over-engineered for M2M; expiry dates on API keys cover the security gap |
| Doc upload replaces YouTrack sync reliance | Simpler to manage; admin uploads markdown directly rather than depending on external sync |
| Phase 5 before Phase 6 | Dashboard needs JWT auth and working backend services before frontend can be completed |
| Write tools in Phase 7 | Requires Phase 5 (audit logging) and benefits from Phase 6 (dashboard for testing/permissions) |
| 3 phases for v2 | Backend services → Dashboard + Upload → Write tools; clean dependency chain |
| JWT via built-in crypto (no new deps) | Node.js crypto module handles HMAC-SHA256 for JWT signing; avoids adding jose/jsonwebtoken dependency |
| JWT expiry default 8 hours | Configurable via JWT_EXPIRY_HOURS; 8h covers a workday session |
| Login credentials reuse ADMIN_SECRET | ADMIN_USERNAME (default 'admin') + existing ADMIN_SECRET env var; no new secrets to manage |

---
*Roadmap created: 2026-03-07*
*v1.0 complete: 2026-03-17 — 4 phases, 16 plans, 39/40 requirements delivered*
*v2.0 started: 2026-03-18 — 3 phases, 26 requirements scoped*
*Phase 5 planned: 2026-03-18 — 3 plans in 2 waves*
