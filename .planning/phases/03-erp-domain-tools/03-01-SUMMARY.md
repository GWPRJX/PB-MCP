---
phase: 03-erp-domain-tools
plan: 01
status: complete
completed_at: 2026-03-17
subsystem: db-schema, test-stubs
tags: [schema, drizzle, erp, inventory, orders, crm, test-stubs]
dependency_graph:
  requires: []
  provides: [src/db/schema.ts ERP tables, tests/tools/ stub files]
  affects: [src/db/client.ts (schema wildcard import picks up new tables automatically)]
tech_stack:
  added: [drizzle-orm/pg-core numeric, integer, boolean, date column types]
  patterns: [append-only financial records (no updatedAt on order_line_items), nullable FK with SET NULL, date() vs timestamp() for date-only columns]
key_files:
  created:
    - tests/tools/inventory.test.ts
    - tests/tools/orders.test.ts
    - tests/tools/crm.test.ts
  modified:
    - src/db/schema.ts
decisions:
  - "order_line_items has no updatedAt — append-only financial record constraint preserved"
  - "contacts.tags uses .array() matching text[] DEFAULT '{}' in SQL"
  - "orders.contactId, invoices.orderId, invoices.contactId are nullable with SET NULL on delete"
  - "orders.orderDate, invoices.issuedAt, invoices.dueAt use date() not timestamp()"
  - "invoices.paidAt is nullable timestamp (TIMESTAMPTZ — exact payment time matters)"
metrics:
  duration: ~5 minutes
  completed_date: 2026-03-17
  tasks_completed: 2
  files_modified: 4
---

# Phase 3 Plan 01: ERP Schema Extension and Test Stubs — Summary

Extended src/db/schema.ts with 7 Drizzle table definitions mirroring Phase 1 SQL exactly, and created 3 test stub files with 52 it.todo() entries covering all 18 ERP tools.

## Schema Changes

### Tables Added (7 new, 2 existing preserved)

| Table | Key Constraints |
|---|---|
| `products` | tenant FK cascade, sku+name notNull, numeric(12,2) price, boolean isActive, integer reorderPoint |
| `stockLevels` | tenant FK cascade, product FK cascade, integer quantityOnHand |
| `suppliers` | tenant FK cascade, name notNull |
| `contacts` | tenant FK cascade, tags text[].array() notNull default [], nullable lastContactAt timestamp |
| `orders` | tenant FK cascade, contactId nullable (SET NULL), date() orderDate, numeric subtotal/taxAmount/total |
| `orderLineItems` | tenant FK cascade, order FK cascade, product FK RESTRICT, NO updatedAt column |
| `invoices` | tenant FK cascade, orderId nullable (SET NULL), contactId nullable (SET NULL), date() issuedAt/dueAt, nullable paidAt timestamp |

### Critical Constraints Preserved

- `order_line_items` has NO `updatedAt` — append-only financial records
- `contacts.tags` uses `.array()` — matches `text[] DEFAULT '{}'` in SQL
- `orders.orderDate`, `invoices.issuedAt`, `invoices.dueAt` use `date()` not `timestamp()`
- `invoices.paidAt` is nullable `timestamp()` with timezone (paid time matters)
- `orders.contactId`, `invoices.orderId`, `invoices.contactId` are nullable with `{ onDelete: 'set null' }`
- `orderLineItems.productId` uses `{ onDelete: 'restrict' }` — cannot delete product with line items

### Export Count

`grep -c "export const" src/db/schema.ts` = 9 (tenants + apiKeys + 7 ERP tables)

## TypeScript Compilation

`npx tsc --noEmit` exits 0 — no TypeScript errors.

## Test Suite Results

### New stub files (tests/tools/)

`npx vitest run tests/tools/` — EXIT 0

- `tests/tools/inventory.test.ts` — 18 it.todo() stubs for INV-01 through INV-07
- `tests/tools/orders.test.ts` — 17 it.todo() stubs for ORD-01 through ORD-06
- `tests/tools/crm.test.ts` — 17 it.todo() stubs for CRM-01 through CRM-05
- Total: 52 todo stubs — all counted as passing by vitest

### Full suite

`npx vitest run` exits 1 due to 3 pre-existing failures in tests/db/ — these failures existed before this plan and are documented in 03-CONTEXT.md:

1. `tests/db/rls-isolation.test.ts` — "relation 'products' does not exist" — Phase 3 tables not seeded in test DB yet (expected — fix in Phase 3 later plans)
2. `tests/db/rls-policy-coverage.test.ts` — 7 ERP tables have no RLS policies yet — expected, policies applied in later Phase 3 work
3. `tests/db/app-role.test.ts` — error code mismatch 42P07 vs 42501 — pre-existing, unrelated to this plan

None of these failures were introduced by this plan's changes.

## Deviations from Plan

None. Plan executed exactly as written.

The schema code was copied verbatim from the plan's action section. All 3 test stub files were created with the exact content specified. TypeScript compiles clean and the new stub files exit 0.
