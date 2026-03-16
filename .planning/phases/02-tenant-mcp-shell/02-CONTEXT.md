# Phase 2: Tenant Management + MCP Shell - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the admin REST API for tenant provisioning and API key management, plus the MCP server transport layer with per-request tenant authentication middleware. Phase 2 delivers a working end-to-end path: a developer provisions a new tenant via admin API, receives a raw API key shown exactly once, then connects an MCP client (Claude Desktop or MCP Inspector) using that key and receives a successful `tools/list` response with an empty list. Phase 3 fills in the tool list.

</domain>

<decisions>
## Implementation Decisions

### All decisions below are LOCKED from prior architectural work — do not revisit

### Runtime and package versions
- Node.js 22 LTS, TypeScript ^5.0.0 (unchanged from Phase 1)
- Fastify ^5.0.0 — HTTP server and router
- @fastify/swagger ^9.0.0 — OpenAPI schema generation
- @scalar/fastify-api-reference @latest — Scalar UI served at /docs
- @modelcontextprotocol/sdk ^1.27.0 — MCP server implementation
- zod ^3.25.0 — schema validation
- drizzle-orm ^0.45.0 — type-safe query builder on top of postgres.js 3.4.x

### Drizzle usage constraints (LOCKED)
- Drizzle is a QUERY BUILDER only — it wraps the existing postgres.js `sql` client
- Drizzle is NOT used for migrations — migrations remain plain SQL with golang-migrate
- Drizzle schema files (`src/db/schema.ts`) are TypeScript mirror definitions of existing tables
- The Drizzle `db` export wraps the existing `sql` export from `src/db/client.ts`

### Transport (LOCKED)
- MCP Streamable HTTP transport — single `/mcp` endpoint (NOT per-tenant URL)
- Tenant identity is established via auth header, not URL path
- Open question from STATE.md resolved: single `/mcp` endpoint, auth via `X-Api-Key` header

### Authentication (LOCKED)
- API-key-per-tenant
- Format: `pb_` prefix + 64 hex chars (32 random bytes) — e.g. `pb_a3f1...`
- SHA-256 hashed at rest — raw key shown exactly once on creation, never stored
- Per-request: extract header → hash → DB lookup → resolve to `tenant_id`
- Sets `SET LOCAL app.current_tenant_id` (via `withTenantContext`) for RLS
- `AsyncLocalStorage` carries `{ tenantId }` for the duration of each request

### Admin API authentication (LOCKED)
- `X-Admin-Secret` header checked against `ADMIN_SECRET` env var
- `ADMIN_SECRET` is required at startup — server exits 1 if missing
- Admin routes use Fastify `onRequest` hook on the admin plugin scope

### Idempotency (LOCKED)
- `slug` is the natural idempotency key for tenant creation
- Duplicate `slug` returns 409 Conflict

### Key revocation (LOCKED)
- Immediate effect — revoked keys return 401 on next MCP request
- No grace period in v1

### Tenant context propagation (LOCKED)
- `AsyncLocalStorage` only — never module-level variables
- All tenant-scoped DB queries go through `withTenantContext` from `src/db/client.ts`

### Logging (LOCKED)
- `process.stderr.write()` exclusively — no `console.log()`, no `console.error()`
- stdout must remain completely clean (MCP transport uses stdout in stdio mode, and discipline prevents future accidents)

### Admin UI (LOCKED)
- Scalar auto-generated from OpenAPI schema — no custom frontend
- Accessible at `/docs` via @scalar/fastify-api-reference

### Startup validation (LOCKED)
- `DATABASE_URL` required — exit 1 if missing (already in client.ts)
- `ADMIN_SECRET` required — exit 1 if missing (new in Phase 2)
- `PORT` optional — defaults to 3000

</decisions>

<code_context>
## Existing Code (Phase 1 Complete)

### src/db/client.ts (complete — do not rewrite, only extend)
Exports:
- `sql` — postgres.js singleton using DATABASE_URL (app_login role, RLS enforced)
- `withTenantContext<T>(tenantId, fn)` — wraps query in transaction with SET LOCAL

### src/index.ts (placeholder — replace entirely in Wave 3)
Currently: `process.stderr.write('[pb-mcp] Server placeholder...')`
Phase 2 will replace this with the Fastify server bootstrap.

### Database tables (migrations 000001–000005 applied)
- `tenants` — id UUID PK, name TEXT, slug TEXT UNIQUE, plan TEXT, status TEXT, created_at, updated_at (NO RLS)
- `api_keys` — id UUID PK, tenant_id UUID FK, key_hash TEXT UNIQUE, label TEXT, status TEXT CHECK('active','revoked'), created_at, revoked_at (RLS + tenant_isolation policy)
- ERP tables (products, stock_levels, suppliers, orders, order_line_items, invoices, contacts) — all with RLS
- `kb_articles` — global cache, no RLS

### Existing test stubs (it.todo — deferred from Phase 1, implemented here)
- `tests/db/rls-isolation.test.ts` — will be implemented in Wave 4 (real DB)
- `tests/db/rls-policy-coverage.test.ts` — will be implemented in Wave 4
- `tests/db/app-role.test.ts` — will be implemented in Wave 4
- `tests/db/stderr-only.test.ts` — will be implemented in Wave 4 (after Fastify server exists)
- `tests/smoke/process.test.ts` — will be implemented in Wave 4 (after Fastify server exists)

### Integration points for Phase 3
- Phase 3 imports `db` (Drizzle) from `src/db/client.ts` for query building
- Phase 3 imports `getTenantId()` from `src/context.ts` to access tenant in tool handlers
- Phase 3 registers MCP tools against the `McpServer` created in `src/mcp/server.ts`
- No schema migrations needed in Phase 3 — all ERP tables already exist

</code_context>

<specifics>
## New Files This Phase Creates

```
src/context.ts              AsyncLocalStorage TenantContext
src/db/schema.ts            Drizzle table mirrors (tenants + api_keys)
src/db/client.ts            Extended: add drizzle db export
src/admin/tenant-service.ts TenantService — all tenant + key DB logic
src/server.ts               buildServer() Fastify factory
src/admin/router.ts         Admin plugin with onRequest auth hook + all 5 routes
src/mcp/auth.ts             extractAndValidateApiKey(request)
src/mcp/server.ts           createMcpServer() returning McpServer instance
src/index.ts                Server bootstrap (replaces placeholder)

tests/admin/tenant-crud.test.ts    Wave 1 stub → Wave 3 implementation
tests/admin/api-keys.test.ts       Wave 1 stub → Wave 3 implementation
tests/mcp/auth.test.ts             Wave 1 stub → Wave 4 implementation
tests/mcp/transport.test.ts        Wave 1 stub → Wave 4 implementation
```

</specifics>

<deferred>
## Deferred Ideas (MUST NOT appear in Phase 2 plans)

- OAuth 2.1 / JWT auth — deferred to v2; Phase 2 uses API keys only
- Per-tenant URL paths (e.g., `/{slug}/mcp`) — resolved as single `/mcp` endpoint
- PgBouncer connection pooling — plain postgres.js pool adequate for v1
- Admin role hierarchy (read-only vs read-write admin) — flat ADMIN_SECRET for v1
- Key expiry / TTL on API keys — no expiry in v1, revoke-only
- Rate limiting per tenant — deferred to v2
- Write MCP tools — deferred to Phase 3+ (Phase 3 is read-only)
- Full admin alerting UI for migration warnings — already deferred in Phase 1
- Per-tenant YouTrack KB cache — global cache per Phase 1 decision

</deferred>

---

*Phase: 02-tenant-mcp-shell*
*Context gathered: 2026-03-16*
