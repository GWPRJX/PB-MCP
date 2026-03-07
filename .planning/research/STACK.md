# Technology Stack

**Project:** PB MCP — Multi-Tenant ERP MCP Server
**Researched:** 2026-03-07
**Overall confidence:** MEDIUM-HIGH (core choices HIGH; auth pattern MEDIUM due to spec still maturing)

---

## Recommended Stack

### Layer 1: MCP Server Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | 5.x (latest stable) | Language | Type-safe by default; MCP TypeScript SDK is the reference implementation — Python SDK lags behind on transport features |
| Node.js | 22.x LTS | Runtime | LTS, required for `require(esm)` interop; jose 6.x drops support for older Node |
| @modelcontextprotocol/sdk | 1.27.x | MCP protocol implementation | Official SDK; implements full MCP 2025-03-26 spec including Streamable HTTP transport and OAuth 2.1 resource server patterns |
| zod | 3.25+ | Schema validation | Peer dependency of MCP SDK; used for tool input validation |

**Transport choice: Streamable HTTP (not stdio)**

Rationale: This is a multi-tenant server. stdio spawns one process per client — incompatible with tenant isolation at a process level and undeployable as a shared service. Streamable HTTP (introduced March 2025) is the spec-designated transport for remote, multi-tenant, and load-balanced MCP servers. It assigns per-session IDs via `Mcp-Session-Id` headers, supports resumability, and can operate statelessly behind a load balancer.

Do not use the legacy SSE transport. It was deprecated when Streamable HTTP shipped in the March 2025 spec revision.

### Layer 2: HTTP Framework (Admin API + MCP HTTP Host)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Fastify | 5.6.x | Admin API and MCP HTTP host | First-class TypeScript generics (not bolt-on like Express `@types`); built-in JSON Schema validation; 2-3x faster than Express; native HTTP/2 support; v5 targets Node 20+; actively maintained |
| @fastify/swagger | latest | OpenAPI docs for admin API | Auto-generates API docs from Fastify route schemas — useful for tenant onboarding docs |
| @fastify/jwt | latest | JWT middleware | Fastify-native JWT verification plugin; pairs with jose for token validation |

**Do not use Express.** Its TypeScript support is retrofitted via community types, its middleware model predates async/await, and it has no built-in validation. For a greenfield TypeScript project in 2026, Express adds friction without adding value.

**Do not use NestJS.** The decorator-heavy abstraction layer adds significant boilerplate and a steeper learning curve. For this project's scope, Fastify with a simple router structure is sufficient and more maintainable.

### Layer 3: Database Client and ORM

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| postgres (postgres.js) | 3.4.x | PostgreSQL client | Template-literal SQL, fastest Node.js PostgreSQL driver, automatic prepared-statement caching, native `set_config()` support needed for RLS tenant context injection per transaction |
| drizzle-orm | 0.45.x (stable) | Schema definition and migrations | SQL-first TypeScript schema; no code generation step; immediate type inference; ~7 KB bundle; works with postgres.js via its `postgres` adapter |
| drizzle-kit | 0.30.x (stable) | Migration tooling | CLI for generating and running migrations from Drizzle schema |

**Do not use Prisma.** Despite Prisma 7 dropping the Rust engine, Prisma still uses schema files external to TypeScript, requiring a generation step. Drizzle's schema-as-TypeScript approach means schema changes are immediately reflected in types without running `prisma generate`. This matters for a fast iteration cycle.

**Do not use node-postgres (pg).** postgres.js has a more ergonomic tagged-template API, automatic prepared statement caching, and is measurably faster. The key reason for this project: postgres.js makes it natural to issue `SET LOCAL app.tenant_id = $1` within a transaction scope, which is the RLS injection pattern.

### Layer 4: Multi-Tenant Isolation (PostgreSQL)

**Chosen pattern: Row-Level Security (RLS) with a shared schema**

Rationale:

- **Per-database isolation** is operationally expensive: separate connection pools, separate migration runs, separate backup schedules. Not justified for small-business ERP tenants.
- **Per-schema isolation** hits PostgreSQL schema limits as tenant count grows, complicates migrations (each schema must be migrated independently), and prevents cross-tenant analytics queries if ever needed.
- **RLS with shared schema** is the modern SaaS default (used by Supabase, Neon, AWS RDS multi-tenant examples). Operational cost is flat regardless of tenant count. Migration is a single run. All tenants share the same schema version.

Implementation approach:
1. Every tenant table carries a `tenant_id UUID NOT NULL` column.
2. Application connects as a low-privilege role (`app_user`), not the owner.
3. On each request, inject tenant context via `SET LOCAL app.current_tenant = $tenantId` inside a transaction.
4. RLS policies on each table: `USING (tenant_id = current_setting('app.current_tenant')::uuid)`.
5. The ORM (Drizzle) schema defines `tenant_id` on every table; migrations enforce `NOT NULL` and the RLS policies.

| Package | Version | Purpose |
|---------|---------|---------|
| postgres (postgres.js) | 3.4.x | Handles `SET LOCAL` within transaction scope natively |

No additional library needed for RLS — it is a PostgreSQL feature, not a library.

### Layer 5: Authentication for MCP Clients

**Chosen pattern: OAuth 2.1 resource server + API key bootstrap**

The MCP spec (as of the March 2025 revision) mandates that HTTP-transport MCP servers implement RFC 9728 (Protected Resource Metadata). The spec designates MCP servers as OAuth 2.1 resource servers — they validate tokens, they do not issue them. An external authorization server issues tokens.

For this project's scale (small business tenants, Claude Desktop and Cursor as clients), full OAuth 2.1 with dynamic client registration is the correct long-term architecture but impractical for v1. The recommended phased approach:

**Phase 1 (v1 — MVP):** API key per tenant, validated in Fastify middleware. Each tenant is provisioned an API key by the admin API. MCP clients include it in the `Authorization: Bearer <api-key>` header. The server resolves `tenant_id` from the key. Simple, auditable, ships fast.

**Phase 2 (post-MVP):** OAuth 2.1 resource server conformance. Add `.well-known/oauth-protected-resource` metadata endpoint. Integrate with an external auth provider (Auth0, Clerk, or self-hosted Keycloak). Tokens carry `org_id` claim for tenant resolution. Existing API keys can coexist during migration.

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| jose | 6.x | JWT verification (phase 2) | No dependencies; web-standard crypto APIs; supports JWKS remote key fetching; works on Node 22+; the reference JOSE implementation in JS |
| @fastify/jwt | latest | JWT middleware integration | Wraps jose for Fastify route decoration |
| crypto (Node built-in) | — | API key hashing | SHA-256 hash stored in DB; raw key issued once to tenant |

**Do not implement your own OAuth 2.1 authorization server.** The spec is complex and the attack surface is large. Delegate to Auth0, Clerk, or Keycloak. Your server is a resource server only.

**Do not store raw API keys in the database.** Store the SHA-256 hash; return the raw key exactly once at provisioning time.

### Layer 6: YouTrack KB Integration

**API approach: YouTrack REST API v1 with permanent token authentication**

YouTrack exposes a documented REST API for knowledge base articles at `/api/articles`. The permanent token approach is recommended over OAuth 2.0 for server-to-server (machine identity) access because it requires no redirect flow and is appropriate for a service account.

Key endpoints:
- `GET /api/articles?fields=id,idReadable,summary,content,updated,project(id,shortName)` — list all articles
- `GET /api/articles/{articleId}?fields=id,summary,content,updated,childArticles(id)` — single article with content
- `GET /api/articles/{articleId}/childArticles` — sub-articles tree traversal

Implementation pattern:
- Store YouTrack base URL and permanent token in environment variables (not per-tenant — this is a shared KB)
- Implement a `YouTrackClient` class wrapping `fetch` (Node 22 has native fetch)
- Cache article content in PostgreSQL (`youtrack_articles` table: `article_id`, `summary`, `content`, `synced_at`)
- Expose a `syncYouTrackKB` admin endpoint that triggers full refresh
- Expose a background job (node-cron or a simple setInterval) for periodic refresh
- MCP tool `query_kb` does a full-text search against the cached content (PostgreSQL `tsvector` search)

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| node-fetch / native fetch | Node 22 built-in | HTTP calls to YouTrack REST API | No additional library needed; Node 22 fetch is stable |
| node-cron | 3.x | Periodic KB sync scheduler | Lightweight, no queue infrastructure needed for v1 |

**Do not use a YouTrack client library from npm.** The `youtrack` package on PyPI (Python) is unmaintained; there is no authoritative YouTrack npm client. The REST API is simple JSON over HTTP — wrap it directly with typed fetch calls. A thin typed wrapper is 50 lines of TypeScript.

### Layer 7: Admin API/UI

**API: Fastify routes (same process as MCP HTTP server, different route prefix `/admin`)**

Separate process adds deployment complexity. For v1, co-locate admin routes under `/admin/*` in the same Fastify instance, guarded by a separate admin API key (not tenant keys). Separate into its own service in a later milestone if needed.

**UI: Minimal — defer or use a simple HTML form UI**

A full React admin UI is out of scope for v1. Options in priority order:
1. **No UI — admin via API calls only** (fastest to ship, sufficient for developer-centric onboarding)
2. **Scalar or Swagger UI** — auto-generated from the Fastify OpenAPI schema, gives a usable UI with zero frontend work
3. **Next.js admin panel** — defer to a later milestone

Recommendation: ship Scalar UI (served by `@scalar/fastify-api-reference`) in v1. It is generated from the OpenAPI schema automatically and gives a usable browser interface for tenant provisioning without writing any frontend code.

| Package | Version | Purpose | Why |
|---------|---------|---------|-----|
| @scalar/fastify-api-reference | latest | Admin UI | Auto-rendered from Fastify's OpenAPI schema; zero frontend code; modern look |
| @fastify/swagger | latest | OpenAPI schema generation | Required by Scalar; also useful for API consumers |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Language | TypeScript | Python | Python MCP SDK lags on Streamable HTTP transport; TypeScript SDK is the reference implementation |
| MCP transport | Streamable HTTP | stdio | stdio is per-process, not multi-tenant compatible; incompatible with shared hosting |
| HTTP framework | Fastify 5 | Express | Express TypeScript support is bolted on; no built-in validation; worse performance |
| HTTP framework | Fastify 5 | NestJS | Heavy abstraction, decorator overhead, unnecessary for this project scope |
| DB client | postgres.js | node-postgres (pg) | pg has less ergonomic template API; postgres.js is faster and `SET LOCAL` support is cleaner |
| ORM/schema | Drizzle | Prisma 7 | Prisma still requires code generation step; Drizzle types are immediate |
| Multi-tenant isolation | RLS (shared schema) | Per-schema | Per-schema doesn't scale, complex migrations; per-database is operationally expensive |
| Auth (v1) | API keys | OAuth 2.1 | OAuth 2.1 is the right long-term answer but over-engineered for v1; phase it in |
| JWT library | jose 6.x | jsonwebtoken | jsonwebtoken is CommonJS-only, no JWKS remote fetch, not maintained as actively |
| YouTrack client | Native fetch | npm client library | No authoritative YouTrack npm client exists; API is simple enough to wrap directly |
| Admin UI | Scalar (auto-generated) | React admin panel | React panel is a full frontend project; Scalar is free from OpenAPI schema |

---

## Installation

```bash
# Runtime
npm install @modelcontextprotocol/sdk zod

# HTTP framework
npm install fastify @fastify/swagger @fastify/jwt

# Database
npm install postgres drizzle-orm
npm install -D drizzle-kit

# Auth
npm install jose

# Admin UI
npm install @scalar/fastify-api-reference

# Scheduling (YouTrack sync)
npm install node-cron

# Dev tooling
npm install -D typescript @types/node ts-node tsx
```

---

## Key Version Summary

| Package | Version (verified 2026-03) | Source |
|---------|---------------------------|--------|
| @modelcontextprotocol/sdk | 1.27.1 | GitHub releases |
| fastify | 5.6.2 | npm / OpenJS announcement |
| postgres (postgres.js) | 3.4.8 | npm |
| drizzle-orm | 0.45.1 (stable) | npm |
| drizzle-kit | 0.30.x (stable) | npm |
| jose | 6.2.x | npm |
| node-cron | 3.x | npm |
| Node.js | 22.x LTS | nodejs.org |

---

## Confidence Assessment

| Decision | Confidence | Basis |
|----------|------------|-------|
| TypeScript + MCP SDK 1.27.x | HIGH | Official SDK GitHub releases verified |
| Streamable HTTP transport | HIGH | Official MCP spec 2025-03-26 documentation |
| Fastify 5 for admin API | HIGH | Official release + npm version verified |
| postgres.js for DB client | HIGH | npm version verified; performance benchmarks available |
| Drizzle ORM (stable 0.45.x) | HIGH | npm verified; v1.0.0 is still beta — avoid |
| RLS for multi-tenant isolation | HIGH | AWS, Crunchy Data, Supabase all document this pattern |
| API key for v1 auth | MEDIUM | MCP spec favors OAuth 2.1 long-term; API key is pragmatic for v1 but expect to phase it out |
| OAuth 2.1 resource server for v2 | MEDIUM | Spec is clear but implementation patterns still maturing across MCP ecosystem |
| YouTrack REST API (permanent token) | HIGH | Official JetBrains docs verified; `/api/articles` endpoint is documented |
| Scalar for admin UI | MEDIUM | Library is current but less battle-tested than alternatives; low risk since it auto-generates from schema |

---

## Sources

- [MCP TypeScript SDK — GitHub releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- [@modelcontextprotocol/sdk — npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP Authorization — official docs](https://modelcontextprotocol.io/docs/tutorials/security/authorization)
- [MCP Transports spec 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Fastify v5 GA release — OpenJS Foundation](https://openjsf.org/blog/fastifys-growth-and-success)
- [Fastify — npm](https://www.npmjs.com/package/fastify)
- [postgres.js — GitHub](https://github.com/porsager/postgres)
- [postgres — npm (v3.4.8)](https://www.npmjs.com/package/postgres)
- [drizzle-orm — npm](https://www.npmjs.com/package/drizzle-orm)
- [Drizzle v1 roadmap](https://orm.drizzle.team/roadmap)
- [jose — npm](https://www.npmjs.com/package/jose)
- [AWS: Multi-tenant RLS with PostgreSQL](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Crunchy Data: Row-Level Security for tenants](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [YouTrack REST API — articles](https://www.jetbrains.com/help/youtrack/devportal/resource-api-articles.html)
- [YouTrack permanent token auth](https://www.jetbrains.com/help/youtrack/devportal/authentication-with-permanent-token.html)
- [Scalekit: API keys vs OAuth 2.1 for MCP](https://www.scalekit.com/blog/migrating-from-api-keys-to-oauth-mcp-servers)
- [Drizzle vs Prisma 2026](https://www.bytebase.com/blog/drizzle-vs-prisma/)
