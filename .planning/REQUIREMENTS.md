# Requirements: PB MCP

**Defined:** 2026-03-07
**Core Value:** Small business owners and their AI assistants can query real ERP data — stock, sales, contacts — through natural language, while any developer can add a new tenant and go live in under 10 minutes.

## v1 Requirements

### Infrastructure

- [x] **INFRA-01**: System runs as a single Node.js (TypeScript) process with Fastify 5 *(scaffold: 01-01; full implementation: Phase 2)*
- [x] **INFRA-02**: MCP server uses Streamable HTTP transport (not stdio)
- [x] **INFRA-03**: PostgreSQL with Row-Level Security (RLS) isolates all tenant data in a shared schema *(tenant_isolation policy on api_keys: 01-02; full coverage: 01-03)*
- [x] **INFRA-04**: Every tenant-bearing table has both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` *(api_keys migration: 01-02; all ERP tables: 01-03)*
- [x] **INFRA-05**: Application uses a dedicated non-superuser PostgreSQL role (no BYPASSRLS) *(app_user NOLOGIN + app_login LOGIN, no BYPASSRLS: 01-02)*
- [x] **INFRA-06**: stderr-only logging (no stdout writes that corrupt MCP transport) *(check-pending.ts uses process.stderr.write only: 01-03; full server stderr verified: 01-04)*
- [x] **INFRA-07**: CI check asserts all tenant-bearing tables have RLS policies *(assert-rls.sh: 01-01; wired into GitHub Actions: 01-04)*

### Tenant Management

- [x] **TENANT-01**: Admin can create a new tenant with name, slug, and plan via REST API
- [x] **TENANT-02**: Admin can list all tenants with status and key count
- [x] **TENANT-03**: Admin can view a single tenant's details
- [x] **TENANT-04**: Admin can issue API keys for a tenant (hashed at rest)
- [x] **TENANT-05**: Admin can revoke a tenant API key
- [x] **TENANT-06**: MCP client authenticates by presenting an API key in request header
- [x] **TENANT-07**: API key resolves to a `tenant_id` which sets PostgreSQL session variable for RLS

### MCP — Inventory & Products (read-only)

- [x] **INV-01**: MCP tool `list_products` returns paginated product catalog for tenant (name, SKU, price, description)
- [x] **INV-02**: MCP tool `get_product` returns single product by ID or SKU
- [x] **INV-03**: MCP tool `list_stock_levels` returns current quantity-on-hand per product
- [x] **INV-04**: MCP tool `get_stock_level` returns stock level for a specific product
- [x] **INV-05**: MCP tool `list_low_stock` returns products below their reorder threshold
- [x] **INV-06**: MCP tool `list_suppliers` returns supplier list for a tenant
- [x] **INV-07**: MCP tool `get_supplier` returns supplier detail including products supplied

### MCP — Orders & Billing (read-only)

- [x] **ORD-01**: MCP tool `list_orders` returns paginated sales orders for tenant (with date/status filters)
- [x] **ORD-02**: MCP tool `get_order` returns single order with line items and linked contact
- [x] **ORD-03**: MCP tool `list_invoices` returns paginated invoices (with status/date filters)
- [x] **ORD-04**: MCP tool `get_invoice` returns invoice detail including payment status and amount due
- [x] **ORD-05**: MCP tool `list_overdue_invoices` returns all unpaid invoices past due date
- [x] **ORD-06**: MCP tool `get_payment_summary` returns total outstanding, collected, and overdue amounts

### MCP — CRM / Contacts (read-only)

- [x] **CRM-01**: MCP tool `list_contacts` returns paginated contacts (name, email, phone, company)
- [x] **CRM-02**: MCP tool `get_contact` returns single contact by ID or email
- [x] **CRM-03**: MCP tool `search_contacts` returns contacts matching name, company, or tag filter
- [x] **CRM-04**: MCP tool `get_contact_orders` returns order history for a specific contact
- [x] **CRM-05**: MCP tool `get_contact_invoices` returns invoice history and outstanding balance for a contact

### MCP — YouTrack KB Sync & Tools

- [x] **KB-01**: Sync worker pulls KB articles from YouTrack REST API (`/api/articles`) into local PostgreSQL cache
- [x] **KB-02**: Sync worker handles YouTrack pagination (42-item default page size — must loop)
- [x] **KB-03**: Sync runs on a configurable schedule (e.g., every 30 minutes)
- [x] **KB-04**: `POST /admin/kb/refresh` triggers an immediate re-sync from YouTrack on demand
- [x] **KB-05**: MCP tool `get_kb_article` returns full content of a specific article by ID
- [x] **KB-06**: MCP tool `search_kb` returns articles matching a keyword/phrase query; `get_kb_sync_status` returns cache stats
- [x] **KB-07**: Atomic write-then-swap (DELETE+INSERT in single transaction) prevents partial-sync corruption
- [ ] **KB-08**: Server reads YouTrack KB articles to update MCP tool descriptions/schemas at sync time (self-configuration) — **DEFERRED (v1 deferral, not in v2 scope)**

---

## v2 Requirements

### Tool Access Control (TAC)

- [x] **TAC-01**: Admin can enable/disable specific MCP tools per tenant via REST API
- [x] **TAC-02**: Admin can restrict an API key to a subset of the tenant's enabled tools (per-key scoping)
- [x] **TAC-03**: Disabled/unscoped tools are not registered in the MCP server for that tenant's session
- [x] **TAC-04**: Every MCP tool call is recorded in an append-only audit log (tenant_id, key_id, tool_name, params, status, duration)
- [x] **TAC-05**: Admin can query audit log filtered by tool name and status with pagination

### Auth & Security (AUTH)

- [x] **AUTH-01**: Dashboard login returns a JWT with expiry; dashboard stores JWT (not raw admin secret) in localStorage
- [x] **AUTH-02**: API keys support optional expiry dates; expired keys are rejected at auth time with a clear error

### Admin Dashboard (DASH)

- [x] **DASH-01**: Login page authenticates admin via JWT endpoint and stores session token
- [x] **DASH-02**: Tenant list view showing name, slug, plan, status, key count
- [x] **DASH-03**: Create tenant form with slug validation and one-time API key reveal
- [x] **DASH-04**: Tenant detail view with tabbed interface (Keys, Tools, ERP Config, Audit Log, API Docs)
- [x] **DASH-05**: API Keys tab — list active/revoked keys, create new keys, revoke keys, per-key tool scoping
- [x] **DASH-06**: Tool Permissions tab — toggle tools on/off per tenant with bulk enable/disable
- [x] **DASH-07**: ERP Config tab — update POSibolt connection credentials, test connection with live feedback
- [x] **DASH-08**: Audit Log tab — paginated tool call history, filterable by tool name and success/error status
- [x] **DASH-09**: Dashboard served as SPA by Fastify (@fastify/static) in production; Vite dev proxy in development

### API Doc Upload (UPLOAD)

- [x] **UPLOAD-01**: Admin can upload markdown API doc files via dashboard or REST endpoint
- [x] **UPLOAD-02**: Uploaded docs stored in kb_articles table (same schema as YouTrack-synced articles)
- [x] **UPLOAD-03**: Admin can list, view, edit, and delete uploaded API docs through dashboard
- [x] **UPLOAD-04**: Uploaded docs are searchable via existing `search_kb` and `get_kb_article` MCP tools

### MCP Write Tools (WRITE)

- [x] **WRITE-01**: MCP tool `create_stock_entry` creates an inventory adjustment in POSibolt via POST API
- [x] **WRITE-02**: MCP tool `update_stock_entry` modifies an existing stock/inventory entry in POSibolt
- [x] **WRITE-03**: MCP tool `create_invoice` creates a sales invoice via POSibolt POST API
- [x] **WRITE-04**: MCP tool `update_invoice` modifies an existing invoice in POSibolt
- [x] **WRITE-05**: MCP tool `create_contact` adds a new business partner (customer/vendor) in POSibolt
- [x] **WRITE-06**: MCP tool `update_contact` updates existing business partner details in POSibolt

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| HR / Payroll module | Deferred — not in v1/v2 scope, high complexity |
| Mobile app | Web-first; mobile is a future milestone |
| Real-time collaborative editing | Not needed for AI-assistant use case |
| Per-schema or per-database tenant isolation | PostgreSQL schema limits and migration overhead; RLS chosen |
| Dynamic tool registration at runtime | MCP SDK does not support post-connection capability changes |
| OAuth 2.1 for MCP clients | Over-engineered for current M2M usage; API keys with expiry sufficient for v2 |
| KB-08 self-configuration | Deferred indefinitely — upload-based doc management replaces this approach |

## Traceability

### v1

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| INFRA-01 | Phase 1 | Database Foundation | Complete (01-01 scaffold; 01-04 CI verified) |
| INFRA-02 | Phase 2 | Tenant Management + MCP Shell | Complete (Streamable HTTP transport: 02-04; human-verified 2026-03-16) |
| INFRA-03 | Phase 1 | Database Foundation | Complete (01-02) |
| INFRA-04 | Phase 1 | Database Foundation | Complete (01-02) |
| INFRA-05 | Phase 1 | Database Foundation | Complete (01-02) |
| INFRA-06 | Phase 1 | Database Foundation | Complete (check-pending.ts: 01-03; stdout verified: 01-04) |
| INFRA-07 | Phase 1 | Database Foundation | Complete (assert-rls.sh: 01-01; GitHub Actions CI: 01-04) |
| TENANT-01 | Phase 2 | Tenant Management + MCP Shell | Complete (service: 02-02; REST + 24 tests: 02-03) |
| TENANT-02 | Phase 2 | Tenant Management + MCP Shell | Complete (service: 02-02; REST + 24 tests: 02-03) |
| TENANT-03 | Phase 2 | Tenant Management + MCP Shell | Complete (service: 02-02; REST + 24 tests: 02-03) |
| TENANT-04 | Phase 2 | Tenant Management + MCP Shell | Complete (service: 02-02; REST + 24 tests: 02-03) |
| TENANT-05 | Phase 2 | Tenant Management + MCP Shell | Complete (service: 02-02; REST + 24 tests: 02-03) |
| TENANT-06 | Phase 2 | Tenant Management + MCP Shell | Complete (MCP auth middleware: 02-04; human-verified 2026-03-16) |
| TENANT-07 | Phase 2 | Tenant Management + MCP Shell | Complete (service layer: 02-02; MCP auth + tenantStorage: 02-04; human-verified 2026-03-16) |
| INV-01 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| INV-02 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| INV-03 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| INV-04 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| INV-05 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| INV-06 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| INV-07 | Phase 3 | ERP Domain Tools | Complete (03-02; human-verified 2026-03-17) |
| ORD-01 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| ORD-02 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| ORD-03 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| ORD-04 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| ORD-05 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| ORD-06 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| CRM-01 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| CRM-02 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| CRM-03 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| CRM-04 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| CRM-05 | Phase 3 | ERP Domain Tools | Complete (03-03; human-verified 2026-03-17) |
| KB-01 | Phase 4 | YouTrack KB Sync | Complete (04-02; human-verified 2026-03-17) |
| KB-02 | Phase 4 | YouTrack KB Sync | Complete (04-02; human-verified 2026-03-17) |
| KB-03 | Phase 4 | YouTrack KB Sync | Complete (04-02; human-verified 2026-03-17) |
| KB-04 | Phase 4 | YouTrack KB Sync | Complete (04-03; human-verified 2026-03-17) |
| KB-05 | Phase 4 | YouTrack KB Sync | Complete (04-03; human-verified 2026-03-17) |
| KB-06 | Phase 4 | YouTrack KB Sync | Complete (04-03; human-verified 2026-03-17) |
| KB-07 | Phase 4 | YouTrack KB Sync | Complete (04-02; human-verified 2026-03-17) |
| KB-08 | Phase 4 | YouTrack KB Sync | **Deferred** — not in v2 scope |

### v2

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| TAC-01 | Phase 5 | Backend Services | Complete (05-01; 2026-03-18) |
| TAC-02 | Phase 5 | Backend Services | Complete (05-01; 2026-03-18) |
| TAC-03 | Phase 5 | Backend Services | Complete (05-01; 2026-03-18) |
| TAC-04 | Phase 5 | Backend Services | Complete (05-01; 2026-03-18) |
| TAC-05 | Phase 5 | Backend Services | Complete (05-01; 2026-03-18) |
| AUTH-01 | Phase 5 | Backend Services | Complete (05-02; 2026-03-18) |
| AUTH-02 | Phase 5 | Backend Services | Complete (05-02; 2026-03-18) |
| DASH-01 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-02 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-03 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-04 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-02) |
| DASH-05 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-06 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-07 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-08 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| DASH-09 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-01) |
| UPLOAD-01 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-02) |
| UPLOAD-02 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-02) |
| UPLOAD-03 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-02) |
| UPLOAD-04 | Phase 6 | Admin Dashboard + Doc Upload | Complete (06-02) |
| WRITE-01 | Phase 7 | Write Tools | Complete (07-01; 2026-03-18) |
| WRITE-02 | Phase 7 | Write Tools | Complete (07-01; 2026-03-18) |
| WRITE-03 | Phase 7 | Write Tools | Complete (07-01; 2026-03-18) |
| WRITE-04 | Phase 7 | Write Tools | Complete (07-01; 2026-03-18) |
| WRITE-05 | Phase 7 | Write Tools | Complete (07-01; 2026-03-18) |
| WRITE-06 | Phase 7 | Write Tools | Complete (07-01; 2026-03-18) |

**v1 Coverage:** 40/40 mapped (39 complete, 1 deferred)
**v2 Coverage:** 26/26 mapped

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-18 — v2 requirements added (26 requirements across 3 phases)*
