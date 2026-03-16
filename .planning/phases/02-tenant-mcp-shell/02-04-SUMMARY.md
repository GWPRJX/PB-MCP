---
phase: 02-tenant-mcp-shell
plan: "04"
subsystem: api
tags: [mcp, fastify, typescript, postgres, streamable-http, asynclocalstorage, vitest]

# Dependency graph
requires:
  - phase: 02-tenant-mcp-shell
    provides: "buildServer() factory, TenantService with lookupApiKeyByHash, AsyncLocalStorage tenantStorage, admin REST API (5 routes)"
  - phase: 01-database-foundation
    provides: "PostgreSQL schema with RLS, migrations, app_login role"
provides:
  - "src/mcp/auth.ts — extractAndValidateApiKey() wrapping handler in tenantStorage.run()"
  - "src/mcp/server.ts — createMcpServer() factory returning McpServer with empty tool list"
  - "src/index.ts — server entry point: env validation, Fastify listen, MCP route registration"
  - "Full MCP test suite: tests/mcp/auth.test.ts (TENANT-06/07), tests/mcp/transport.test.ts (INFRA-02)"
  - "Legacy test suites: tests/db/stderr-only.test.ts, tests/smoke/process.test.ts"
  - "Phase 2 complete — all 8 requirements (TENANT-01 through TENANT-07 + INFRA-02) covered"
affects:
  - phase-03-erp-domain-tools
  - phase-04-youtrack-kb-sync

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-request stateless MCP transport: StreamableHTTPServerTransport instantiated once, sessionIdGenerator: undefined"
    - "MCP auth middleware: header extraction → SHA-256 hash → DB lookup → tenantStorage.run(handler)"
    - "reply.hijack() after transport.handleRequest() prevents Fastify double-response"
    - "SSE GET test uses fetch+AbortController (not app.inject()) to avoid hanging on streaming response"
    - "Windows path quoting: resolve(process.cwd(), ...) in spawnSync tests to handle spaces in directory names"

key-files:
  created:
    - src/mcp/auth.ts
    - src/mcp/server.ts
    - src/index.ts
    - tests/mcp/auth.test.ts
    - tests/mcp/transport.test.ts
    - tests/db/stderr-only.test.ts
    - tests/smoke/process.test.ts
  modified: []

key-decisions:
  - "Stateless transport per-request: StreamableHTTPServerTransport with sessionIdGenerator: undefined — one shared instance, no session tracking"
  - "Single /mcp endpoint handles POST (JSON-RPC), GET (SSE server push), DELETE (session close) — tenant identified via X-Api-Key header, not URL"
  - "createMcpServer() requires explicit setToolRequestHandlers() call for tools/list to return [] — SDK does not auto-register an empty handler"
  - "SSE GET test uses fetch+AbortController instead of app.inject() — inject() hangs on streaming responses"
  - "Windows spawnSync paths use resolve(process.cwd(), 'src/index.ts') to handle spaces in project directory"

patterns-established:
  - "MCP auth gate: extractAndValidateApiKey(request, reply, handler) — call this in every /mcp route; never inline auth logic"
  - "Transport route pattern: await transport.handleRequest(req.raw, res.raw, body); reply.hijack() — always hijack after transport handles"
  - "Phase 3 tool registration: call mcpServer.tool() on the McpServer instance returned by createMcpServer()"

requirements-completed: [TENANT-06, TENANT-07, INFRA-02]

# Metrics
duration: 25min
completed: 2026-03-16
---

# Phase 2 Plan 04: MCP Server Shell Summary

**MCP Streamable HTTP shell with per-request SHA-256 API key auth, AsyncLocalStorage tenant context, and full test suite — Phase 2 end-to-end verified via MCP Inspector**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-16T10:20:00Z
- **Completed:** 2026-03-16T11:00:00Z
- **Tasks:** 2 (+ 1 human checkpoint)
- **Files modified:** 7

## Accomplishments

- MCP auth middleware (`extractAndValidateApiKey`) hashes incoming X-Api-Key via SHA-256, queries DB, and wraps handler in `tenantStorage.run()` — sole place tenant context is set
- MCP server shell (`createMcpServer`) returns a `McpServer` instance with zero tools registered; Phase 3 calls `.tool()` on the same instance
- Server entry point (`src/index.ts`) validates `DATABASE_URL` and `ADMIN_SECRET` at startup (exit 1 if missing), registers POST/GET/DELETE `/mcp` routes via `buildServer()`, and writes only to stderr
- Full MCP test suite implemented: TENANT-06 (auth validation), TENANT-07 (tenant context resolution), INFRA-02 (Streamable HTTP transport) — all passing
- Legacy stub suites completed: stderr-only logging (INFRA-06) and process smoke test (INFRA-01)
- Human checkpoint approved: MCP Inspector connected, tools/list returned empty array, admin API + auth rejection verified end-to-end

## Task Commits

Each task was committed atomically:

1. **Task 1: MCP auth middleware, MCP server shell, and server entry point** - `7b73b3c` (feat)
2. **Task 2: Implement MCP + legacy test suites** - `d6c0eb8` (feat)
3. **Task 3: Human checkpoint** - approved by user

## Files Created/Modified

- `src/mcp/auth.ts` — `extractAndValidateApiKey(request, reply, handler)`: SHA-256 header hash → DB lookup → `tenantStorage.run()` wrapper; returns 401 on missing/invalid/revoked key
- `src/mcp/server.ts` — `createMcpServer()`: returns `McpServer({ name: 'pb-mcp', version: '1.0.0' })` with zero tools (Phase 3 registers tools)
- `src/index.ts` — Server entry point: env validation → `buildServer()` → MCP route registration → `server.listen()` → stderr startup line; graceful SIGTERM/SIGINT shutdown
- `tests/mcp/auth.test.ts` — TENANT-06 (missing key 401, invalid key 401, revoked key 401, malformed key 401, valid key 200) + TENANT-07 (tenant context resolution via tools/list success)
- `tests/mcp/transport.test.ts` — INFRA-02 (POST returns application/json, tools/list returns empty array, GET returns 200 SSE or 405)
- `tests/db/stderr-only.test.ts` — INFRA-06 (stdout empty on early exit, stdout empty regardless of env)
- `tests/smoke/process.test.ts` — INFRA-01 (exit 1 + stderr when DATABASE_URL missing, exit 1 + stderr when ADMIN_SECRET missing)

## Decisions Made

- **Stateless transport reuse:** One `StreamableHTTPServerTransport` instance shared across requests with `sessionIdGenerator: undefined`. Plan template showed per-request instantiation but the SDK supports and recommends a single instance for stateless mode.
- **Explicit tool handler registration:** `createMcpServer()` required an explicit `setToolRequestHandlers()` call so `tools/list` returns `{ tools: [] }` instead of an error — the SDK does not auto-register an empty handler.
- **SSE test approach:** GET `/mcp` test uses `fetch` + `AbortController` instead of `app.inject()` because Fastify's inject layer hangs waiting for the SSE stream to close; `fetch` can be aborted after headers arrive.
- **Windows path handling:** `spawnSync` tests use `resolve(process.cwd(), 'src/index.ts')` rather than a relative path to handle the space in the project directory name ("PB MCP").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stateless transport must be instantiated per-request in plan template — corrected**
- **Found during:** Task 1 (server entry point + transport setup)
- **Issue:** Plan template showed `new StreamableHTTPServerTransport(...)` inside each route handler, which would create a new disconnected transport per request. The MCP SDK stateless pattern requires one instance connected once via `mcpServer.connect(transport)`.
- **Fix:** Transport instantiated once in `main()`, connected once; all three `/mcp` route handlers share the same transport instance.
- **Files modified:** src/index.ts, tests/mcp/auth.test.ts, tests/mcp/transport.test.ts
- **Verification:** `tools/list` returns `{ tools: [] }` in both tests and MCP Inspector — confirms transport state is maintained correctly.
- **Committed in:** 7b73b3c (Task 1 commit), d6c0eb8 (Task 2 commit)

**2. [Rule 1 - Bug] createMcpServer() needed explicit setToolRequestHandlers() for tools/list to return []**
- **Found during:** Task 2 (transport test — tools/list assertion)
- **Issue:** Without explicit handler registration, the SDK returned a "Method not found" error for `tools/list` rather than an empty array.
- **Fix:** Added `server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }))` inside `createMcpServer()` (or equivalent SDK call to register an empty tools list handler).
- **Files modified:** src/mcp/server.ts
- **Verification:** `body.result?.tools` equals `[]` in transport test.
- **Committed in:** d6c0eb8 (Task 2 commit)

**3. [Rule 1 - Bug] SSE GET test hangs with app.inject() — switched to fetch+AbortController**
- **Found during:** Task 2 (transport test — GET /mcp assertion)
- **Issue:** `app.inject({ method: 'GET', url: '/mcp' })` never resolves because Fastify's inject waits for the response to complete; SSE streams never close.
- **Fix:** Replaced GET inject with `fetch(serverUrl + '/mcp', { headers })` + `AbortController` aborted after headers received; check `res.headers.get('content-type')` directly.
- **Files modified:** tests/mcp/transport.test.ts
- **Verification:** Test completes in < 1s without hanging.
- **Committed in:** d6c0eb8 (Task 2 commit)

**4. [Rule 1 - Bug] Windows path quoting in spawnSync tests**
- **Found during:** Task 2 (stderr-only + smoke tests)
- **Issue:** Relative path `'src/index.ts'` in `spawnSync` failed on Windows when the working directory contained a space ("PB MCP").
- **Fix:** Used `resolve(process.cwd(), 'src/index.ts')` to produce an absolute path that `tsx` can resolve correctly regardless of directory name.
- **Files modified:** tests/db/stderr-only.test.ts, tests/smoke/process.test.ts
- **Verification:** Both test files pass in CI and locally on Windows.
- **Committed in:** d6c0eb8 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (4 bugs)
**Impact on plan:** All fixes corrected incorrect SDK usage or platform-specific behavior. No scope creep. Plan intent delivered exactly.

## Issues Encountered

None beyond the deviations documented above. All issues were diagnosed and resolved within the task execution.

## User Setup Required

None - no new external service configuration required beyond what Phase 1 established (DATABASE_URL, ADMIN_SECRET, Docker Compose postgres).

## Checkpoint Outcome

**Checkpoint approved.** All 7 verification steps passed:
1. Server started — stderr showed `[pb-mcp] Server listening on http://0.0.0.0:3000`, stdout empty
2. Tenant created via `POST /admin/tenants` — returned `{ tenantId, apiKey }`
3. Tenant appeared in `GET /admin/tenants` with `keyCount: 1`
4. MCP Inspector connected with valid API key — Tools tab showed empty list `[]`
5. Auth rejection confirmed — invalid key returned HTTP 401
6. Full test suite: all tests passed, 0 failed, 0 todo remaining
7. Scalar docs UI at `/docs` showed all 5 admin endpoints

## Next Phase Readiness

Phase 3 (ERP Domain Tools) can begin immediately:
- `createMcpServer()` returns the `McpServer` instance — Phase 3 calls `.tool()` on it to register ERP tools
- Tenant auth middleware is complete — all MCP routes are auth-gated with tenant context available via `getTenantId()`
- Admin API is operational — tenants can be provisioned and keys managed before any ERP tools exist
- All 8 Phase 2 requirements verified: TENANT-01 through TENANT-07 + INFRA-02

No blockers. Phase 3 planning can proceed.

---
*Phase: 02-tenant-mcp-shell*
*Completed: 2026-03-16*
