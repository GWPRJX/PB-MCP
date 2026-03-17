---
phase: 03-erp-domain-tools
plan: 02
status: complete
completed_at: 2026-03-17
subsystem: tools, integration-tests
tags: [inventory, mcp-tools, rls, pagination, integration-tests]
dependency_graph:
  requires: [03-01 (schema extension + test stubs)]
  provides: [src/tools/errors.ts, src/tools/inventory.ts with 7 tools, tests/tools/inventory.test.ts green]
  affects: [src/mcp/server.ts (Wave 3 will import registerInventoryTools here)]
tech_stack:
  added: []
  patterns: [raw txSql inside withTenantContext, enableJsonResponse stateless MCP transport pattern, toolError/toolSuccess helpers]
key_files:
  created:
    - src/tools/errors.ts
    - src/tools/inventory.ts
  modified:
    - tests/tools/inventory.test.ts
decisions:
  - "All 7 inventory tools use raw txSql (tx as unknown as postgres.Sql) — NOT db.select(). Drizzle db does not execute within the tenant transaction."
  - "list_products uses LEFT JOIN stock_levels to include qty_on_hand on every product row"
  - "get_supplier returns supplier fields only — no products list (no supplier_id FK on products in v1)"
  - "Test uses stateless per-request McpServer + transport with enableJsonResponse: true — matches working transport.test.ts pattern"
  - "Migration 000004_create_erp_tables applied to test DB via psql (migrate tool not available in CI path)"
metrics:
  duration: ~10 minutes
  completed_date: 2026-03-17
  tasks_completed: 2
  files_modified: 3
---

# Phase 3 Plan 02: Inventory Tools and Tests — Summary

Created shared error helpers (src/tools/errors.ts), registered all 7 inventory MCP tools (src/tools/inventory.ts), and implemented 16 green integration tests covering INV-01 through INV-07.

## Files Created / Modified

| File | Action | Description |
|---|---|---|
| `src/tools/errors.ts` | Created | `toolError(code, message, field?)` and `toolSuccess(data)` helpers used by all 18 ERP tools |
| `src/tools/inventory.ts` | Created | `registerInventoryTools(server: McpServer)` — registers 7 inventory tools |
| `tests/tools/inventory.test.ts` | Modified (replaced stubs) | 16 green integration tests, replaces all 18 it.todo() stubs |

## Tools Registered (7)

| Tool | INV # | Description |
|---|---|---|
| `list_products` | INV-01 | Paginated product list with qty_on_hand via LEFT JOIN stock_levels |
| `get_product` | INV-02 | Single product by UUID — returns NOT_FOUND for unknown or cross-tenant IDs |
| `list_stock_levels` | INV-03 | Paginated stock_levels with product_sku and product_name JOIN |
| `get_stock_level` | INV-04 | Single stock level by UUID — returns NOT_FOUND if not found |
| `list_low_stock` | INV-05 | Products where COALESCE(qty_on_hand, 0) < reorder_point, sorted by urgency |
| `list_suppliers` | INV-06 | Paginated supplier list |
| `get_supplier` | INV-07 | Single supplier by UUID — no products list (no supplier_id FK on products) |

All 7 tools:
- Call `getTenantId()` at the top of each handler
- Execute queries inside `withTenantContext(tenantId, async (tx) => { const txSql = tx as unknown as postgres.Sql ... })`
- Use `process.stderr.write()` for error logging — no console.log/console.error
- Return `toolError(...)` on failure (never throw from a handler)

## Test Results

```
Test Files: 1 passed (1)
     Tests: 16 passed (16)
  Duration: ~1.8s
```

All 16 tests green across 7 describe blocks (INV-01 through INV-07). No it.todo() stubs remaining.

## SQL Patterns Worth Noting for Wave 3

### 1. COUNT + paginated SELECT in same withTenantContext call

```typescript
const result = await withTenantContext(tenantId, async (tx) => {
  const txSql = tx as unknown as postgres.Sql;
  const [{ count }] = await txSql`
    SELECT COUNT(*) AS count FROM products
  ` as [{ count: string }];
  const totalCount = parseInt(count, 10);

  const items = await txSql`SELECT ... LIMIT ${limit} OFFSET ${offset}`;

  const nextCursor = offset + items.length < totalCount ? offset + limit : null;
  return { items, total_count: totalCount, next_cursor: nextCursor };
});
```

Key: both queries run in the same transaction — COUNT reflects exactly the same data the SELECT sees. `count` comes back as a string from postgres.js — always `parseInt(count, 10)`.

### 2. Filtered COUNT for list_low_stock

Both the COUNT and the main SELECT share the same WHERE clause:
```sql
WHERE p.is_active = true AND COALESCE(sl.quantity_on_hand, 0) < p.reorder_point
```
The `total_count` reflects only filtered rows, so `next_cursor: null` when all low-stock products fit on one page.

### 3. LEFT JOIN for products with optional stock levels

```sql
LEFT JOIN stock_levels sl ON sl.product_id = p.id
```
Products without a stock_levels row get `COALESCE(sl.quantity_on_hand, 0) AS qty_on_hand` — always a number, never null.

### 4. enableJsonResponse: true for test transports

MCP `StreamableHTTPServerTransport` defaults to SSE (text/event-stream). For integration tests using Fastify's `app.inject()`, the transport must be created with `enableJsonResponse: true` and a fresh instance per request (stateless pattern):

```typescript
app.post('/mcp', async (request, reply) => {
  await extractAndValidateApiKey(request, reply, async () => {
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    registerInventoryTools(mcpServer);  // or registerOrdersTools / registerCrmTools
    await mcpServer.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
    reply.hijack();
  });
});
```

Wave 3 (orders.test.ts, crm.test.ts) must use this exact pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MCP transport setup in test — missing enableJsonResponse: true**

- **Found during:** Task 2, first test run
- **Issue:** The plan's test template created a single shared `McpServer` + `StreamableHTTPServerTransport` instance and reused it across requests. Without `enableJsonResponse: true`, the transport returned SSE format (`event: message\n...`) instead of plain JSON, causing `JSON.parse` to throw `SyntaxError: Unexpected token 'e'`. Subsequent tests then received 500 errors because the shared transport state was corrupted after the first response.
- **Fix:** Replaced shared transport with stateless per-request pattern (matching `tests/mcp/transport.test.ts`): create fresh `McpServer` + transport with `enableJsonResponse: true` inside the `/mcp` route handler. `registerInventoryTools(mcpServer)` moved inside the route handler accordingly.
- **Files modified:** `tests/tools/inventory.test.ts`
- **Commit:** n/a (no commits per plan instructions)

**2. [Rule 3 - Blocking] Applied migration 000004 to test database**

- **Found during:** Task 2, first test run (beforeAll seed failed: "relation 'suppliers' does not exist")
- **Issue:** Migration 000004_create_erp_tables had not been applied to the local test DB. The `migrate` CLI was not in PATH. The pre-existing failure was documented in 03-01-SUMMARY.md as expected.
- **Fix:** Applied migration directly via psql: `psql -h localhost -U postgres -d pb_mcp -f db/migrations/000004_create_erp_tables.up.sql`
- **Files modified:** none (database state change only)

## TypeScript Compilation

`npx tsc --noEmit` exits 0 — no TypeScript errors.

## Full Suite Status

```
Test Files: 2 failed | 8 passed | 2 skipped (12)
     Tests: 4 failed | 61 passed | 34 todo (99)
```

The 4 failing tests are all pre-existing failures documented in 03-01-SUMMARY.md — unrelated to this plan:
- `tests/db/rls-isolation.test.ts` (3 failures) — RLS isolation tests for ERP tables need test data configured through the migration runner; pre-existing
- `tests/db/app-role.test.ts` (1 failure) — error code mismatch 42P07 vs 42501; pre-existing
