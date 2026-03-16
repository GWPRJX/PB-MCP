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

- [ ] **INV-01**: MCP tool `list_products` returns paginated product catalog for tenant (name, SKU, price, description)
- [ ] **INV-02**: MCP tool `get_product` returns single product by ID or SKU
- [ ] **INV-03**: MCP tool `list_stock_levels` returns current quantity-on-hand per product
- [ ] **INV-04**: MCP tool `get_stock_level` returns stock level for a specific product
- [ ] **INV-05**: MCP tool `list_low_stock` returns products below their reorder threshold
- [ ] **INV-06**: MCP tool `list_suppliers` returns supplier list for a tenant
- [ ] **INV-07**: MCP tool `get_supplier` returns supplier detail including products supplied

### MCP — Orders & Billing (read-only)

- [ ] **ORD-01**: MCP tool `list_orders` returns paginated sales orders for tenant (with date/status filters)
- [ ] **ORD-02**: MCP tool `get_order` returns single order with line items and linked contact
- [ ] **ORD-03**: MCP tool `list_invoices` returns paginated invoices (with status/date filters)
- [ ] **ORD-04**: MCP tool `get_invoice` returns invoice detail including payment status and amount due
- [ ] **ORD-05**: MCP tool `list_overdue_invoices` returns all unpaid invoices past due date
- [ ] **ORD-06**: MCP tool `get_payment_summary` returns total outstanding, collected, and overdue amounts

### MCP — CRM / Contacts (read-only)

- [ ] **CRM-01**: MCP tool `list_contacts` returns paginated contacts (name, email, phone, company)
- [ ] **CRM-02**: MCP tool `get_contact` returns single contact by ID or email
- [ ] **CRM-03**: MCP tool `search_contacts` returns contacts matching name, company, or tag filter
- [ ] **CRM-04**: MCP tool `get_contact_orders` returns order history for a specific contact
- [ ] **CRM-05**: MCP tool `get_contact_invoices` returns invoice history and outstanding balance for a contact

### MCP — YouTrack KB Sync & Tools

- [ ] **KB-01**: Sync worker pulls KB articles from YouTrack REST API (`/api/articles`) into local PostgreSQL cache
- [ ] **KB-02**: Sync worker handles YouTrack pagination (42-item default page size — must loop)
- [ ] **KB-03**: Sync runs on a configurable schedule (e.g., every 30 minutes)
- [ ] **KB-04**: MCP tool `list_kb_articles` returns paginated KB article summaries
- [ ] **KB-05**: MCP tool `get_kb_article` returns full content of a specific article by ID
- [ ] **KB-06**: MCP tool `search_kb` returns articles matching a keyword/phrase query
- [ ] **KB-07**: MCP tool `refresh_kb` triggers an immediate re-sync from YouTrack on demand
- [ ] **KB-08**: Server reads YouTrack KB articles to update MCP tool descriptions/schemas at sync time (self-configuration) ⚠️ High complexity

## v2 Requirements

### MCP Write Tools

- **WRITE-01**: MCP tool `create_product` adds a new product to tenant catalog
- **WRITE-02**: MCP tool `update_stock_level` adjusts inventory quantity
- **WRITE-03**: MCP tool `create_order` creates a sales order with line items
- **WRITE-04**: MCP tool `create_invoice` generates invoice from an order
- **WRITE-05**: MCP tool `record_payment` marks invoice as paid (full or partial)
- **WRITE-06**: MCP tool `create_contact` adds a new CRM contact
- **WRITE-07**: MCP tool `update_contact` updates contact details

### Auth & Security

- **AUTH-01**: OAuth 2.1 resource server replaces API key auth
- **AUTH-02**: Scoped API keys (read-only vs read-write)
- **AUTH-03**: Audit log of all MCP tool calls per tenant

### Admin UI

- **ADMINUI-01**: Web-based admin panel for tenant management (visual alternative to REST API)

## Out of Scope

| Feature | Reason |
|---------|--------|
| HR / Payroll module | Deferred — not in v1 scope, high complexity |
| Mobile app | Web-first; mobile is a future milestone |
| Real-time collaborative editing | Not needed for AI-assistant use case |
| Per-schema or per-database tenant isolation | PostgreSQL schema limits and migration overhead; RLS chosen |
| Dynamic tool registration at runtime | MCP SDK does not support post-connection capability changes |
| OAuth 2.1 for v1 | Over-engineered for v1 M2M; deferred to v2 |

## Traceability

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| INFRA-01 | Phase 1 | Database Foundation | Complete (01-01 scaffold; 01-04 CI verified) |
| INFRA-02 | Phase 2 | Tenant Management + MCP Shell | Pending (MCP Streamable HTTP transport — Phase 2) |
| INFRA-03 | Phase 1 | Database Foundation | Complete (01-02) |
| INFRA-04 | Phase 1 | Database Foundation | Complete (01-02) |
| INFRA-05 | Phase 1 | Database Foundation | Complete (01-02) |
| INFRA-06 | Phase 1 | Database Foundation | Complete (check-pending.ts: 01-03; stdout verified: 01-04) |
| INFRA-07 | Phase 1 | Database Foundation | Complete (assert-rls.sh: 01-01; GitHub Actions CI: 01-04) |
| TENANT-01 | Phase 2 | Tenant Management + MCP Shell | Pending |
| TENANT-02 | Phase 2 | Tenant Management + MCP Shell | Pending |
| TENANT-03 | Phase 2 | Tenant Management + MCP Shell | Pending |
| TENANT-04 | Phase 2 | Tenant Management + MCP Shell | Pending |
| TENANT-05 | Phase 2 | Tenant Management + MCP Shell | Pending |
| TENANT-06 | Phase 2 | Tenant Management + MCP Shell | Pending |
| TENANT-07 | Phase 2 | Tenant Management + MCP Shell | Pending |
| INV-01 | Phase 3 | ERP Domain Tools | Pending |
| INV-02 | Phase 3 | ERP Domain Tools | Pending |
| INV-03 | Phase 3 | ERP Domain Tools | Pending |
| INV-04 | Phase 3 | ERP Domain Tools | Pending |
| INV-05 | Phase 3 | ERP Domain Tools | Pending |
| INV-06 | Phase 3 | ERP Domain Tools | Pending |
| INV-07 | Phase 3 | ERP Domain Tools | Pending |
| ORD-01 | Phase 3 | ERP Domain Tools | Pending |
| ORD-02 | Phase 3 | ERP Domain Tools | Pending |
| ORD-03 | Phase 3 | ERP Domain Tools | Pending |
| ORD-04 | Phase 3 | ERP Domain Tools | Pending |
| ORD-05 | Phase 3 | ERP Domain Tools | Pending |
| ORD-06 | Phase 3 | ERP Domain Tools | Pending |
| CRM-01 | Phase 3 | ERP Domain Tools | Pending |
| CRM-02 | Phase 3 | ERP Domain Tools | Pending |
| CRM-03 | Phase 3 | ERP Domain Tools | Pending |
| CRM-04 | Phase 3 | ERP Domain Tools | Pending |
| CRM-05 | Phase 3 | ERP Domain Tools | Pending |
| KB-01 | Phase 4 | YouTrack KB Sync | Pending |
| KB-02 | Phase 4 | YouTrack KB Sync | Pending |
| KB-03 | Phase 4 | YouTrack KB Sync | Pending |
| KB-04 | Phase 4 | YouTrack KB Sync | Pending |
| KB-05 | Phase 4 | YouTrack KB Sync | Pending |
| KB-06 | Phase 4 | YouTrack KB Sync | Pending |
| KB-07 | Phase 4 | YouTrack KB Sync | Pending |
| KB-08 | Phase 4 | YouTrack KB Sync | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after roadmap creation*
