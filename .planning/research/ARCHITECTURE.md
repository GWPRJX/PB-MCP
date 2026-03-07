# Architecture Patterns

**Project:** PB MCP — Multi-Tenant ERP MCP Server
**Researched:** 2026-03-07
**Overall Confidence:** MEDIUM-HIGH (MCP spec verified via official docs; multi-tenancy patterns verified via multiple sources; ERP module separation inferred from domain patterns)

---

## Recommended Architecture

The system is a single deployable Node.js process exposing three external surfaces: an MCP endpoint (Streamable HTTP), an Admin REST API, and a background YouTrack sync worker. All three surfaces share one PostgreSQL database with Row-Level Security enforcing tenant isolation.

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Clients (External)                        │
│          Claude Desktop / Cursor / any MCP-compatible host           │
└────────────────────────────┬────────────────────────────────────────┘
                             │  Streamable HTTP  (MCP protocol)
                             │  Header: Authorization: Bearer <api-key>
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP Gateway Layer                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Transport: Streamable HTTP (POST /mcp or /{tenant}/mcp)    │    │
│  │  Session Manager  ──  Mcp-Session-Id header lifecycle       │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │  Auth Middleware                                              │    │
│  │  • Validates API key from Authorization header               │    │
│  │  • Resolves tenant_id from key → attaches to request ctx     │    │
│  │  • Sets PostgreSQL RLS context: SET app.current_tenant_id    │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │  Tool Router                                                  │    │
│  │  • Tool registry: all tools registered at startup            │    │
│  │  • Dispatches calls to domain handlers (no dynamic reg)      │    │
│  │  • Each handler receives tenant_id from request context      │    │
│  └──────┬───────────────┬──────────────────┬───────────────────┘    │
│         │               │                  │                         │
│  ┌──────▼──────┐ ┌──────▼──────┐  ┌───────▼──────┐                 │
│  │  Inventory  │ │   Orders &  │  │     CRM /    │                  │
│  │  & Products │ │   Billing   │  │   Contacts   │                  │
│  │  Handler    │ │   Handler   │  │   Handler    │                  │
│  └──────┬──────┘ └──────┬──────┘  └───────┬──────┘                 │
└─────────│───────────────│─────────────────│───────────────────────┘
          │               │                 │
          └───────────────┴─────────────────┘
                          │
          ┌───────────────▼──────────────────────────────────────────┐
          │  Data Access Layer (DAL)                                   │
          │  • Prisma ORM with per-request tenant context injection   │
          │  • PostgreSQL RLS policies enforced at DB level           │
          │  • Connection pool (PgBouncer or Prisma connection pool)  │
          └───────────────┬──────────────────────────────────────────┘
                          │
          ┌───────────────▼──────────────────────────────────────────┐
          │  PostgreSQL (single database, RLS-isolated tenants)       │
          │  Tables: tenants, api_keys, products, inventory,          │
          │          orders, order_lines, customers, contacts,         │
          │          youtrack_articles (cache), audit_log             │
          └──────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Admin API (separate Express router, same process)                   │
│  REST: /admin/tenants  /admin/tenants/:id/keys  /admin/sync         │
│  Auth: separate admin bearer token (env var), not tenant API keys   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Tenant CRUD      │  │ API Key Manager  │  │ Sync Trigger     │  │
│  │ • create tenant  │  │ • generate key   │  │ • POST /sync     │  │
│  │ • list tenants   │  │ • revoke key     │  │  triggers pull   │  │
│  │ • delete tenant  │  │ • list keys      │  └──────────────────┘  │
│  └──────────────────┘  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  YouTrack Sync Service (embedded worker, same process)               │
│  • Polls YouTrack REST API GET /api/articles on schedule (cron)     │
│  • Triggered on-demand via Admin API POST /admin/sync               │
│  • Writes parsed article content to youtrack_articles table         │
│  • KB Tool Handler reads from youtrack_articles (no live calls)     │
│  • Cache TTL: configurable (default: 15 min for on-demand refresh)  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### What Talks to What

| Component | Talks To | Does Not Talk To |
|-----------|----------|-----------------|
| AI Client (MCP host) | MCP Gateway (Streamable HTTP) | Admin API, DB directly |
| MCP Gateway (auth + session) | Tool Router, DAL (for auth lookup) | Admin API |
| Tool Router | Domain Handlers | YouTrack (uses cached KB handler) |
| Inventory Handler | DAL | Orders Handler, CRM Handler directly |
| Orders Handler | DAL | Inventory Handler directly |
| CRM Handler | DAL | Orders Handler directly |
| KB/YouTrack Handler | DAL (reads cache table) | YouTrack API directly |
| Admin API | DAL, Sync Trigger | MCP Gateway internals |
| YouTrack Sync Worker | YouTrack REST API, DAL | MCP Gateway, Admin API |
| DAL (Prisma) | PostgreSQL | All external services |

**Key rule:** Domain handlers are intentionally not aware of each other. Cross-domain queries (e.g., "orders for customer X") are composed at the tool level, not the handler level.

---

## Data Flow

### Request Lifecycle: MCP Tool Call

```
1. AI Client sends POST /mcp (or /{tenant}/mcp)
   Body: JSON-RPC 2.0 with method "tools/call", params.name = "inventory_get_product"
   Header: Authorization: Bearer <tenant-api-key>
   Header: Mcp-Session-Id: <session-uuid> (after initialization)

2. Auth Middleware
   • Looks up api_keys table: SELECT tenant_id FROM api_keys WHERE key_hash = $1
   • Attaches tenant_id to request context object
   • Sets PostgreSQL session variable: SET LOCAL app.current_tenant_id = '<tenant_id>'

3. Tool Router
   • Looks up registered tool by name "inventory_get_product"
   • Calls Inventory Handler with (params, requestContext)

4. Inventory Handler
   • Calls DAL: prisma.product.findMany({ where: { sku: params.sku } })
   • RLS policy on products table: WHERE tenant_id = current_setting('app.current_tenant_id')
   • Returns typed result

5. Tool Router
   • Wraps result in MCP tool response format (content array)

6. MCP Gateway
   • Returns HTTP 200 with JSON-RPC response
   • Streams partial results if handler supports it

7. AI Client
   • Presents result to LLM for reasoning
```

### Request Lifecycle: Admin Tenant Provisioning

```
1. Developer sends POST /admin/tenants
   Body: { "name": "Acme Corp", "slug": "acme" }
   Header: Authorization: Bearer <admin-secret>

2. Admin Auth Middleware
   • Validates against ADMIN_SECRET env var (not DB lookup)

3. Tenant Controller
   • Inserts row into tenants table
   • Generates initial API key (crypto.randomBytes → hash)
   • Inserts into api_keys table with tenant_id FK
   • Returns { tenantId, apiKey } to caller

4. Developer configures MCP client with returned apiKey
   (e.g., adds to Claude Desktop config.json)
```

### YouTrack Sync Data Flow

```
1. Cron scheduler fires every N minutes (configurable, default 60 min)
   OR Admin sends POST /admin/sync

2. Sync Worker
   • GET https://{youtrack-host}/api/articles?fields=id,summary,content,updated&$top=100
   • Paginates with $skip until all articles fetched
   • For each article: UPSERT into youtrack_articles (id, summary, content, updated_at)
   • Sets last_synced_at in a config/sync_state table

3. KB Tool Handler (when AI client queries "How does the invoice API work?")
   • SELECT content FROM youtrack_articles WHERE content ILIKE '%invoice%' LIMIT 5
   • Returns article content as MCP text resource
   • No live YouTrack call — uses DB cache only
```

---

## Suggested Build Order

Dependencies flow from bottom to top. Each phase unlocks the next.

### Phase 1 — Foundation (must be first)
**Build:** PostgreSQL schema + migrations, DAL (Prisma), RLS policies, tenant/api_key tables.

**Why first:** Everything else reads/writes data. No other component can be tested without this. RLS must be established before any tenant data is inserted — retrofitting RLS is painful.

**Delivers:** Working DB, Prisma client, RLS verified with seed data.

**Dependency unlocks:** All domain handlers, Admin API, auth middleware.

---

### Phase 2 — Admin API (before MCP, before ERP modules)
**Build:** Express app shell, Admin auth middleware, Tenant CRUD endpoints, API key generation.

**Why second:** The Admin API provisions tenants and generates API keys. Without it, there is no way to create a tenant to test MCP auth. Building MCP before this means stubbing tenant data manually — wasteful.

**Delivers:** POST /admin/tenants → returns { tenantId, apiKey }. Developer onboarding flow works end-to-end (partially).

**Dependency unlocks:** MCP auth middleware (needs a real API key to validate).

---

### Phase 3 — MCP Server Shell + Auth (before domain tools)
**Build:** McpServer with Streamable HTTP transport, session management, auth middleware (api_key → tenant_id resolution), empty tool registry.

**Why third:** The MCP protocol layer and auth must exist before any tools can be registered and tested against a real MCP client (Claude Desktop, MCP Inspector). Establishes the request context plumbing that all domain handlers rely on.

**Delivers:** MCP server that accepts connections, validates API keys, returns empty tools/list. Testable with MCP Inspector.

**Dependency unlocks:** All domain tool handlers.

---

### Phase 4 — ERP Domain Handlers (in parallel, no inter-dependency)
**Build:** Inventory & Products tools, Orders & Billing tools, CRM / Contacts tools.

**Why fourth:** All three domain handlers have the same shape (request context → DAL → response). They can be built in parallel. None depends on the others.

**Order within phase:** Inventory first (simplest read/write, no business logic), then Orders (has relationships to inventory/customers), then CRM (standalone but validates cross-domain queries).

**Delivers:** Full ERP tool coverage. AI client can manage stock, create orders, look up customers.

**Dependency unlocks:** YouTrack KB handler (needs a stable server to demonstrate alongside ERP tools).

---

### Phase 5 — YouTrack Sync Service
**Build:** Sync worker (YouTrack API client + DB upsert), cron scheduler, youtrack_articles table, KB query tool, Admin API sync trigger endpoint.

**Why fifth:** The KB sync is additive — it does not block any ERP functionality. Building it last avoids the complexity of YouTrack credentials/connectivity during core development. The DB schema (Phase 1) already includes the articles cache table.

**Delivers:** AI client can ask "How does the invoice API work?" and receive live-ish KB content. Admin can trigger manual sync.

**Dependency unlocks:** Tool self-configuration from KB articles (future milestone feature).

---

### Phase 6 — Admin UI (optional for v1, can be deferred)
**Build:** Lightweight web UI (React or plain HTML) for the Admin API.

**Why last:** The Admin API (Phase 2) is the actual system. The UI is a convenience layer. A developer with curl or Postman can provision tenants without UI. Deferring allows the API contract to stabilize first.

---

### Build Order Summary

```
Phase 1: DB Schema + RLS + Prisma DAL
    ↓
Phase 2: Admin REST API (tenant provisioning, API key generation)
    ↓
Phase 3: MCP Server Shell + Auth Middleware
    ↓
Phase 4: ERP Domain Handlers (Inventory → Orders → CRM, parallelizable)
    ↓
Phase 5: YouTrack Sync Worker + KB Tool
    ↓
Phase 6: Admin UI (optional)
```

---

## Key Architectural Decisions

### 1. Single Process, Three Surfaces
Run the MCP Gateway, Admin API, and Sync Worker in one Node.js process. The MCP endpoint and Admin API are separate Express routers on separate base paths. The sync worker is an in-process cron job.

**Why not microservices:** The ERP scope is bounded. Operational overhead of separate deployments outweighs the benefit at this scale. PostgreSQL is the shared state boundary anyway.

**When to split:** If sync worker causes latency on the MCP path (unlikely for polling workloads), extract it. If admin and MCP need separate scaling, split then.

### 2. PostgreSQL RLS Over Schema-Per-Tenant
Use a single schema, all tables have a `tenant_id UUID NOT NULL` column, and PostgreSQL RLS policies enforce `tenant_id = current_setting('app.current_tenant_id')::uuid`.

**Why RLS:** Schema-per-tenant causes linear migration time (200 tenants = 45+ minute deploys), index explosion (7,500 indexes vs 15), and PgBouncer incompatibility with per-connection search_path. RLS migrations run once regardless of tenant count.

**Confidence:** HIGH — confirmed by multiple production post-mortems.

### 3. API Key Auth Over OAuth for v1
Each tenant gets one or more API keys. The MCP client includes the key in the `Authorization: Bearer` header. The server does a DB lookup to resolve `tenant_id`.

**Why not OAuth 2.1:** The MCP spec (2025-03-26) standardizes OAuth 2.1 for human-in-the-loop flows. For M2M (AI agent → MCP server), API keys are simpler, well-understood, and sufficient for v1. The tenant API key functions like a service account token. Migrate to OAuth when human user context (not just tenant context) is needed.

**Confidence:** MEDIUM — OAuth is the direction the MCP spec is pushing; API keys are a valid starting point.

### 4. Static Tool Registration (Not Dynamic Per-Tenant)
Register all tools at server startup. Do not attempt to register tools dynamically based on tenant context.

**Why:** The MCP TypeScript SDK (as of 2025) does not support registering capabilities after transport connection is established without errors. Dynamic registration only takes effect after the current message cycle — making it unsuitable for per-tenant tool visibility. Instead, use tool-level auth checks inside handlers.

**Implication:** All tenants see the same tool list. Access restrictions are enforced inside the handler, not at the registry level.

**Confidence:** HIGH — confirmed by open GitHub issues #682 and #836 in the official TypeScript SDK.

### 5. YouTrack as Read-Only Cache, Not Live Gateway
The YouTrack sync worker pulls articles on a schedule and stores them in PostgreSQL. MCP tool handlers query the cache table — they never call YouTrack live.

**Why:** Live YouTrack calls during a tool invocation introduce network latency and an external dependency failure mode into every AI query. A stale-but-available cache is better UX than a live-but-flaky lookup.

**Cache invalidation:** Admin API `POST /admin/sync` triggers an immediate pull. Cron handles scheduled refresh.

---

## Component Boundaries: Detailed

### MCP Gateway Layer
- Owns: transport (Streamable HTTP), session ID lifecycle (`Mcp-Session-Id` header), JSON-RPC routing
- Does not own: business logic, tenant data, tool schemas
- Contract out: `requestContext.tenantId` (set by auth middleware, consumed by all handlers)

### Auth Middleware
- Owns: API key validation, tenant resolution, PostgreSQL session variable injection
- Does not own: tool dispatch, session management
- Failure modes: 401 (invalid key), 403 (key revoked), 500 (DB lookup failure)

### Domain Handlers (Inventory, Orders, CRM)
- Each owns: tool schemas (Zod), business logic, DAL calls for their domain tables
- Does not own: auth, tenant resolution, transport
- Cross-domain access: order handler may read customer name from contacts table — this is acceptable as a direct DAL join, not a call through the CRM handler

### Admin API
- Owns: tenant CRUD, API key lifecycle, sync trigger
- Does not own: MCP protocol, tenant data (products, orders, contacts)
- Auth: separate `ADMIN_SECRET` env var, completely isolated from tenant API keys

### YouTrack Sync Worker
- Owns: YouTrack REST API client, article parsing, DB upsert, cron scheduling
- Does not own: KB query logic (that belongs to KB handler), MCP transport
- Error handling: log and continue on YouTrack failure — do not crash the MCP server

### Data Access Layer
- Owns: Prisma schema, query building, connection pooling, RLS context injection
- Does not own: business logic, HTTP concerns
- RLS contract: every DB operation runs in a transaction with `SET LOCAL app.current_tenant_id = $1`

---

## Scalability Considerations

| Concern | At 10 tenants | At 100 tenants | At 1,000 tenants |
|---------|---------------|----------------|------------------|
| DB connections | Single pool fine | PgBouncer recommended | PgBouncer required |
| MCP sessions | In-process map | In-process map | Redis session store |
| DB schema migrations | ~instant (RLS) | ~instant (RLS) | ~instant (RLS) |
| YouTrack sync | Single worker | Single worker | Queue-based workers |
| Admin API | Single process | Single process | Separate deployment |

For v1 (< 50 tenants), the single-process architecture handles all concerns without additional infrastructure.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Schema-Per-Tenant
**What:** Creating a new PostgreSQL schema for each tenant on provisioning.
**Why bad:** 200 tenants = 45+ minute migrations, index count explosion, PgBouncer `search_path` bugs.
**Instead:** RLS on shared tables.

### Anti-Pattern 2: Live YouTrack Calls in Tool Handlers
**What:** Calling YouTrack REST API from inside MCP tool handler during request.
**Why bad:** Adds 200-500ms latency, makes every KB query dependent on YouTrack uptime.
**Instead:** Cache in youtrack_articles table, serve from DB.

### Anti-Pattern 3: Dynamic Tool Registration Per-Tenant
**What:** Registering different tool sets for different tenants after connection.
**Why bad:** MCP TypeScript SDK throws on post-connect capability registration; tools only visible after current message cycle.
**Instead:** Register all tools at startup; enforce access at handler level.

### Anti-Pattern 4: Domain Handlers Calling Each Other
**What:** Orders handler calling CRM handler's methods to resolve customer data.
**Why bad:** Creates circular dependency risk, makes testing harder, couples modules.
**Instead:** Cross-domain joins go through DAL directly. Shared query logic extracted to DAL utilities.

### Anti-Pattern 5: Tenant Resolution in Tool Handlers
**What:** Each handler reads the API key from headers and resolves tenant_id itself.
**Why bad:** Duplicates auth logic, inconsistent failure modes, harder to audit.
**Instead:** Auth middleware resolves tenant once per request, attaches to context object.

---

## Sources

- [MCP Architecture Specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/architecture) — HIGH confidence
- [MCP TypeScript SDK — GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — HIGH confidence
- [Dynamic Tool Registration Issue #682](https://github.com/modelcontextprotocol/typescript-sdk/issues/682) — HIGH confidence
- [MCP Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — HIGH confidence
- [Multi-User MCP Server Architecture — bix-tech.com](https://bix-tech.com/building-multi-user-ai-agents-with-an-mcp-server-architecture-security-and-a-practical-blueprint/) — MEDIUM confidence
- [Multi-Tenant MCP Servers — Medium](https://medium.com/@manikandan.eshwar/multi-tenant-mcp-servers-why-centralized-management-matters-a813b03b4a52) — MEDIUM confidence
- [PostgreSQL RLS vs Schema-Per-Tenant — thenile.dev](https://www.thenile.dev/blog/multi-tenant-rls) — HIGH confidence (production post-mortem)
- [YouTrack Articles REST API](https://www.jetbrains.com/help/youtrack/devportal/resource-api-articles.html) — HIGH confidence (official docs)
- [MCP Authorization — modelcontextprotocol.io](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) — HIGH confidence
- [Multi-Tenancy Database Patterns — glukhov.org](https://www.glukhov.org/post/2025/11/multitenant-database-patterns/) — MEDIUM confidence
