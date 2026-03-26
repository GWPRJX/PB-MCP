# PB MCP — Technical Reference

Complete technical documentation for the Multi-Tenant ERP MCP Server.

## 1. Project Overview

PB MCP is an HTTP server that exposes POSibolt ERP data and YouTrack KB articles as 27 MCP tools.

**Key characteristics:**
- Multi-tenant with PostgreSQL RLS isolation
- 21 read tools + 6 write operations
- Stateless: new McpServer per request
- Audited: all tool calls logged
- Permissioned: tenant and per-key access control

**Stack:** Node.js 22, TypeScript, Fastify 5, PostgreSQL 17, React 19

## 2. Architecture

### Request Flow
1. Client sends X-Api-Key header
2. SHA-256 hash lookup in api_keys
3. Check status, expiry, allowed_tools
4. Load tenant ERP config
5. Store in AsyncLocalStorage
6. Create McpServer with filtered tools
7. Execute tool with audit logging
8. Fire-and-forget audit INSERT
9. Return JSON-RPC response

### Multi-Tenant Isolation

**Database (RLS):**
- tenant_id FK on all tables, NOT NULL, CASCADE
- RLS policy: tenant_id = current_setting('app.current_tenant_id')
- FORCE ROW LEVEL SECURITY (ensures superuser compliance)
- SET LOCAL clears on transaction end

**Application (AsyncLocalStorage):**
- TenantContext: { tenantId, keyId, erpConfig, enabledTools }
- Tool handlers: getTenantId(), getErpConfig(), getEnabledToolNames()

## 3. Modules

**src/index.ts** - Entry point, registers routes, starts scheduler
**src/server.ts** - Fastify configuration (CORS, Swagger, static)
**src/context.ts** - AsyncLocalStorage for tenant context
**src/db/client.ts** - Database connections and RLS
**src/db/schema.ts** - Drizzle ORM table definitions
**src/mcp/server.ts** - Creates McpServer with filtered tools
**src/mcp/auth.ts** - Validates API keys, sets context
**src/admin/router.ts** - 25+ admin API endpoints (tenants, keys, tools, ERP, KB, tool config)
**src/admin/tenant-service.ts** - Tenant/key CRUD
**src/admin/auth-middleware.ts** - JWT auth (Node.js crypto)
**src/admin/tool-permissions-service.ts** - Access control
**src/admin/tool-registry-service.ts** - Global tool registry (seed, query, toggle)
**src/admin/audit-service.ts** - Audit logging
**src/admin/settings-service.ts** - Key-value store (KB sync, YouTrack config)
**src/admin/seed-service.ts** - Demo tenant seeding
**src/posibolt/client.ts** - POSibolt REST API client
**src/tools/** - 27 tools across 5 files + config.ts (per-tool endpoint resolver)
**src/kb/** - YouTrack sync scheduler with article filtering

## 4. Database

All tenant tables: id UUID, tenant_id UUID FK, created_at, updated_at, RLS enabled.

**Infrastructure:**
- tenants (name, slug, plan, status, erp_*)
- api_keys (tenant_id, key_hash, label, status, allowed_tools, expires_at)
- tool_permissions (tenant_id, tool_name, enabled)
- audit_log (tenant_id, key_id, tool_name, params JSONB, status, error_message, duration_ms)

**ERP:**
- products, stock_levels, suppliers
- contacts, orders, order_line_items, invoices
- kb_articles (youtrack_id: P8-A-1 or DOC-uuid, mapped_tools TEXT[])
- tool_registry (tool_name UNIQUE, category, source, is_active, parameters JSONB for endpoint overrides)
- server_settings (key-value store for YouTrack config, sync interval, article filter)

## 5. API

**Admin Endpoints (JWT protected):**
- POST /admin/tenants
- GET /admin/tenants, GET /admin/tenants/:id
- PUT /admin/tenants/:id/erp-config
- POST /admin/tenants/:id/test-connection
- POST /admin/tenants/:id/keys
- DELETE /admin/tenants/:id/keys/:keyId
- PUT /admin/tenants/:id/keys/:keyId/tools
- GET /admin/tenants/:id/tools
- PUT /admin/tenants/:id/tools
- GET /admin/tools
- GET /admin/tenants/:id/audit-log
- GET /admin/kb/settings, PUT /admin/kb/settings
- GET /admin/kb/sync-status, POST /admin/kb/refresh
- POST /admin/kb/test-connection
- POST /admin/kb/upload
- GET /admin/kb/docs, GET /admin/kb/docs/:id
- PUT /admin/kb/docs/:id, DELETE /admin/kb/docs/:id
- POST /admin/kb/docs/:id/analyze, PUT /admin/kb/docs/:id/mappings
- PUT /admin/tools/:toolName/toggle
- GET /admin/tools/:toolName/config, PUT /admin/tools/:toolName/config

**MCP Endpoints:**
- POST /mcp (JSON-RPC)
- GET /mcp (SSE)
- DELETE /mcp (session end)

## 6. Tools (27)

**Inventory (7):** list_products, get_product, list_stock_levels, get_stock_level, list_low_stock, list_suppliers, get_supplier

**Orders (6):** list_orders, get_order, list_invoices, get_invoice, list_overdue_invoices, get_payment_summary

**CRM (5):** list_contacts, search_contacts, get_contact, get_contact_orders, get_contact_invoices

**KB (3):** search_kb, get_kb_article, get_kb_sync_status

**Write (6):** create_stock_entry, update_stock_entry, create_invoice, update_invoice, create_contact, update_contact

## 7. Dashboard

React 19 + Vite + Tailwind at /dashboard/

Auth: username + password → JWT token

Pages:
- Login
- Tenant List
- Create Tenant (3-step)
- Tenant Detail (5 tabs: Keys, Tools, ERP, Setup, Audit)
- Knowledge Base (YouTrack config + test, sync status, API knowledge with endpoint editing, doc upload with .docx + tool mapping)
- Server Setup (tool registry with global enable/disable)

## 8. Configuration

Environment variables:
- DATABASE_URL (required): postgres://app_login:...
- DATABASE_MIGRATION_URL (required): postgres://postgres:...
- NODE_ENV: development (default)
- PORT: 3000
- ADMIN_SECRET (required): openssl rand -hex 32
- ADMIN_USERNAME: admin
- JWT_SECRET (required): openssl rand -hex 32
- JWT_EXPIRY_HOURS: 8
- YOUTRACK_BASE_URL, YOUTRACK_TOKEN, YOUTRACK_PROJECT (optional)
- KB_SYNC_INTERVAL_MS: 1800000

## 9. Development

Setup:
1. git clone, cd pb-mcp
2. npm ci
3. cp .env.example .env
4. createdb pb_mcp
5. npm run migrate:up
6. npm run dev

Tests: npm test, npm run test:db, npm run test:admin

Migrations: npm run migrate:create, npm run migrate:up, npm run migrate:down

## 10. Deployment

Docker: docker compose -f docker-compose.prod.yml up -d

Linux: Install deps, clone, npm ci, .env, migrate, systemd, nginx

Windows: Install MSIs, clone, npm ci, .env, migrate, NSSM

Production: Strong secrets, HTTPS, restrict endpoints, rotate keys, audit logs, backups

## Design Decisions

- AsyncLocalStorage: Context without passing tenant ID everywhere
- New McpServer per request: Stateless, cheap, scales
- SET LOCAL: Prevents connection pool context leakage
- JWT via crypto: Low dependencies
- Fire-and-forget audit: Never blocks responses
- Uploaded docs in kb_articles: Zero code changes
- FORCE RLS: Ensures superuser compliance

See README.md, HOW_IT_WORKS.md, SETUP.md for more.
