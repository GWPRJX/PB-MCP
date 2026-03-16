# Phase 3: ERP Domain Tools — Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Register all 18 read-only MCP tools covering Inventory & Products (7 tools), Orders & Billing (6 tools), and CRM / Contacts (5 tools). After this phase, an AI client authenticated as a tenant can query the full ERP dataset through natural language — stock levels, sales orders, invoices, and contacts — with all queries scoped to the authenticated tenant via existing RLS infrastructure.

No new migrations needed. All ERP tables were created in Phase 1. No write tools — those are v2.

</domain>

<decisions>
## Implementation Decisions

### All prior decisions from Phases 1+2 are LOCKED — do not revisit

### Pagination (LOCKED)
- **Default limit:** 200 (return up to 200 rows when client omits `limit`)
- **No hard cap:** if client passes a higher limit, return all matching rows
- **Cursor style:** transparent offset — `limit` (integer) + `offset` (integer, default 0)
- **total_count:** always included in every list response — requires COUNT(*) per call, accepted cost
- **Exhausted page:** `next_cursor: null` when offset + returned rows >= total_count

All list tool input schemas include:
```
limit?: number   // default 200
offset?: number  // default 0
```
All list tool responses follow:
```json
{
  "items": [...],
  "total_count": 42,
  "next_cursor": null | number
}
```
`next_cursor` is the next offset value (offset + limit), or null if no more results.

### Response depth for relationship tools (LOCKED)
- **`get_order`** — inline: full order fields + all line items (product name, SKU, qty, unit_price, line_total) + linked contact (name, email, phone). Single call = complete order picture.
- **`list_products`** — includes `qty_on_hand` from `stock_levels` JOIN. "Show me the catalog" almost always needs stock context.
- **`get_supplier`** — products listed as compact objects: `{ id, name, sku }` only. AI uses `get_product` for full detail.
- **`get_contact_orders`** — summary rows: `{ id, order_date, status, total }`. AI uses `get_order` for line items.
- **`get_contact_invoices`** — summary rows: `{ id, issued_at, due_at, status, total, paid_at }`. AI uses `get_invoice` for detail.

### Error handling (LOCKED)
- **All errors** use MCP `isError: true` — correct protocol pattern, Claude handles tool failures cleanly
- **Not found** (ID doesn't exist or belongs to another tenant via RLS):
  ```json
  { "code": "NOT_FOUND", "message": "Product not found" }
  ```
- **Invalid input** (bad types, negative limits, malformed IDs):
  ```json
  { "code": "INVALID_INPUT", "message": "limit must be a positive integer", "field": "limit" }
  ```
- **Consistent shape** across all 18 tools — single error handler utility

### Tool registration pattern (LOCKED from Phase 2 integration points)
- Tools registered via `server.tool()` on the `McpServer` returned by `createMcpServer()`
- `createMcpServer()` in `src/mcp/server.ts` will be updated to import and register domain tools
- Tool handlers call `getTenantId()` from `src/context.ts` to get tenant for queries
- All queries go through `withTenantContext(tenantId, ...)` from `src/db/client.ts`
- Drizzle `db` export from `src/db/client.ts` used for all SELECT queries

### Drizzle schema extension (LOCKED)
- `src/db/schema.ts` extended with all 7 ERP tables (currently only has `tenants` and `apiKeys`)
- Tables to add: `products`, `stockLevels`, `suppliers`, `orders`, `orderLineItems`, `invoices`, `contacts`
- Mirror the Phase 1 SQL exactly — no column additions, no migrations
- `stock_levels` JOIN on `products` queries uses Drizzle join helpers

### Logging (inherited from Phase 1+2)
- `process.stderr.write()` only — no `console.log()` in tool handlers

</decisions>

<code_context>
## Existing Code Phase 3 Builds On

### src/mcp/server.ts
- Exports `createMcpServer()` returning `McpServer` instance
- Phase 3 adds `server.tool(name, description, schema, handler)` calls here
- `(server as any).setToolRequestHandlers()` already called — can be removed once first tool is registered via `server.tool()`

### src/db/client.ts
- Exports `sql` (postgres.js pool), `db` (Drizzle instance), `withTenantContext<T>(tenantId, fn)`
- `db` wraps `sql` with Drizzle schema — ERP schema tables need to be added to `src/db/schema.ts`

### src/context.ts
- Exports `getTenantId()` — throws if called outside tenant context
- Tool handlers call this at the top to get `tenantId` for `withTenantContext`

### Database tables (all exist, no migrations needed)
- `products` — id, tenant_id, sku, name, description, price, currency, category, is_active, reorder_point
- `stock_levels` — id, tenant_id, product_id, quantity_on_hand, warehouse_location
- `suppliers` — id, tenant_id, name, email, phone, address, notes
- `orders` — id, tenant_id, contact_id, status, order_date, notes, subtotal, tax_amount, total
- `order_line_items` — id, tenant_id, order_id, product_id, quantity, unit_price, line_total
- `invoices` — id, tenant_id, order_id, contact_id, status, issued_at, due_at, paid_at, subtotal, tax_amount, total, notes
- `contacts` — id, tenant_id, name, email, phone, company, type, tags, notes, last_contact_at

### Existing tests (pre-existing failures to be aware of)
- `tests/db/rls-isolation.test.ts` — fails (Phase 3 tables not yet seeded with test data — fix in Phase 3)
- `tests/db/rls-policy-coverage.test.ts` — fails (checks for policy on Phase 3 tables — will pass once fixed)
- `tests/db/app-role.test.ts` — error code mismatch (42P07 vs 42501) — pre-existing, investigate

### src/index.ts (per-request transport pattern — important for tool handlers)
- Each MCP request creates a fresh `McpServer` + `StreamableHTTPServerTransport` instance
- Tool handlers execute within a single request's async context
- `getTenantId()` works because `extractAndValidateApiKey` sets `tenantStorage` before the handler runs

</code_context>

<specifics>
## New Files This Phase Creates

```
src/db/schema.ts              Extended: add 7 ERP table definitions
src/tools/inventory.ts        7 tools: list_products, get_product, list_stock_levels,
                               get_stock_level, list_low_stock, list_suppliers, get_supplier
src/tools/orders.ts           6 tools: list_orders, get_order, list_invoices,
                               get_invoice, list_overdue_invoices, get_payment_summary
src/tools/crm.ts              5 tools: list_contacts, get_contact, search_contacts,
                               get_contact_orders, get_contact_invoices
src/tools/errors.ts           Shared error helper: toolError(code, message, field?)
src/mcp/server.ts             Updated: register all 18 tools from domain modules

tests/tools/inventory.test.ts  Integration tests for INV-01 through INV-07
tests/tools/orders.test.ts     Integration tests for ORD-01 through ORD-06
tests/tools/crm.test.ts        Integration tests for CRM-01 through CRM-05
```

</specifics>

<deferred>
## Deferred Ideas (MUST NOT appear in Phase 3 plans)

- Write tools (create_product, update_stock_level, etc.) — v2 WRITE-01 through WRITE-07
- Full-text search across all domains — Phase 4 KB tooling covers search patterns
- Aggregation tools beyond get_payment_summary — v2 analytics scope
- Tool result caching / memoization — not needed for v1 scale
- Filtering by date range on list_products / list_contacts — not in v1 requirements
- Supplier-to-product relationship via a separate junction table — current schema uses product.supplier_id if needed, otherwise skip
- Per-tenant YouTrack KB article scoping — global cache, no tenant filter
- KB-08 self-configuration from YouTrack articles — Phase 4, high complexity

</deferred>

---

*Phase: 03-erp-domain-tools*
*Context gathered: 2026-03-16*
