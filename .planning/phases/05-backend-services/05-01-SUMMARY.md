---
phase: 05-backend-services
plan: 01
subsystem: tool-access-control-audit
tags: [rls, audit, ci, tool-wiring]
dependency_graph:
  requires: []
  provides: [audit-logging-wired, rls-coverage-10-tables, ci-env-vars]
  affects: [05-02, 05-03]
tech_stack:
  added: []
  patterns: [withAudit-HOF, fire-and-forget-audit, generic-handler-wrapper]
key_files:
  created: []
  modified:
    - scripts/check-rls.sql
    - tests/db/rls-policy-coverage.test.ts
    - .github/workflows/ci.yml
    - src/tools/errors.ts
    - src/tools/inventory.ts
    - src/tools/orders.ts
    - src/tools/crm.ts
    - src/tools/kb.ts
decisions:
  - Used generic type parameter for withAudit to preserve MCP SDK handler type compatibility
  - Audit params captured from first argument (args[0]) to log full params before destructuring
metrics:
  duration: 5m
  completed: "2026-03-18T09:51:00Z"
  tasks: 2/2
  files_modified: 8
requirements_completed: [TAC-01, TAC-02, TAC-03, TAC-04, TAC-05]
---

# Phase 5 Plan 1: CI RLS Updates + Audit Wiring Summary

Generic withAudit higher-order function wrapping all 21 MCP tool handlers with fire-and-forget audit logging via recordToolCall, plus RLS CI coverage expanded to 10 tenant-bearing tables.

## Task Results

### Task 1: Update CI RLS checks
**Commit:** `49c3be3`

- Added `tool_permissions` and `audit_log` to RLS whitelist in `scripts/check-rls.sql` (8 to 10 tables)
- Added both tables to `TENANT_BEARING_TABLES` array in `tests/db/rls-policy-coverage.test.ts` (8 to 10)
- Updated test descriptions from "all 8" to "all 10"
- Added `ADMIN_SECRET: test-secret` and `JWT_SECRET: test-jwt-secret-ci` to CI env block

### Task 2: Create withAudit wrapper and wire into all tool handlers
**Commit:** `1493d04`

- Created `withAudit<T>` generic higher-order function in `src/tools/errors.ts`
  - Preserves original handler type signature via generic constraint
  - Extracts tenantId/keyId from AsyncLocalStorage context
  - Calls `recordToolCall()` fire-and-forget (errors logged to stderr, never thrown)
  - Silently skips audit when called outside tenant context
- Wrapped all 21 tool handlers across 4 files:
  - `inventory.ts`: 7 tools (list_products, get_product, list_stock_levels, get_stock_level, list_low_stock, list_suppliers, get_supplier)
  - `orders.ts`: 6 tools (list_orders, get_order, list_invoices, get_invoice, list_overdue_invoices, get_payment_summary)
  - `crm.ts`: 5 tools (list_contacts, get_contact, search_contacts, get_contact_orders, get_contact_invoices)
  - `kb.ts`: 3 tools (search_kb, get_kb_article, get_kb_sync_status)

## Verification Results

- TypeScript compilation: PASSED (zero errors)
- withAudit grep count: 21 tool wrappings confirmed
- RLS whitelist: tool_permissions and audit_log present in check-rls.sql
- RLS test array: tool_permissions and audit_log present in test file

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ToolHandler type incompatibility with MCP SDK**
- **Found during:** Task 2
- **Issue:** The plan specified a concrete `ToolHandler` type with `{ type: string; text: string }` but the MCP SDK expects literal `{ type: 'text' }`. This caused TypeScript errors across all tool files.
- **Fix:** Changed `withAudit` to use a generic type parameter `<T extends (...args: any[]) => Promise<any>>` that preserves the original handler's exact type signature, satisfying the SDK's overload resolution.
- **Files modified:** `src/tools/errors.ts`
- **Commit:** `1493d04`

## Decisions Made

1. **Generic type parameter for withAudit** - Used `<T extends (...args: any[]) => Promise<any>>` instead of a concrete ToolHandler type. This preserves the original handler's literal types (e.g., `type: 'text'`) so the MCP SDK's overloaded `server.tool()` can resolve correctly.

2. **Params capture strategy** - The wrapper captures `args[0]` (the full params object before destructuring) for audit logging, ensuring all parameters are recorded even when handlers use destructured signatures with defaults.

## Self-Check: PASSED

- All 8 modified files exist on disk
- Commit `49c3be3` (Task 1) verified in git log
- Commit `1493d04` (Task 2) verified in git log
- TypeScript compiles with zero errors
- 21 withAudit wrappings confirmed via grep
