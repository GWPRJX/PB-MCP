# Phase 9: Tenant Onboarding Flow - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Restructure tenant creation into a credentials-first, connection-tested flow. Admin enters ERP credentials and verifies they work before a tenant record and API key are generated. This phase does NOT add new MCP tools, change tool permissions, or modify the tenant detail page — it only redesigns the CreateTenantPage into a guided wizard.

</domain>

<decisions>
## Implementation Decisions

### Flow structure
- Multi-step wizard with 3 steps: Tenant Info → ERP Credentials → API Key
- Labeled stepper progress indicator showing step names (not just numbers)
- Back button on steps 2 and 3 — user can return to edit previous steps without losing data
- Forward navigation gated: Step 2 → 3 requires passing connection test

### ERP credential fields
- All 6 fields required in step 2: Base URL, Client ID, App Secret, Username, Password, Terminal
- Same field layout, labels, placeholders, and order as the existing ErpTab on TenantDetailPage
- All fields must be filled before the Test Connection button activates

### Connection test behavior
- Test Connection button in step 2, inline with the ERP fields
- Strictly required — no way to skip or bypass the connection test
- On failure: inline error with guided hints based on error type (wrong URL format, auth failure, timeout, etc.)
- On success: green checkmark + "Connection verified!" message, Next button enables
- Test result resets if user edits any ERP field after passing — must re-test

### Post-creation experience
- Step 3 shows: success message, API key with copy button, "save now" warning
- Two buttons: "View Tenant" (navigates to tenant detail) and "Create Another" (resets wizard)
- No MCP setup instructions here — that's Phase 10 (UX-01/UX-02)

### Claude's Discretion
- Backend approach: whether to test credentials before creating the tenant record (new endpoint) or create then gate the key
- Exact error hint messages for different failure types
- Stepper visual styling (colors, active/completed states)
- Whether to extract shared ERP field definitions for reuse between wizard and ErpTab

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Tenant creation (current implementation)
- `dashboard/src/pages/CreateTenantPage.tsx` — Current single-form tenant creation UI (to be replaced)
- `src/admin/router.ts` lines 28-67 — POST /admin/tenants endpoint (creates tenant + initial API key)
- `src/admin/tenant-service.ts` — createTenant function, accepts erpConfig parameter

### ERP configuration (reuse patterns)
- `dashboard/src/pages/TenantDetailPage.tsx` lines 456-540 — ErpTab component with 6 ERP fields + test connection
- `dashboard/src/api.ts` lines 175-187 — updateErpConfig and testConnection API functions
- `src/admin/router.ts` lines 548-595 — PUT /admin/tenants/:id/erp-config and POST /admin/tenants/:id/test-connection endpoints

### Connection testing
- `src/admin/connection-tester.ts` — testErpConnection function (tests POSibolt OAuth auth)

### API layer
- `dashboard/src/api.ts` — All admin API functions (createTenant, testConnection, etc.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- ErpTab field definitions (labels, placeholders, types) — can be extracted for shared use between wizard and detail page
- `testConnection` API function — already calls POST /admin/tenants/:id/test-connection
- `createTenant` API function — already calls POST /admin/tenants with name, slug, plan
- Inline feedback pattern from Phase 8 KnowledgeBasePage (spinner → result message)

### Established Patterns
- Dashboard pages use React Router v7, Tailwind CSS for styling
- API functions follow `api<T>(path, opts)` pattern in api.ts
- Form state managed with useState hooks (no form library)
- Admin routes use JWT auth hook (`jwtAuthHook`)

### Integration Points
- `dashboard/src/App.tsx` — Route for CreateTenantPage (needs wizard replacement)
- `src/admin/router.ts` — May need new endpoint for testing credentials before tenant exists
- `src/admin/tenant-service.ts` — createTenant may need to accept ERP config in single transaction

</code_context>

<specifics>
## Specific Ideas

- Wizard should feel like a natural onboarding flow — each step is clear and purposeful
- Connection test feedback should be helpful, not just "failed" — guide the user to fix the issue
- The labeled stepper gives users confidence about where they are and what's next

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-tenant-onboarding*
*Context gathered: 2026-03-19*
