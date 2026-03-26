# How PB MCP Works

A technical reference for the Multi-Tenant ERP MCP Server. Covers architecture, data flow, security model, and every major component.

---

## What It Does

PB MCP is an HTTP server that exposes a company's ERP data (inventory, orders, invoices, contacts) and YouTrack knowledge base articles as 27 MCP (Model Context Protocol) tools (21 read + 6 write). Each tool resolves its POSibolt API endpoint via a DB-backed config with admin-configurable overrides. An AI assistant like Claude connects to this server and can then answer questions like "what products are low on stock?" or "show me overdue invoices for this month", and perform write operations like creating invoices or transferring stock — the server handles authentication, tenant isolation, and API routing.

Multiple companies ("tenants") share a single running server and a single PostgreSQL database. Their data is kept separate by PostgreSQL Row-Level Security.

An admin dashboard (React) provides a GUI for managing tenants, API keys, tool permissions, ERP configuration, audit logs, and API documentation. Admins can control which MCP tools each tenant or API key has access to, and every tool call is audit-logged.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 LTS, TypeScript (ESM) |
| HTTP server | Fastify 5 |
| MCP protocol | `@modelcontextprotocol/sdk` 1.27+ |
| Database | PostgreSQL 17 |
| SQL client | postgres.js 3.4 |
| ORM | Drizzle ORM 0.45 (type generation; queries use raw postgres.js) |
| Migrations | golang-migrate v4.19.1 (static binary) |
| Validation | Zod 3.25 |
| Dev runtime | tsx (TypeScript execution without pre-compiling) |

---

## Directory Layout

```
pb mcp/
├── src/
│   ├── index.ts              # Entry point — starts Fastify, registers /mcp routes, starts KB scheduler
│   ├── server.ts             # Fastify factory — registers plugins, admin router, JWT login, dashboard static serving
│   ├── context.ts            # AsyncLocalStorage — propagates tenant context (ID, ERP config, enabled tools)
│   ├── admin/
│   │   ├── router.ts         # Admin REST API routes (25+ endpoints: tenants, keys, tools, ERP, audit, KB docs, tool config)
│   │   ├── tenant-service.ts # DB operations for tenants and API keys (incl. expiry + allowed_tools)
│   │   ├── auth-middleware.ts # JWT signing/verification (HS256) + jwtAuthHook (JWT or X-Admin-Secret)
│   │   ├── tool-permissions-service.ts # Tenant + per-key tool access control
│   │   ├── audit-service.ts  # recordToolCall (fire-and-forget) + queryAuditLog
│   │   ├── settings-service.ts # Key-value store for dashboard-configurable settings (KB sync, etc.)
│   │   ├── tool-registry-service.ts # Global tool registry management (seed, query, toggle)
│   │   ├── seed-service.ts   # Demo tenant seeding for development
│   │   └── connection-tester.ts # POSibolt ERP connection test (standalone + per-tenant)
│   ├── db/
│   │   ├── client.ts         # Two postgres.js pools + withTenantContext helper
│   │   ├── schema.ts         # Drizzle table definitions (TypeScript types for all tables)
│   │   └── check-pending.ts  # Startup check: warns if unapplied migrations exist
│   ├── mcp/
│   │   ├── auth.ts           # Per-request API key validation (incl. expiry check, tool filtering, audit logging)
│   │   └── server.ts         # createMcpServer() — registers 27 tools with optional filter
│   ├── posibolt/
│   │   └── client.ts         # POSibolt REST API client (OAuth token caching, pbGet/pbPost)
│   ├── tools/
│   │   ├── errors.ts         # toolSuccess() / toolError() response helpers
│   │   ├── config.ts         # Per-tool API endpoint config resolver (DB-backed with 60s cache)
│   │   ├── inventory.ts      # 7 inventory tools (list_products, get_product, etc.)
│   │   ├── orders.ts         # 6 order/invoice tools (list_orders, get_invoice, etc.)
│   │   ├── crm.ts            # 5 contact tools (list_contacts, search_contacts, etc.)
│   │   ├── write.ts          # 6 write tools (create_stock_entry, create_invoice, etc.)
│   │   └── kb.ts             # 3 KB tools (search_kb, get_kb_article, get_kb_sync_status)
│   └── kb/
│       ├── sync.ts           # syncKbArticles() — fetches from YouTrack and caches locally
│       └── scheduler.ts      # startKbScheduler() — runs sync on a configurable interval
├── dashboard/                # React admin dashboard (Vite + React 19 + Tailwind v4 + React Router v7)
│   └── src/
│       ├── App.tsx           # Root component — JWT auth check, routing
│       ├── api.ts            # API client — JWT token management, all admin API functions
│       ├── components/
│       │   ├── Layout.tsx    # Navigation shell with logout
│       │   └── Tooltip.tsx   # Reusable info-icon tooltip (Tailwind group-hover, no external lib)
│       └── pages/
│           ├── LoginPage.tsx        # Username + password → JWT login
│           ├── TenantsPage.tsx      # Tenant list with tooltips
│           ├── CreateTenantPage.tsx  # 3-step tenant creation wizard (info → ERP credentials test → API key)
│           ├── TenantDetailPage.tsx  # 5-tab detail: Keys, Tools, ERP, Setup, Audit Log
│           └── KnowledgeBasePage.tsx # Server-level KB management: YT config, sync, doc upload
├── db/
│   └── migrations/           # SQL migration files (golang-migrate format)
│       ├── 000001_create_roles.up.sql
│       ├── 000002_create_tenants.up.sql
│       ├── 000003_create_api_keys.up.sql
│       ├── 000004_create_erp_tables.up.sql
│       ├── 000005_create_kb_articles.up.sql
│       ├── 000006_add_erp_config.up.sql
│       ├── 000007_create_tool_permissions.up.sql
│       ├── 000008_create_audit_log.up.sql
│       ├── 000009_add_api_key_expiry.up.sql
│       ├── 000010_create_server_settings.up.sql
│       ├── 000011_create_tool_registry.up.sql
│       └── 000012_add_doc_tool_mappings.up.sql
├── scripts/
│   └── assert-rls.sh         # CI gate: fails if any tenant table lacks an RLS policy
└── .github/workflows/ci.yml  # GitHub Actions: run migrations + RLS check + test suite
```

---

## Request Flow

### MCP Request (AI client → ERP data)

```
AI client
  │
  │  POST /mcp  (headers: X-Api-Key: pb_xxx...)
  │  body: { jsonrpc: "2.0", method: "tools/call", params: { name: "list_products", arguments: {...} } }
  ▼
Fastify route handler (src/index.ts)
  │
  ├─ extractAndValidateApiKey(request, reply, handler)  (src/mcp/auth.ts)
  │     1. Read X-Api-Key header
  │     2. SHA-256 hash the key
  │     3. Open short-lived superuser pool → SELECT from api_keys WHERE key_hash = $hash
  │     4. If not found or revoked → reply 401, return
  │     5. If expired (expires_at < NOW()) → reply 401 "API key expired", return
  │     6. Load ERP config from tenants table
  │     7. Load enabled tools: getEnabledTools(tenantId, allowedTools)
  │        (intersection of tenant-level permissions and per-key restrictions)
  │     8. tenantStorage.run({ tenantId, keyId, erpConfig, enabledTools }, handler)
  │
  └─ handler() — now inside tenant context
        │
        ├─ createMcpServer(enabledTools)  ← only registers tools this key is allowed to use
        ├─ new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        ├─ mcpServer.connect(transport)
        ├─ transport.handleRequest(request.raw, reply.raw, request.body)
        └─ reply.hijack()             ← Fastify must not send a second response
              │
              ▼
        MCP SDK dispatches tools/call → list_products handler
              │
              ├─ getTenantId()         ← reads from AsyncLocalStorage
              ├─ recordToolCall(...)   ← audit log (fire-and-forget, non-blocking)
              ├─ withTenantContext(tenantId, async (tx) => {
              │     await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
              │     return tx`SELECT ... FROM products WHERE ...`   ← RLS applies
              │  })
              └─ return toolSuccess({ items, total_count, next_cursor })
```

### Admin Request (operator / dashboard → tenant management)

```
Dashboard or curl
  │
  │  POST /admin/auth/login   (body: { username, password })
  ▼
Login handler (src/server.ts) — unprotected
  │  Compare username vs ADMIN_USERNAME, password vs ADMIN_SECRET
  │  → 401 if wrong
  │  → signJwt({ sub: 'admin' }) using HS256 + JWT_SECRET
  ▼
Reply: { token: "eyJ..." }   ← JWT valid for JWT_EXPIRY_HOURS (default 8h)


Dashboard or curl
  │
  │  POST /admin/tenants  (headers: Authorization: Bearer TOKEN)
  ▼
Fastify onRequest hook (jwtAuthHook in src/admin/auth-middleware.ts)
  │  1. Check Authorization: Bearer → verify JWT signature + expiry
  │  2. Fallback: check X-Admin-Secret header
  │  → 401 if neither valid
  ▼
Route handler → tenant-service.createTenant()
  │  Single transaction:
  │    INSERT INTO tenants (name, slug, plan)
  │    SELECT set_config('app.current_tenant_id', new_id, true)  ← RLS requires this even for INSERT
  │    INSERT INTO api_keys (tenant_id, key_hash, label)
  ▼
Reply: { tenantId: "uuid", apiKey: "pb_..." }   ← raw key shown once, never stored
```

---

## Database Schema

### PostgreSQL roles (migration 000001)

Two roles are created. The application **never** runs as the superuser:

| Role | Type | Privileges |
|------|------|-----------|
| `app_user` | NOLOGIN | SELECT, INSERT, UPDATE on all tables |
| `app_login` | LOGIN | Inherits `app_user`; no BYPASSRLS, no DDL |

`DATABASE_URL` uses `app_login`. `DATABASE_MIGRATION_URL` uses `postgres` (superuser) for migrations and select admin operations.

### Tables

**`tenants`** (migrations 000002 + 000006) — no RLS, this is the tenant registry itself
```sql
id UUID, name TEXT, slug TEXT UNIQUE, plan TEXT, status TEXT, created_at, updated_at,
erp_base_url TEXT, erp_client_id TEXT, erp_app_secret TEXT, erp_username TEXT, erp_password TEXT, erp_terminal TEXT
```
ERP config columns (000006) store POSibolt connection details per tenant. All nullable.

**`api_keys`** (migrations 000003 + 000007 + 000009) — RLS enabled + FORCE
```sql
id UUID, tenant_id UUID→tenants, key_hash TEXT UNIQUE, label TEXT, status TEXT,
created_at, revoked_at, expires_at TIMESTAMPTZ, allowed_tools TEXT[]
```
- `expires_at` (000009): optional key expiry — NULL means never expires
- `allowed_tools` (000007): per-key tool restrictions — NULL means inherit tenant defaults
- RLS policy: `tenant_id = current_setting('app.current_tenant_id', true)::uuid`

**ERP tables** (migration 000004) — all have RLS, all scoped to `tenant_id`
- `products` — SKU, name, price, description
- `stock_levels` — quantity_on_hand, reorder_threshold per product
- `suppliers` — supplier name, contact info
- `contacts` — CRM contacts (name, email, phone, company)
- `orders` — sales orders with status and date filters
- `order_line_items` — products × quantity × price per order (no updated_at — append only)
- `invoices` — linked to orders, tracks amount_due, status (paid/unpaid/overdue)

**`kb_articles`** (migrations 000005 + 000012) — **no RLS, no tenant_id** — global cache shared by all tenants
```sql
id UUID, youtrack_id TEXT UNIQUE, summary TEXT, content TEXT, tags TEXT[], synced_at TIMESTAMPTZ, content_hash TEXT, mapped_tools TEXT[]
```
YouTrack-synced articles have `P8-A-*` IDs. Admin-uploaded docs have `DOC-*` IDs. `mapped_tools` (000012) stores which MCP tools an uploaded doc is relevant to.

**`tool_registry`** (migration 000011) — **no RLS** — global catalog of all MCP tools
```sql
id UUID, tool_name TEXT UNIQUE, display_name TEXT, description TEXT, category TEXT, source TEXT, source_doc_id UUID→kb_articles, is_active BOOLEAN, parameters JSONB, created_at, updated_at
```
Seeded with all 27 builtin tools. `is_active` controls global tool availability. `parameters` JSONB stores per-tool API endpoint overrides (endpoint, method, notes) used by `getToolEndpoint()` at runtime.

**`tool_permissions`** (migration 000007) — RLS enabled + FORCE
```sql
id UUID, tenant_id UUID→tenants, tool_name TEXT, enabled BOOLEAN DEFAULT true, created_at, updated_at
UNIQUE(tenant_id, tool_name)
```
Controls which MCP tools are available per tenant. If no row exists for a tool, it defaults to enabled.

**`audit_log`** (migration 000008) — RLS enabled + FORCE, append-only
```sql
id UUID, tenant_id UUID→tenants, key_id UUID→api_keys, tool_name TEXT, params JSONB,
status TEXT ('success'|'error'), error_message TEXT, duration_ms INTEGER, created_at TIMESTAMPTZ
```
Records every MCP tool call. Indexed on `(tenant_id, created_at DESC)`. App role has SELECT + INSERT only.

---

## Tenant Isolation

The isolation mechanism has three layers that must all be present:

**Layer 1 — Role permissions**: `app_login` has no `BYPASSRLS` and does not own any tables. A rogue query without context gets zero rows, not an error.

**Layer 2 — RLS policies**: Every ERP table and `api_keys` has:
```sql
ALTER TABLE foo ENABLE ROW LEVEL SECURITY;
ALTER TABLE foo FORCE ROW LEVEL SECURITY;   -- applies even to the table owner's role
CREATE POLICY tenant_isolation ON foo
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```
`FORCE ROW LEVEL SECURITY` is critical — without it the table owner can bypass RLS.

**Layer 3 — SET LOCAL**: Every tenant-scoped query runs inside a transaction that calls `set_config('app.current_tenant_id', tenantId, true)` first. The `true` argument makes it transaction-local (automatically reset on commit/rollback). This prevents pool contamination between requests.

**CI enforcement** (`scripts/assert-rls.sh`): The GitHub Actions pipeline runs this script after migrations. It queries `pg_policies` and fails the build if any table is missing a policy.

---

## API Key Lifecycle

1. **Generation**: `'pb_' + randomBytes(32).toString('hex')` → 67-character string
2. **Storage**: SHA-256 hash stored in `api_keys.key_hash`. Raw key returned once and discarded.
3. **Optional expiry**: Keys can have an `expires_at` timestamp. NULL means never expires.
4. **Validation** (every MCP request):
   - SHA-256 the incoming `X-Api-Key` header
   - Open a short-lived superuser pool (`DATABASE_MIGRATION_URL`) to query `api_keys` without RLS context (we don't know the tenant yet)
   - If not found or `status != 'active'` → 401
   - If `expires_at` is set and past → 401 "API key expired"
   - Load the key's `allowed_tools` array (per-key tool restrictions)
5. **Context propagation**: `tenantStorage.run({ tenantId, keyId, erpConfig, enabledTools }, handler)` — AsyncLocalStorage ensures context works anywhere in the async call chain
6. **Tool filtering**: `getEnabledTools(tenantId, allowedTools)` returns the intersection of tenant-level permissions and per-key restrictions. Only these tools are registered on the MCP server for this request.
7. **Revocation**: `UPDATE api_keys SET status='revoked' WHERE id=:keyId`. Takes effect immediately on the next request.

---

## MCP Transport Pattern

The server uses **Streamable HTTP** in **stateless per-request mode**:

- `sessionIdGenerator: undefined` — no session IDs, no session state
- A **new `McpServer` + `StreamableHTTPServerTransport`** is created for every incoming request
- This is intentional: it's safe, simple, and works without sticky sessions or shared state
- The MCP SDK supports this for stateless tool servers

Three HTTP methods on `/mcp`:
- `POST` — main channel (initialize, tools/list, tools/call)
- `GET` — SSE for server-to-client push (rarely used by tool servers)
- `DELETE` — session termination (no-op in stateless mode)

All three are guarded by the same `extractAndValidateApiKey` middleware.

---

## The 27 MCP Tools

### Inventory (7 tools)

| Tool | What it does |
|------|-------------|
| `list_products` | Paginated product catalog (name, SKU, price) |
| `get_product` | Single product by ID or SKU |
| `list_stock_levels` | Current quantity-on-hand for all products |
| `get_stock_level` | Stock level for one specific product |
| `list_low_stock` | Products below their reorder threshold |
| `list_suppliers` | All suppliers for this tenant |
| `get_supplier` | Supplier detail including associated products |

### Orders & Billing (6 tools)

| Tool | What it does |
|------|-------------|
| `list_orders` | Paginated orders with status/date filters |
| `get_order` | Single order with line items and linked contact |
| `list_invoices` | Paginated invoices with status/date filters |
| `get_invoice` | Invoice detail with payment status and amount due |
| `list_overdue_invoices` | All unpaid invoices past due date |
| `get_payment_summary` | Totals: outstanding, collected, overdue |

### CRM / Contacts (5 tools)

| Tool | What it does |
|------|-------------|
| `list_contacts` | Paginated contacts (name, email, phone, company) |
| `get_contact` | Single contact by ID or email |
| `search_contacts` | Contacts matching name, company, or tag |
| `get_contact_orders` | Order history for a specific contact |
| `get_contact_invoices` | Invoice history + outstanding balance for a contact |

### KB / YouTrack (3 tools)

| Tool | What it does |
|------|-------------|
| `search_kb` | ILIKE search across article summaries and content |
| `get_kb_article` | Full Markdown content by YouTrack article ID (e.g. "P8-A-7") |
| `get_kb_sync_status` | Last sync timestamp + total cached article count |

### Write Operations (6 tools)

| Tool | What it does |
|------|-------------|
| `create_stock_entry` | Create a stock transfer request between warehouses |
| `update_stock_entry` | Complete/finalize a pending stock transfer |
| `create_invoice` | Create a sales order + invoice with line items and payments |
| `update_invoice` | Cancel an existing sales order |
| `create_contact` | Create a new business partner (customer or vendor) |
| `update_contact` | Update an existing business partner's details |

All ERP tools (read + write) call the POSibolt REST API via `pbGet()`/`pbPost()`. Each tool resolves its API endpoint via `getToolEndpoint()` — this checks the `tool_registry.parameters` JSONB column for admin-configured overrides before falling back to the hardcoded default. KB tools query `kb_articles` directly — no tenant context needed (global cache). All tool calls are audit-logged.

### Tool response shape

Every tool returns MCP content in JSON embedded in a `text` block:
```json
{
  "content": [{ "type": "text", "text": "{\"items\":[...],\"total_count\":42}" }]
}
```
On error: same structure with `isError: true` and a `{ "code": "NOT_FOUND", "message": "..." }` body.

---

## KB Sync

The KB sync system keeps a local cache of YouTrack articles so MCP tool queries are fast and don't depend on YouTrack availability.

**Sync worker** (`src/kb/sync.ts`):
1. Checks for YouTrack credentials — first from dashboard-configurable DB settings, then from env vars. Logs a warning and returns early if absent.
2. Builds the query: `project:{PROJECT}` plus an optional article filter query (e.g. `tag: api`) configurable via the dashboard KB settings page.
3. Paginates through `GET /api/articles?query=...&$top=100&$skip=N` until a page returns fewer than 100 items
4. Computes SHA-256 `content_hash` for each article
5. Atomically replaces the cache in one transaction: `DELETE FROM kb_articles` then `INSERT` all rows. If the transaction fails, existing rows are untouched.

**Scheduler** (`src/kb/scheduler.ts`):
- Called once at server startup (in `src/index.ts`)
- Runs one immediate sync, then repeats every `KB_SYNC_INTERVAL_MS` (default 30 minutes)
- Not started during `NODE_ENV=test`

**Manual trigger**: `POST /admin/kb/refresh` (requires `X-Admin-Secret`)

---

## Admin API

All routes under `/admin` require authentication — either `Authorization: Bearer JWT` or `X-Admin-Secret` header. The login endpoint is unprotected. The Scalar-generated UI at `/docs` documents all endpoints interactively.

### Authentication

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/admin/auth/login` | Authenticate with username + password → returns `{ token }` (JWT) |

### Tenant Management

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/admin/tenants` | Create tenant → returns `{ tenantId, apiKey }` |
| `GET` | `/admin/tenants` | List all tenants with active key count |
| `GET` | `/admin/tenants/:id` | Tenant detail with keys (incl. expiresAt, allowedTools) |

### API Key Management

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/admin/tenants/:id/keys` | Issue API key (optional expiresAt) |
| `DELETE` | `/admin/tenants/:id/keys/:keyId` | Revoke API key |
| `PUT` | `/admin/tenants/:id/keys/:keyId/tools` | Set per-key tool restrictions (null = inherit) |

### Tool Permissions

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/admin/tenants/:id/tools` | Get tool permissions (enabled/disabled per tool) |
| `PUT` | `/admin/tenants/:id/tools` | Update tenant-level tool permissions |
| `GET` | `/admin/tools` | List all registered MCP tools (name, category, source, active state) |

### ERP Configuration

| Method | Path | Action |
|--------|------|--------|
| `PUT` | `/admin/tenants/:id/erp-config` | Update POSibolt connection details |
| `POST` | `/admin/tenants/:id/test-connection` | Test POSibolt ERP connection |
| `POST` | `/admin/test-erp-credentials` | Test ERP credentials without a tenant (used by onboarding wizard) |

### KB Settings

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/admin/kb/settings` | Get YouTrack connection settings (base URL, project, article filter query, sync interval) |
| `PUT` | `/admin/kb/settings` | Update YouTrack connection settings |
| `GET` | `/admin/kb/sync-status` | Get last sync timestamp, article count, success/failure |
| `POST` | `/admin/kb/test-connection` | Test YouTrack connection using stored credentials |

### Audit Log

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/admin/tenants/:id/audit-log` | Query audit log (filters: toolName, status, limit, offset) |

### KB / Documentation

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/admin/kb/refresh` | Trigger immediate YouTrack KB sync |
| `POST` | `/admin/kb/upload` | Upload API doc (markdown, DOC-* ID) |
| `GET` | `/admin/kb/docs` | List uploaded docs (pagination) |
| `GET` | `/admin/kb/docs/:id` | Get single doc with full content |
| `PUT` | `/admin/kb/docs/:id` | Update uploaded doc (title, content, tags) |
| `DELETE` | `/admin/kb/docs/:id` | Delete uploaded doc (DOC-* only) |
| `POST` | `/admin/kb/docs/:id/analyze` | Analyze doc content for POSibolt API patterns → tool mapping suggestions |
| `PUT` | `/admin/kb/docs/:id/mappings` | Save confirmed tool mappings for a doc |

### Tool Registry & Config

| Method | Path | Action |
|--------|------|--------|
| `GET` | `/admin/tools` | List all registered MCP tools with category, source, and active state |
| `PUT` | `/admin/tools/:toolName/toggle` | Toggle a tool's global active/inactive state |
| `GET` | `/admin/tools/:toolName/config` | Get per-tool API endpoint override config |
| `PUT` | `/admin/tools/:toolName/config` | Set per-tool API endpoint override (endpoint, method, notes) |

---

## Logging

All output goes to **stderr only**. `stdout` is never written to — the MCP transport uses `stdout` for its wire protocol and any writes would corrupt it.

Fastify's built-in logger is disabled (`logger: false`). All log lines use `process.stderr.write()` directly with a `[component]` prefix.

---

## CI Pipeline

`.github/workflows/ci.yml` runs on every push and PR:

1. Start `postgres:17-alpine` service container
2. `npm ci`
3. Install `golang-migrate` binary
4. Run all 12 migrations against the test database
5. Create `app_user` / `app_login` roles and grant permissions
6. **Run `assert-rls.sh`** — fails the build if any tenant-bearing table (including `tool_permissions` and `audit_log`) lacks an RLS policy
7. `npm test` — runs the full vitest suite (19 test files covering DB, admin, MCP, tools, KB, and smoke tests)

Environment variables set for CI: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `ADMIN_SECRET`, `JWT_SECRET`.

---

## Tool Access Control

Admins can restrict which MCP tools a tenant or specific API key has access to. The system has two layers:

**Tenant-level permissions** (`tool_permissions` table): Controls which of the 27 tools are available to a tenant. All tools default to enabled. An admin disables specific tools via `PUT /admin/tenants/:id/tools`.

**Per-key restrictions** (`api_keys.allowed_tools` column): Further restricts a specific API key to a subset of tools. NULL means "inherit tenant defaults". When set, the MCP session only sees the **intersection** of tenant-enabled tools and key-allowed tools.

The filter is applied at MCP server creation time — `createMcpServer(enabledTools)` only registers tools in the enabled set. Disabled tools don't appear in `tools/list` and can't be called.

---

## Audit Logging

Every MCP tool call is recorded in the `audit_log` table:

- **What's logged**: tenant_id, key_id, tool_name, params (JSONB), status (success/error), error_message, duration_ms, created_at
- **Recording**: Fire-and-forget via `recordToolCall()` — audit insert never blocks the tool response
- **Querying**: `GET /admin/tenants/:id/audit-log` with optional filters (toolName, status) and pagination
- **Security**: RLS-enforced, append-only (app role has INSERT + SELECT only, no UPDATE/DELETE)
- **Dashboard**: Audit Log tab shows paginated entries with tool name and status filter dropdowns

---

## Admin Dashboard

A React single-page application served at `/dashboard/` provides a GUI for all admin operations.

**Stack**: Vite + React 19 + Tailwind CSS v4 + React Router v7

**Authentication**: Username + password → `POST /admin/auth/login` → JWT stored in localStorage. All API calls use `Authorization: Bearer` header. Expired JWT redirects to login.

**Pages**:
- **Login** — username (default: admin) + password
- **Tenant List** — name, slug, plan, status, key count, creation date
- **Create Tenant** — slug validation, one-time API key reveal
- **Tenant Detail** — 5 tabs:
  - **API Keys** — create with optional expiry, revoke, per-key tool scoping (expandable rows)
  - **Tool Permissions** — toggle on/off per tool, bulk enable/disable, save
  - **ERP Config** — 6 POSibolt fields, save + test connection
  - **Setup** — MCP client config snippets (Claude Desktop, Cursor, Generic) with copy buttons, Export PDF
  - **Audit Log** — paginated list with tool name and status filter dropdowns
- **Knowledge Base** — four sections:
  - **YouTrack Configuration** — base URL, token, project ID, article filter query (YouTrack search syntax), sync interval, test connection button
  - **Sync Status** — last sync time, article counts, errors, manual "Sync Now" button
  - **API Knowledge** — browse all MCP tools grouped by category, view POSibolt API endpoints, inline edit to override endpoints per tool (e.g. swap `/productmaster/productlist` for `/productmaster/productdetailedlist`), custom badge on overridden tools
  - **Uploaded Documents** — file upload (.docx via mammoth, .md, .txt, .json, .yaml, .html, .csv), auto-analysis for tool mapping (35 regex patterns with confidence scoring), manual tool mapping panel, edit/delete

Every technical term across all pages has an info-icon tooltip explaining it in plain language. Admins can export tenant setup instructions as a PDF via browser print-to-PDF (`window.print()`).

**Serving**: In production, `@fastify/static` serves `dashboard/dist/` with SPA fallback. In development, use `npm run dashboard:dev` (Vite dev server on port 5173 with proxy to backend).

---

## Per-Tool API Endpoint Configuration

Admins can override the POSibolt API endpoint that each MCP tool calls. This is useful when a better API exists (e.g. `/productmaster/productdetailedlist` returns warehouse info that `/productmaster/productlist` does not).

**How it works:**
1. The `tool_registry` table has a `parameters JSONB` column. When an admin saves an endpoint override via the dashboard or `PUT /admin/tools/:toolName/config`, it writes `{ "endpoint": "/new/path", "method": "GET", "notes": "..." }` to this column.
2. At runtime, every tool calls `getToolEndpoint('tool_name', '/default/endpoint')` before making its POSibolt API call. This checks the DB-backed config (cached for 60 seconds) and returns the override if set, or the hardcoded default.
3. The dashboard's API Knowledge section shows all tools with their current endpoints, a "custom" badge on overridden tools, and an inline edit form to change the endpoint.

**Cache invalidation:** Saving a config via the admin API calls `invalidateToolConfigCache()`, so changes take effect within 60 seconds (or immediately for the next request after save).

---

## KB Doc Upload

Admins can upload markdown API documentation via the dashboard or `POST /admin/kb/upload`. Uploaded docs are stored in the existing `kb_articles` table with a `DOC-` prefix on the `youtrack_id` field (e.g., `DOC-a1b2c3d4`) to distinguish them from YouTrack-synced articles (`P8-A-*`).

- **Upload**: title + markdown content + optional tags → stored with SHA-256 content hash
- **Edit/Delete**: Only DOC-* prefixed docs can be modified or deleted (protects YouTrack-synced articles)
- **Searchable immediately**: The existing `search_kb` and `get_kb_article` MCP tools query all rows in `kb_articles` — no code changes needed for uploaded docs to be discoverable by AI clients
- **Size limit**: 1MB (1,048,576 characters) per document

---

## Key Design Decisions

**Why `FORCE ROW LEVEL SECURITY`?** Without it, the table owner role bypasses RLS silently. Since migrations run as the superuser and create tables owned by that user, `FORCE` is required for full isolation.

**Why a short-lived superuser pool for auth lookups?** The `api_keys` table has RLS. When a request arrives, we don't know the tenant yet — that's what the lookup resolves. Opening a superuser connection briefly for this one read is the only safe way to hash-lookup a key before establishing tenant context.

**Why create a new McpServer per request?** The MCP SDK's stateless transport doesn't support connection reuse across requests when `sessionIdGenerator` is undefined. Creating a new server is cheap because tool handlers are just function references.

**Why `AsyncLocalStorage` instead of passing tenant ID as an argument?** Tool handler functions are registered with the MCP SDK's `server.tool()` API. The SDK calls them directly — there's no way to inject parameters into that call. AsyncLocalStorage propagates context through the async chain without modifying function signatures.

**Why `SET LOCAL` (transaction-scoped) instead of `SET` (session-scoped)?** Connection pools reuse connections. A `SET` without `LOCAL` would persist the tenant ID on a connection until explicitly cleared, creating a risk of one tenant seeing another's data on a reused connection. `SET LOCAL` is cleared automatically on transaction commit or rollback.

**Why JWT via built-in Node.js crypto instead of jsonwebtoken/jose?** HS256 signing is straightforward with `crypto.createHmac()`. Avoiding a JWT library keeps the dependency count low and the implementation auditable.

**Why fire-and-forget audit logging?** Audit inserts should never slow down tool responses. `recordToolCall()` runs the INSERT without awaiting it — if it fails, the tool response is unaffected.

**Why store uploaded docs in kb_articles instead of a separate table?** The `search_kb` and `get_kb_article` MCP tools already query `kb_articles`. Storing uploaded docs there means zero code changes for searchability. The `DOC-*` prefix on `youtrack_id` distinguishes uploaded docs from YouTrack-synced ones.
