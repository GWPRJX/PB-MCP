# Phase 3: ERP Domain Tools — Validation Criteria

**Phase:** 03-erp-domain-tools
**Created:** 2026-03-16
**Status:** Pre-execution (plans ready)

---

## Goal-Backward Verification

**Goal:** An AI client authenticated as a tenant can query inventory, orders, billing, and contacts through 18 MCP tools, with all results scoped to the authenticated tenant.

### Observable Truths (must be TRUE when phase is complete)

1. `tools/list` returns exactly 18 tools — INV-01 through INV-07, ORD-01 through ORD-06, CRM-01 through CRM-05
2. `list_products` returns paginated product rows including `qty_on_hand` from the stock_levels JOIN
3. `list_low_stock` returns only products where `quantity_on_hand < reorder_point`
4. `get_order` returns the full order with all line items (product name, SKU, qty, unit_price, line_total) and linked contact (name, email, phone)
5. `list_overdue_invoices` returns only invoices with `status = 'overdue'` or (`due_at < today` AND `status NOT IN ('paid','cancelled')`)
6. `get_payment_summary` returns `{ total_invoiced, total_paid, outstanding_balance, overdue_count }` for the tenant
7. `search_contacts` performs case-insensitive ILIKE search across name, email, and company
8. `get_contact_invoices` returns summary rows plus a computed `outstanding_balance`
9. All 18 tools enforce RLS — a query with Tenant A's key never returns Tenant B's data
10. All list tools return `{ items, total_count, next_cursor }` — `next_cursor` is null when all results fit one page
11. All tools return `{ isError: true, content: [{ type: 'text', text: '{"code":"...","message":"..."}' }] }` on error — no thrown exceptions
12. `npx vitest run` exits 0 — all tests in tests/tools/ pass
13. `npx tsc --noEmit` exits 0 — no TypeScript errors

---

## Required Artifacts

| File | Purpose | Required By |
|------|---------|-------------|
| `src/db/schema.ts` | Extended with 7 ERP table definitions | All tool files — import table shapes |
| `src/tools/errors.ts` | `toolError()` + `toolSuccess()` helpers | All tool files |
| `src/tools/inventory.ts` | `registerInventoryTools(server)` — 7 tools | INV-01 through INV-07 |
| `src/tools/orders.ts` | `registerOrdersTools(server)` — 6 tools | ORD-01 through ORD-06 |
| `src/tools/crm.ts` | `registerCrmTools(server)` — 5 tools | CRM-01 through CRM-05 |
| `src/mcp/server.ts` | Updated — registers all 18 tools, removes hack | Wave 4 wiring |
| `tests/tools/inventory.test.ts` | Integration tests for 7 inventory tools | INV-01 through INV-07 |
| `tests/tools/orders.test.ts` | Integration tests for 6 orders tools | ORD-01 through ORD-06 |
| `tests/tools/crm.test.ts` | Integration tests for 5 CRM tools | CRM-01 through CRM-05 |

---

## Key Links (critical wiring)

| From | To | Via | Break symptom |
|------|----|-----|---------------|
| `src/mcp/server.ts` | `src/tools/inventory.ts` | `registerInventoryTools(server)` | tools/list missing INV tools |
| `src/mcp/server.ts` | `src/tools/orders.ts` | `registerOrdersTools(server)` | tools/list missing ORD tools |
| `src/mcp/server.ts` | `src/tools/crm.ts` | `registerCrmTools(server)` | tools/list missing CRM tools |
| Tool handlers | `getTenantId()` | `import { getTenantId } from '../context.js'` | RLS not applied — data leaks |
| Tool handlers | `withTenantContext()` | `import { withTenantContext } from '../db/client.js'` | Queries run without tenant SET LOCAL |
| `withTenantContext` callback | raw `txSql` tagged template | `tx as unknown as postgres.Sql` | SQL runs outside tenant transaction |

---

## Requirement Coverage

| Requirement | Tool | Plan |
|-------------|------|------|
| INV-01 | `list_products` | 03-02 |
| INV-02 | `get_product` | 03-02 |
| INV-03 | `list_stock_levels` | 03-02 |
| INV-04 | `get_stock_level` | 03-02 |
| INV-05 | `list_low_stock` | 03-02 |
| INV-06 | `list_suppliers` | 03-02 |
| INV-07 | `get_supplier` | 03-02 |
| ORD-01 | `list_orders` | 03-03 |
| ORD-02 | `get_order` | 03-03 |
| ORD-03 | `list_invoices` | 03-03 |
| ORD-04 | `get_invoice` | 03-03 |
| ORD-05 | `list_overdue_invoices` | 03-03 |
| ORD-06 | `get_payment_summary` | 03-03 |
| CRM-01 | `list_contacts` | 03-03 |
| CRM-02 | `get_contact` | 03-03 |
| CRM-03 | `search_contacts` | 03-03 |
| CRM-04 | `get_contact_orders` | 03-03 |
| CRM-05 | `get_contact_invoices` | 03-03 |

---

## Automated Verification Commands

Run after all plans complete and human checkpoint approved:

```bash
# 1. Full test suite — must exit 0
npx vitest run 2>&1 | tail -20

# 2. TypeScript check — no errors
npx tsc --noEmit 2>&1 | head -10

# 3. No console.log/console.error in tool files
grep -rn "console\.log\|console\.error" src/tools/ 2>/dev/null && echo "FAIL: stdout writes found" || echo "OK: no stdout writes"

# 4. All 18 tools registered
grep -c "server\.tool(" src/tools/inventory.ts src/tools/orders.ts src/tools/crm.ts | tail -1

# 5. setToolRequestHandlers hack removed
grep -q "setToolRequestHandlers" src/mcp/server.ts && echo "FAIL: hack still present" || echo "OK: hack removed"
```

---

*Phase: 03-erp-domain-tools*
*Validation created: 2026-03-16*
