---
phase: 2
slug: tenant-mcp-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already installed) |
| **Config file** | `vitest.config.ts` (already exists from Phase 1) |
| **Quick admin run** | `npx vitest run --reporter=verbose tests/admin/` |
| **Quick mcp run** | `npx vitest run --reporter=verbose tests/mcp/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~45 seconds (real DB tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose tests/admin/` or `tests/mcp/` depending on which domain the task touches
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Requirements → Test Map

| Requirement | Description | Test File | Automated Command | Wave Implemented |
|-------------|-------------|-----------|-------------------|-----------------|
| TENANT-01 | Admin creates tenant (name, slug, plan) returns `{ tenantId, apiKey }` | `tests/admin/tenant-crud.test.ts` | `npx vitest run --reporter=verbose tests/admin/tenant-crud.test.ts` | W3 (stub in W1) |
| TENANT-02 | Admin lists tenants with status and key count | `tests/admin/tenant-crud.test.ts` | `npx vitest run --reporter=verbose tests/admin/tenant-crud.test.ts` | W3 (stub in W1) |
| TENANT-03 | Admin views single tenant details | `tests/admin/tenant-crud.test.ts` | `npx vitest run --reporter=verbose tests/admin/tenant-crud.test.ts` | W3 (stub in W1) |
| TENANT-04 | Admin issues additional API keys (hashed at rest) | `tests/admin/api-keys.test.ts` | `npx vitest run --reporter=verbose tests/admin/api-keys.test.ts` | W3 (stub in W1) |
| TENANT-05 | Admin revokes API key; revoked key immediately rejected | `tests/admin/api-keys.test.ts` | `npx vitest run --reporter=verbose tests/admin/api-keys.test.ts` | W3 (stub in W1) |
| TENANT-06 | MCP client authenticates via `X-Api-Key` header | `tests/mcp/auth.test.ts` | `npx vitest run --reporter=verbose tests/mcp/auth.test.ts` | W4 (stub in W1) |
| TENANT-07 | API key resolves to `tenant_id`, sets PostgreSQL session var for RLS | `tests/mcp/auth.test.ts` | `npx vitest run --reporter=verbose tests/mcp/auth.test.ts` | W4 (stub in W1) |
| INFRA-02 | MCP server uses Streamable HTTP transport (not stdio) | `tests/mcp/transport.test.ts` | `npx vitest run --reporter=verbose tests/mcp/transport.test.ts` | W4 (stub in W1) |

---

## Per-Wave Verification Commands

### Wave 1 — Dependencies + stubs
```bash
# After Wave 1 completes:
npx vitest run 2>&1 | tail -10
# Expected: 0 failed (all new stubs are it.todo)
node -e "const p=require('./package.json'); ['fastify','drizzle-orm','zod','@modelcontextprotocol/sdk'].forEach(d=>{ if(!p.dependencies[d]) throw new Error('missing: '+d); }); console.log('deps OK')"
```

### Wave 2 — Drizzle schema + service layer
```bash
# After Wave 2 completes:
npx tsc --noEmit 2>&1 | head -20
# Expected: no type errors
npx vitest run 2>&1 | tail -10
# Expected: still 0 failed (service layer has no test coverage until Wave 3)
```

### Wave 3 — Admin REST API
```bash
# After Wave 3 completes:
npx vitest run --reporter=verbose tests/admin/ 2>&1 | tail -30
# Expected: all TENANT-01 through TENANT-05 tests pass
npx tsc --noEmit 2>&1 | head -5
```

### Wave 4 — MCP server + auth
```bash
# After Wave 4 completes:
npx vitest run 2>&1 | tail -10
# Expected: ALL tests pass — zero failures, zero todo
npx tsc --noEmit 2>&1 | head -5
```

---

## Wave 0 Requirements (must exist before Wave 2 plans can run)

Created by Wave 1 (02-01-PLAN.md):

- [ ] `package.json` — updated with new runtime dependencies
- [ ] `tests/admin/tenant-crud.test.ts` — stubs for TENANT-01, TENANT-02, TENANT-03
- [ ] `tests/admin/api-keys.test.ts` — stubs for TENANT-04, TENANT-05
- [ ] `tests/mcp/auth.test.ts` — stubs for TENANT-06, TENANT-07
- [ ] `tests/mcp/transport.test.ts` — stub for INFRA-02
- [ ] All stubs use `it.todo()` — vitest exits 0 immediately after Wave 1

---

## Test Patterns (all Phase 2 tests follow these)

### Admin tests — fastify.inject() pattern
```typescript
// DO: use fastify.inject() — no real HTTP server port needed
const response = await app.inject({
  method: 'POST',
  url: '/admin/tenants',
  headers: { 'X-Admin-Secret': process.env.ADMIN_SECRET ?? 'test-secret' },
  payload: { name: 'Acme Corp', slug: 'acme', plan: 'standard' },
});
expect(response.statusCode).toBe(201);
```

### Tenant/key lifecycle — beforeAll/afterAll cleanup
```typescript
// DO: each test file creates its own tenant in beforeAll, cleans up in afterAll
// DO NOT: hardcode UUIDs or API keys in test files
let tenantId: string;
let apiKey: string;

beforeAll(async () => {
  const res = await app.inject({ method: 'POST', url: '/admin/tenants', ... });
  const body = JSON.parse(res.body);
  tenantId = body.tenantId;
  apiKey = body.apiKey;
});

afterAll(async () => {
  // Delete test tenant (cascades to api_keys via FK)
  await sql`DELETE FROM tenants WHERE id = ${tenantId}`;
  await app.close();
});
```

### MCP auth tests — HTTP-level via fastify.inject()
```typescript
// DO: send MCP initialize request with valid/invalid keys
const response = await app.inject({
  method: 'POST',
  url: '/mcp',
  headers: { 'X-Api-Key': apiKey },
  payload: { jsonrpc: '2.0', method: 'initialize', id: 1, params: { ... } },
});
```

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Desktop connects via MCP and receives empty tools/list | INFRA-02, TENANT-06 | Requires Claude Desktop app installed | Add MCP server config to claude_desktop_config.json, restart Claude Desktop, verify connection appears |
| MCP Inspector shows empty tool list after auth | INFRA-02, TENANT-06 | Requires MCP Inspector tool | `npx @modelcontextprotocol/inspector http://localhost:3000/mcp`, enter API key, verify tools/list = [] |
| Scalar UI renders all admin endpoints | TENANT-01–05 | Requires browser | Open http://localhost:3000/docs in browser, verify all 5 admin routes appear |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags in any verify command
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
