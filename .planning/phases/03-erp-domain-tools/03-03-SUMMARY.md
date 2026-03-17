---
phase: 03-erp-domain-tools
plan: 03
status: complete
completed_at: 2026-03-17
subsystem: tools, integration-tests
tags: [orders, crm, mcp-tools, rls, pagination, integration-tests]
dependency_graph:
  requires: [03-01 (schema extension + test stubs), 03-02 (inventory tools + errors.ts)]
  provides: [src/tools/orders.ts with 6 tools, src/tools/crm.ts with 5 tools, tests/tools/orders.test.ts green, tests/tools/crm.test.ts green]
  affects: [src/mcp/server.ts (Wave 4 will import registerOrdersTools + registerCrmTools here)]
tech_stack:
  added: []
  patterns: [two-query get_order (order+contact JOIN then line_items JOIN), ILIKE parameterized search via postgres.js template literal, contact-existence-check before related queries]
key_files:
  created:
    - src/tools/orders.ts
    - src/tools/crm.ts
  modified:
    - tests/tools/orders.test.ts
    - tests/tools/crm.test.ts
decisions:
  - "list_overdue_invoices uses: status = 'overdue' OR (due_at < CURRENT_DATE AND status NOT IN ('paid','cancelled')) — matches spec exactly"
  - "get_order executes two queries inside a single withTenantContext transaction — order+contact LEFT JOIN, then order_line_items+products JOIN"
  - "search_contacts uses postgres.js tagged template literal interpolation for ILIKE — pattern variable is a parameterized bind, not string concatenation"
  - "get_contact_orders and get_contact_invoices check contact existence first (SELECT id FROM contacts WHERE id = ...) — returns NOT_FOUND if missing or cross-tenant"
  - "Invoice status constraint allows: draft, sent, paid, overdue, cancelled — plan template used invalid 'unpaid'; fixed to 'sent' for past-due-but-not-paid test scenario"
  - "Test transport pattern: per-request fresh McpServer + StreamableHTTPServerTransport with enableJsonResponse: true (same as inventory.test.ts)"
metrics:
  duration: ~15 minutes
  completed_date: 2026-03-17
  tasks_completed: 2
  files_modified: 4
---

# Phase 3 Plan 03: Orders & CRM Tools and Tests — Summary

Created all 6 orders/billing MCP tools (src/tools/orders.ts) and all 5 CRM tools (src/tools/crm.ts), then implemented green integration tests for both domains.

## Files Created / Modified

| File | Action | Description |
|---|---|---|
| `src/tools/orders.ts` | Created | `registerOrdersTools(server: McpServer)` — registers 6 orders/billing tools |
| `src/tools/crm.ts` | Created | `registerCrmTools(server: McpServer)` — registers 5 CRM tools |
| `tests/tools/orders.test.ts` | Modified (replaced stubs) | 15 green integration tests, replaces all it.todo() stubs |
| `tests/tools/crm.test.ts` | Modified (replaced stubs) | 14 green integration tests, replaces all it.todo() stubs |

## Tools Registered (11)

### Orders / Billing (6)

| Tool | ORD # | Description |
|---|---|---|
| `list_orders` | ORD-01 | Paginated order list with optional status filter |
| `get_order` | ORD-02 | Single order with line_items array + inline contact (or null) |
| `list_invoices` | ORD-03 | Paginated invoice list with optional status filter |
| `get_invoice` | ORD-04 | Single invoice by UUID — returns NOT_FOUND for unknown/cross-tenant IDs |
| `list_overdue_invoices` | ORD-05 | Invoices where status='overdue' OR (due_at < CURRENT_DATE AND status NOT IN ('paid','cancelled')) |
| `get_payment_summary` | ORD-06 | Tenant-level aggregate: total_invoiced, total_paid, outstanding_balance, overdue_count |

### CRM / Contacts (5)

| Tool | CRM # | Description |
|---|---|---|
| `list_contacts` | CRM-01 | Paginated contact list with optional type filter |
| `get_contact` | CRM-02 | Single contact by UUID — returns NOT_FOUND for unknown/cross-tenant IDs |
| `search_contacts` | CRM-03 | ILIKE search across name, email, and company fields |
| `get_contact_orders` | CRM-04 | Order summary rows { id, order_date, status, total } for a contact — NOT_FOUND if contact missing |
| `get_contact_invoices` | CRM-05 | Invoice summary rows + outstanding_balance for a contact — NOT_FOUND if contact missing |

All 11 tools:
- Call `getTenantId()` at the top of each handler
- Execute queries inside `withTenantContext(tenantId, async (tx) => { const txSql = tx as unknown as postgres.Sql ... })`
- Use `process.stderr.write()` for error logging — no console.log/console.error
- Return `toolError(...)` on failure (never throw from a handler)

## Test Results

```
tests/tools/orders.test.ts:
  Test Files: 1 passed (1)
       Tests: 15 passed (15)
    Duration: ~0.8s

tests/tools/crm.test.ts:
  Test Files: 1 passed (1)
       Tests: 14 passed (14)
    Duration: ~0.9s
```

Combined: 29 tests across 11 describe blocks (ORD-01 through ORD-06, CRM-01 through CRM-05). No it.todo() stubs remaining.

## Full Suite Status

```
Test Files: 2 failed | 10 passed (12)
     Tests: 4 failed | 90 passed (94)
```

The 4 failing tests are pre-existing failures documented in 03-02-SUMMARY.md:
- `tests/db/rls-isolation.test.ts` (3 failures) — ERP tables need test data configured separately; pre-existing
- `tests/db/app-role.test.ts` (1 failure) — error code mismatch 42P07 vs 42501; pre-existing

## SQL Patterns Worth Noting for Wave 4

### 1. Two-query get_order inside a single withTenantContext

Both queries run in the same transaction — contact data is consistent with the order row:

```typescript
// Query 1: order fields + LEFT JOIN contacts
const orderRows = await txSql`
  SELECT o.*, c.id AS contact__id, c.name AS contact__name, ...
  FROM orders o
  LEFT JOIN contacts c ON c.id = o.contact_id
  WHERE o.id = ${id}
`;
// Query 2: line items + JOIN products
const lineItems = await txSql`
  SELECT li.id, p.name AS product_name, p.sku AS product_sku, li.quantity, ...
  FROM order_line_items li
  JOIN products p ON p.id = li.product_id
  WHERE li.order_id = ${id}
`;
return { ...order, line_items: lineItems };
```

The inline contact object is reconstructed from flat JOIN columns with a `contact__` prefix to avoid column name collisions.

### 2. Parameterized ILIKE in search_contacts

```typescript
const pattern = `%${query}%`;
await txSql`
  SELECT ... FROM contacts
  WHERE name ILIKE ${pattern}
     OR email ILIKE ${pattern}
     OR company ILIKE ${pattern}
`;
```

The template literal interpolation creates a parameterized bind — the `%query%` pattern is sent as a bind parameter, not concatenated into SQL text. Safe from SQL injection by construction.

### 3. Contact-existence-check pattern for relationship tools

```typescript
const contactRows = await txSql`SELECT id FROM contacts WHERE id = ${contact_id}`;
if (contactRows.length === 0) return null;
// ... then fetch orders/invoices
```

RLS automatically scopes `contacts` to the authenticated tenant, so a cross-tenant contact ID returns zero rows, which correctly maps to `toolError('NOT_FOUND', 'Contact not found')`.

### 4. Invoice status constraint

The `invoices` table only allows: `'draft', 'sent', 'paid', 'overdue', 'cancelled'`. The string `'unpaid'` is not a valid status. When testing for overdue/unpaid scenarios, use `'sent'` (an invoice that has been issued but not yet paid).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed invalid invoice status 'unpaid' in test seed data**

- **Found during:** Task 2, first test run
- **Issue:** The plan's test template seeded invoices with `status='unpaid'`, but the `invoices` table has a check constraint: `CHECK (status IN ('draft','sent','paid','overdue','cancelled'))`. The INSERT failed with: `new row for relation "invoices" violates check constraint "invoices_status_check"`.
- **Fix:** Changed seed data to use `status='sent'` (an issued invoice not yet paid — correctly triggers the overdue filter: `due_at < CURRENT_DATE AND status NOT IN ('paid','cancelled')`). Updated the corresponding assertion from `toBe('unpaid')` to `toBe('sent')`.
- **Files modified:** `tests/tools/orders.test.ts`, `tests/tools/crm.test.ts`

**2. [Rule 1 - Bug] Applied correct transport pattern (enableJsonResponse: true) — same as Wave 2**

- **Found during:** Task 2 implementation (pre-empted based on Wave 2 discovery)
- **Issue:** The plan's test template used the WRONG transport pattern — a shared `McpServer` + `StreamableHTTPServerTransport` created outside the route handler. Per Wave 2 documentation, this causes SSE format responses and transport state corruption.
- **Fix:** Used the correct per-request stateless pattern (matching `tests/tools/inventory.test.ts`): fresh `McpServer` + transport with `enableJsonResponse: true` created inside the `/mcp` route handler.
- **Files modified:** `tests/tools/orders.test.ts`, `tests/tools/crm.test.ts`
- **Note:** This was pre-emptively applied before running tests, based on the locked decision from Wave 2.

## TypeScript Compilation

`npx tsc --noEmit` exits 0 — no TypeScript errors.
