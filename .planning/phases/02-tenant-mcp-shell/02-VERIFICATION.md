---
phase: 02-tenant-mcp-shell
verified: 2026-03-16T12:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 2: Tenant Management + MCP Shell Verification Report

**Phase Goal:** Multi-tenant MCP server shell — provision tenants, issue API keys, authenticate MCP connections, serve empty tools/list
**Verified:** 2026-03-16
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tenants can be provisioned via admin REST API (POST /admin/tenants returns 201 with tenantId + apiKey) | VERIFIED | `src/admin/router.ts` line 56–58 returns 201 `{ tenantId, apiKey }`; test file confirms `apiKey.startsWith('pb_')` and length 67 |
| 2 | API keys are hashed at rest — raw key never stored in DB | VERIFIED | `generateApiKey()` in `src/admin/tenant-service.ts` line 16–20: stores only SHA-256 hash; `createTenant` inserts `hash` not `raw`; `getTenant` response schema excludes `key_hash` |
| 3 | Missing or wrong X-Admin-Secret returns 401 on all admin routes | VERIFIED | `checkAdminAuth` hook registered via `server.addHook('onRequest', ...)` in `src/admin/router.ts` line 20; applies to all 5 routes in plugin scope |
| 4 | MCP connections authenticate via X-Api-Key header; invalid/revoked key returns 401 | VERIFIED | `src/mcp/auth.ts` lines 24–44: validates header, hashes with SHA-256, queries DB; returns 401 JSON-RPC error for missing/invalid/revoked keys |
| 5 | API key resolves to tenant_id; context stored in AsyncLocalStorage for RLS | VERIFIED | `src/mcp/auth.ts` line 48: `tenantStorage.run({ tenantId, keyId }, handler)`; `src/context.ts` exports `tenantStorage` as `AsyncLocalStorage<TenantContext>` |
| 6 | POST /mcp with valid key returns 200 with MCP JSON-RPC response; tools/list returns empty array | VERIFIED | `src/index.ts` registers per-request `createMcpServer()` + `StreamableHTTPServerTransport`; `src/mcp/server.ts` calls `(server as any).setToolRequestHandlers()` to return `{ tools: [] }` |
| 7 | GET /mcp returns SSE stream (Streamable HTTP transport, not stdio) | VERIFIED | `src/index.ts` lines 42–53: `server.get('/mcp', ...)` handler calls `transport.handleRequest(request.raw, reply.raw)` with SSE-capable transport |
| 8 | Server writes zero bytes to stdout; all output is stderr-only | VERIFIED | `Fastify({ logger: false })` in `src/server.ts` line 10; zero `console.log/error` found in `src/`; `process.stderr.write()` used throughout; `tests/db/stderr-only.test.ts` confirms stdout empty |

**Score:** 8/8 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | 6 new runtime deps + 2 test scripts | VERIFIED | fastify, @fastify/swagger, @scalar/fastify-api-reference, @modelcontextprotocol/sdk, zod, drizzle-orm all present; `test:admin` and `test:mcp` scripts present |
| `src/db/schema.ts` | Drizzle pgTable mirrors for tenants + api_keys | VERIFIED | 21 lines; exports `tenants` and `apiKeys` pgTable definitions matching DB column names exactly |
| `src/db/client.ts` | sql + withTenantContext (unchanged) + db (new) | VERIFIED | Exports `sql`, `withTenantContext`, `db = drizzle(sql, { schema })` — all three present |
| `src/context.ts` | AsyncLocalStorage TenantContext with getTenantId() | VERIFIED | Exports `TenantContext` interface, `tenantStorage`, `getTenantId()`, `isTenantContext()` |
| `src/admin/tenant-service.ts` | All 7 DB operations | VERIFIED | Exports `generateApiKey`, `createTenant`, `listTenants`, `getTenant`, `createApiKey`, `revokeApiKey`, `lookupApiKeyByHash`; DUPLICATE_SLUG error handling present; revoked-key null return present |
| `src/server.ts` | buildServer() factory with swagger + scalar + admin routes | VERIFIED | 47 lines; exports `buildServer()`; registers swagger, scalarReference, adminRouter — all three wired |
| `src/admin/router.ts` | 5 admin routes + X-Admin-Secret onRequest hook | VERIFIED | 217 lines; `addHook('onRequest', checkAdminAuth)`; 5 routes: POST /tenants, GET /tenants, GET /tenants/:id, POST /tenants/:id/keys, DELETE /tenants/:id/keys/:keyId |
| `src/mcp/auth.ts` | extractAndValidateApiKey() with tenantStorage.run() | VERIFIED | 49 lines; exports `extractAndValidateApiKey`; hashes header, calls `lookupApiKeyByHash`, wraps in `tenantStorage.run()` |
| `src/mcp/server.ts` | createMcpServer() returning McpServer with empty tools | VERIFIED | 29 lines; exports `createMcpServer()`; calls `(server as any).setToolRequestHandlers()` to ensure `tools/list` returns `[]` |
| `src/index.ts` | Entry point with env validation, MCP routes, server.listen() | VERIFIED | 88 lines; validates DATABASE_URL + ADMIN_SECRET (exit 1 if missing); registers /mcp POST/GET/DELETE; `server.listen()`; all output via `process.stderr.write()` |
| `tests/admin/tenant-crud.test.ts` | Full implementation — TENANT-01, 02, 03 | VERIFIED | Uses `buildServer()` + `app.inject()`; no `it.todo` remaining; `statusCode` assertions present |
| `tests/admin/api-keys.test.ts` | Full implementation — TENANT-04, 05 | VERIFIED | Uses `buildServer()` + `app.inject()`; no `it.todo` remaining; `statusCode` assertions present |
| `tests/mcp/auth.test.ts` | Full implementation — TENANT-06, 07 | VERIFIED | Uses `buildServer()` + MCP routes + `app.inject()`; no `it.todo` remaining; `statusCode` assertions present |
| `tests/mcp/transport.test.ts` | Full implementation — INFRA-02 | VERIFIED | Tests POST (JSON), tools/list (empty array), GET SSE; no `it.todo` remaining |
| `tests/db/stderr-only.test.ts` | Stdout-empty assertions | VERIFIED | `spawnSync` with shell:true; asserts `result.stdout === ''` |
| `tests/smoke/process.test.ts` | Exit-code-1 assertions for missing env vars | VERIFIED | `spawnSync`; asserts `result.status === 1` and stderr contains env var name |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/server.ts` | `src/admin/router.ts` | `server.register(adminRouter, { prefix: '/admin' })` | WIRED | Line 44: `await server.register(adminRouter, { prefix: '/admin' })` |
| `src/admin/router.ts` | `src/admin/tenant-service.ts` | `import { createTenant, listTenants, getTenant, createApiKey, revokeApiKey }` | WIRED | Lines 2–8: all 5 functions imported and called in route handlers |
| `src/admin/tenant-service.ts` | `src/db/client.ts` | `import { db, sql }` | WIRED | Lines 3–4: `import { db } from '../db/client.js'` + `import { sql } from '../db/client.js'` |
| `src/admin/tenant-service.ts` | `src/db/schema.ts` | `import { tenants, apiKeys }` | WIRED | Line 5: `import { tenants, apiKeys } from '../db/schema.js'` |
| `src/db/client.ts` | `src/db/schema.ts` | `drizzle(sql, { schema })` | WIRED | Lines 3 + 45: `import * as schema` + `export const db = drizzle(sql, { schema })` |
| `src/mcp/auth.ts` | `src/admin/tenant-service.ts` | `lookupApiKeyByHash(hash)` | WIRED | Lines 3 + 35: imported and called with computed hash |
| `src/mcp/auth.ts` | `src/context.ts` | `tenantStorage.run({ tenantId, keyId }, handler)` | WIRED | Lines 4 + 48: `import { tenantStorage }` + `tenantStorage.run(...)` |
| `src/index.ts` | `src/server.ts` | `buildServer()` | WIRED | Line 1 + 20: imported and called |
| `src/index.ts` | `src/mcp/server.ts` | `createMcpServer()` in /mcp route handlers | WIRED | Lines 2 + 30: imported and called per-request |
| `src/index.ts` | `src/mcp/auth.ts` | `extractAndValidateApiKey(request, reply, ...)` | WIRED | Lines 3 + 29: imported and wraps all /mcp route handlers |
| `tests/admin/tenant-crud.test.ts` | `src/server.ts` | `buildServer()` then `app.inject()` | WIRED | Line 3: `import { buildServer }` + line 16: `app = await buildServer()` |
| `tests/mcp/auth.test.ts` | `src/mcp/auth.ts` | `extractAndValidateApiKey` in test /mcp routes | WIRED | Lines 6 + 43: imported and used in route registration |
| `tests/mcp/transport.test.ts` | `src/mcp/server.ts` | `createMcpServer()` in test /mcp routes | WIRED | Lines 4 + 31: imported and called per-request |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| TENANT-01 | 02-01, 02-02, 02-03 | Admin can create a new tenant with name, slug, and plan via REST API | SATISFIED | `POST /admin/tenants` returns 201 `{ tenantId, apiKey }`; 400 on missing fields; 409 on duplicate slug; 24 tests pass |
| TENANT-02 | 02-01, 02-02, 02-03 | Admin can list all tenants with status and key count | SATISFIED | `GET /admin/tenants` returns array with `keyCount`; `listTenants()` uses superuser pool to bypass RLS for aggregate |
| TENANT-03 | 02-01, 02-02, 02-03 | Admin can view a single tenant's details | SATISFIED | `GET /admin/tenants/:id` returns tenant + apiKeys array; apiKeys excludes `key_hash`; 404 on unknown id |
| TENANT-04 | 02-01, 02-02, 02-03 | Admin can issue API keys for a tenant (hashed at rest) | SATISFIED | `POST /admin/tenants/:id/keys` returns 201 `{ keyId, apiKey }`; `createApiKey` stores only SHA-256 hash with RLS context set |
| TENANT-05 | 02-01, 02-02, 02-03 | Admin can revoke a tenant API key | SATISFIED | `DELETE /admin/tenants/:id/keys/:keyId` returns 204; `revokeApiKey` sets `status='revoked'` + `revoked_at=now()`; 404 on already-revoked |
| TENANT-06 | 02-01, 02-04 | MCP client authenticates by presenting an API key in request header | SATISFIED | `extractAndValidateApiKey` validates `X-Api-Key`; missing/invalid/revoked returns 401 JSON-RPC error; valid key proceeds to handler |
| TENANT-07 | 02-01, 02-02, 02-04 | API key resolves to a `tenant_id` which sets PostgreSQL session variable for RLS | SATISFIED | `lookupApiKeyByHash` resolves key to `{ tenantId, keyId }`; `tenantStorage.run(context, handler)` makes `getTenantId()` available; `withTenantContext` sets `app.current_tenant_id` via `set_config()` |
| INFRA-02 | 02-01, 02-04 | MCP server uses Streamable HTTP transport (not stdio) | SATISFIED | `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js` used; POST/GET/DELETE /mcp registered; `reply.hijack()` after transport handles; human-verified via MCP Inspector |

**No orphaned requirements found.** All 8 requirement IDs declared across phase plans are covered. REQUIREMENTS.md traceability table shows all 8 as Complete.

---

## Anti-Patterns Found

No blockers or warnings found.

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `src/mcp/server.ts` | `(server as any).setToolRequestHandlers()` | Info | Uses `any` cast to call an internal SDK method. Required workaround — without it, `tools/list` returns `-32601 Method Not Found`. Documented in SUMMARY as intentional deviation. Not a stub. |
| `src/admin/tenant-service.ts` | `tx as unknown as postgres.Sql` cast (3 occurrences) | Info | Required pattern for postgres.js `TransactionSql` template-tag callability in TypeScript strict mode. Established pattern from Phase 1. Not a bug. |

Zero `it.todo` remaining across entire test suite. Zero `console.log` or `console.error` in `src/`. Zero `TODO/FIXME/PLACEHOLDER` comments in `src/`.

---

## Human Verification Already Completed

The Phase 2 human checkpoint (`02-04` Task 3) was approved by the user on 2026-03-16. The following were verified interactively:

1. **Server startup** — stderr showed `[pb-mcp] Server listening on http://0.0.0.0:3000`; stdout was empty
2. **Tenant creation** — `POST /admin/tenants` returned `{ tenantId, apiKey }` with `pb_` prefix
3. **Tenant listing** — `GET /admin/tenants` showed tenant with `keyCount: 1`
4. **MCP Inspector connection** — connected with valid API key; Tools tab showed empty list `[]`
5. **Auth rejection** — invalid key returned HTTP 401
6. **Full test suite** — all tests passed, 0 failed, 0 todo remaining
7. **Scalar docs UI** — `/docs` showed all 5 admin endpoints

No further human verification required.

---

## Implementation Notes (No Gaps)

Two significant implementation deviations from plan templates were auto-corrected during execution:

1. **Stateless transport per-request (index.ts):** The plan showed a shared transport instance; the actual implementation correctly creates a fresh `McpServer + StreamableHTTPServerTransport` per request. This is the correct SDK stateless mode pattern — the shared instance caused SDK errors. The per-request approach is what ships in the codebase.

2. **RLS on api_keys INSERTs:** `createTenant`, `createApiKey`, and `listTenants` all required `FORCE ROW LEVEL SECURITY` workarounds not present in the plan template. All three were fixed and committed. The codebase correctly handles RLS throughout.

Both deviations result in a more correct implementation than the plan template specified.

---

## Commits Verified

All 8 Phase 2 commits confirmed present in git history:

| Commit | Plan | Description |
|--------|------|-------------|
| `f18ae8c` | 02-01 | chore: install Phase 2 runtime dependencies |
| `e842ac5` | 02-01 | test: add test stub files for admin and MCP suites |
| `1581535` | 02-02 | feat: add Drizzle schema, db export, and AsyncLocalStorage context |
| `61c246e` | 02-02 | feat: add TenantService with all tenant and API key DB operations |
| `99f81a5` | 02-03 | feat: Fastify server factory + admin router with all 5 routes |
| `43627d4` | 02-03 | feat: implement admin test suite + fix RLS bugs in tenant-service |
| `7b73b3c` | 02-04 | feat: MCP auth middleware, MCP server shell, and server entry point |
| `d6c0eb8` | 02-04 | feat: implement MCP + legacy test suites, fix stateless transport |

---

_Verified: 2026-03-16T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
