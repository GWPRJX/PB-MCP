# How PB MCP Works

A technical reference for the Multi-Tenant ERP MCP Server. Covers architecture, data flow, security model, and every major component.

---

## What It Does

PB MCP is an HTTP server that exposes a company's ERP data (inventory, orders, invoices, contacts) and YouTrack knowledge base articles as MCP (Model Context Protocol) tools. An AI assistant like Claude connects to this server and can then answer questions like "what products are low on stock?" or "show me overdue invoices for this month" — the server handles authentication, tenant isolation, and database queries.

Multiple companies ("tenants") share a single running server and a single PostgreSQL database. Their data is kept separate by PostgreSQL Row-Level Security.

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
│   ├── server.ts             # Fastify factory — registers plugins and admin router
│   ├── context.ts            # AsyncLocalStorage — propagates tenant ID across async call chain
│   ├── admin/
│   │   ├── router.ts         # Admin REST API routes (POST/GET/DELETE /admin/*)
│   │   └── tenant-service.ts # All DB operations for tenants and API keys
│   ├── db/
│   │   ├── client.ts         # Two postgres.js pools + withTenantContext helper
│   │   ├── schema.ts         # Drizzle table definitions (TypeScript types for all tables)
│   │   └── check-pending.ts  # Startup check: warns if unapplied migrations exist
│   ├── mcp/
│   │   ├── auth.ts           # Per-request API key validation middleware
│   │   └── server.ts         # createMcpServer() — registers all 21 tools
│   ├── tools/
│   │   ├── errors.ts         # toolSuccess() / toolError() response helpers
│   │   ├── inventory.ts      # 7 inventory tools (list_products, get_product, etc.)
│   │   ├── orders.ts         # 6 order/invoice tools (list_orders, get_invoice, etc.)
│   │   ├── crm.ts            # 5 contact tools (list_contacts, search_contacts, etc.)
│   │   └── kb.ts             # 3 KB tools (search_kb, get_kb_article, get_kb_sync_status)
│   └── kb/
│       ├── sync.ts           # syncKbArticles() — fetches from YouTrack and caches locally
│       └── scheduler.ts      # startKbScheduler() — runs sync on a configurable interval
├── db/
│   └── migrations/           # SQL migration files (golang-migrate format)
│       ├── 000001_create_roles.up.sql
│       ├── 000002_create_tenants.up.sql
│       ├── 000003_create_api_keys.up.sql
│       ├── 000004_create_erp_tables.up.sql
│       └── 000005_create_kb_articles.up.sql
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
  │     5. tenantStorage.run({ tenantId, keyId }, handler)   ← set AsyncLocalStorage context
  │
  └─ handler() — now inside tenant context
        │
        ├─ createMcpServer()          ← fresh McpServer with all 21 tools registered
        ├─ new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        ├─ mcpServer.connect(transport)
        ├─ transport.handleRequest(request.raw, reply.raw, request.body)
        └─ reply.hijack()             ← Fastify must not send a second response
              │
              ▼
        MCP SDK dispatches tools/call → list_products handler
              │
              ├─ getTenantId()         ← reads from AsyncLocalStorage (set in step 5)
              ├─ withTenantContext(tenantId, async (tx) => {
              │     await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
              │     return tx`SELECT ... FROM products WHERE ...`   ← RLS applies
              │  })
              └─ return toolSuccess({ items, total_count, next_cursor })
```

### Admin Request (operator → tenant management)

```
Operator / deployment script
  │
  │  POST /admin/tenants  (headers: X-Admin-Secret: secret)
  ▼
Fastify onRequest hook (checkAdminAuth in src/admin/router.ts)
  │  Compare X-Admin-Secret against process.env.ADMIN_SECRET
  │  → 401 if missing or wrong
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

**`tenants`** (migration 000002) — no RLS, this is the tenant registry itself
```sql
id UUID, name TEXT, slug TEXT UNIQUE, plan TEXT, status TEXT, created_at, updated_at
```

**`api_keys`** (migration 000003) — RLS enabled + FORCE
```sql
id UUID, tenant_id UUID→tenants, key_hash TEXT UNIQUE, label TEXT, status TEXT, created_at, revoked_at
```
RLS policy: `tenant_id = current_setting('app.current_tenant_id', true)::uuid`

**ERP tables** (migration 000004) — all have RLS, all scoped to `tenant_id`
- `products` — SKU, name, price, description
- `stock_levels` — quantity_on_hand, reorder_threshold per product
- `suppliers` — supplier name, contact info
- `contacts` — CRM contacts (name, email, phone, company)
- `orders` — sales orders with status and date filters
- `order_line_items` — products × quantity × price per order (no updated_at — append only)
- `invoices` — linked to orders, tracks amount_due, status (paid/unpaid/overdue)

**`kb_articles`** (migration 000005) — **no RLS, no tenant_id** — global cache shared by all tenants
```sql
id UUID, youtrack_id TEXT UNIQUE, summary TEXT, content TEXT, tags TEXT[], synced_at TIMESTAMPTZ, content_hash TEXT
```

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
3. **Validation** (every MCP request):
   - SHA-256 the incoming `X-Api-Key` header
   - Open a short-lived superuser pool (`DATABASE_MIGRATION_URL`) to query `api_keys` without RLS context (we don't know the tenant yet)
   - If found and `status = 'active'` → proceed; otherwise 401
4. **Context propagation**: `tenantStorage.run({ tenantId, keyId }, handler)` — AsyncLocalStorage ensures `getTenantId()` works anywhere in the async call chain without passing arguments through every function
5. **Revocation**: `UPDATE api_keys SET status='revoked' WHERE id=:keyId`. Takes effect immediately on the next request.

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

## The 21 MCP Tools

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

All ERP tools enforce tenant isolation via `withTenantContext`. KB tools query `kb_articles` directly — no tenant context needed (global cache).

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
1. Checks `YOUTRACK_BASE_URL` and `YOUTRACK_TOKEN` — logs a warning and returns early if absent
2. Paginates through `GET /api/articles?query=project:P8&$top=100&$skip=N` until a page returns fewer than 100 items
3. Computes SHA-256 `content_hash` for each article
4. Atomically replaces the cache in one transaction: `DELETE FROM kb_articles` then `INSERT` all rows. If the transaction fails, existing rows are untouched.

**Scheduler** (`src/kb/scheduler.ts`):
- Called once at server startup (in `src/index.ts`)
- Runs one immediate sync, then repeats every `KB_SYNC_INTERVAL_MS` (default 30 minutes)
- Not started during `NODE_ENV=test`

**Manual trigger**: `POST /admin/kb/refresh` (requires `X-Admin-Secret`)

---

## Admin API

All routes under `/admin` require `X-Admin-Secret` header. The Scalar-generated UI at `/docs` documents all endpoints interactively.

| Method | Path | Action |
|--------|------|--------|
| `POST` | `/admin/tenants` | Create tenant → returns `{ tenantId, apiKey }` |
| `GET` | `/admin/tenants` | List all tenants with active key count |
| `GET` | `/admin/tenants/:id` | Tenant detail with key metadata |
| `POST` | `/admin/tenants/:id/keys` | Issue additional API key |
| `DELETE` | `/admin/tenants/:id/keys/:keyId` | Revoke API key |
| `POST` | `/admin/kb/refresh` | Trigger immediate KB sync |

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
4. Run all migrations against the test database
5. Create `app_user` / `app_login` roles and grant permissions
6. **Run `assert-rls.sh`** — fails the build if any tenant-bearing table lacks an RLS policy
7. `npm test` — runs the full vitest suite (107 tests)

---

## Key Design Decisions

**Why `FORCE ROW LEVEL SECURITY`?** Without it, the table owner role bypasses RLS silently. Since migrations run as the superuser and create tables owned by that user, `FORCE` is required for full isolation.

**Why a short-lived superuser pool for auth lookups?** The `api_keys` table has RLS. When a request arrives, we don't know the tenant yet — that's what the lookup resolves. Opening a superuser connection briefly for this one read is the only safe way to hash-lookup a key before establishing tenant context.

**Why create a new McpServer per request?** The MCP SDK's stateless transport doesn't support connection reuse across requests when `sessionIdGenerator` is undefined. Creating a new server is cheap because tool handlers are just function references.

**Why `AsyncLocalStorage` instead of passing tenant ID as an argument?** Tool handler functions are registered with the MCP SDK's `server.tool()` API. The SDK calls them directly — there's no way to inject parameters into that call. AsyncLocalStorage propagates context through the async chain without modifying function signatures.

**Why `SET LOCAL` (transaction-scoped) instead of `SET` (session-scoped)?** Connection pools reuse connections. A `SET` without `LOCAL` would persist the tenant ID on a connection until explicitly cleared, creating a risk of one tenant seeing another's data on a reused connection. `SET LOCAL` is cleared automatically on transaction commit or rollback.
