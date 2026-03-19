# Phase 10: Dashboard UX Polish - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the admin dashboard self-explanatory for anyone setting up an MCP client. Add setup instructions with ready-to-use config snippets per tenant, a printable PDF export of setup info, and tooltips on every technical term. This phase does NOT add new MCP tools, change backend APIs, or modify tenant creation flow.

</domain>

<decisions>
## Implementation Decisions

### Setup instructions placement
- New **Setup tab** on TenantDetailPage (5th tab: API Keys, Tool Permissions, ERP Config, Setup, Audit Log)
- Dropdown to select which API key to generate config snippets for; auto-selects if only one key exists
- API key masked by default (pb_a1b2****ef56) with a "Show full key" toggle; copy button always copies full key
- Server URL auto-detected from `window.location` (derives MCP endpoint from dashboard URL)
- No "quick test" curl command — just config snippets and copy buttons

### Config snippet format
- Tabbed code blocks: [Claude Desktop] [Cursor] [Generic] — one visible at a time, each with copy button
- Server name in config JSON uses tenant slug (e.g., "acme-corp" as the mcpServers key)
- Each snippet includes a comment showing where the config file lives on the user's system (e.g., `// ~/Library/Application Support/Claude/claude_desktop_config.json`)
- Generic tab shows bare URL + required header + transport type (not JSON wrapper) — client-agnostic

### PDF export
- Browser print-to-PDF approach — zero new dependencies, render print-styled HTML and trigger `window.print()`
- PDF contains: tenant name & slug, MCP server URL + masked API key, config snippets for all 3 clients, usage examples / getting started tips
- "Export PDF" button in two locations: small icon button in tenant header (always visible) + full button at bottom of Setup tab
- Minimal branding — tenant name as document title, clean professional layout, no logos

### Tooltips
- Hover on info icon (small circle-i icon next to technical terms)
- Custom `<Tooltip>` component built with Tailwind CSS (group/group-hover pattern) — no external library
- Two sentences with context per term (e.g., "API Key: A secret token that lets an MCP client access this tenant's data. Keep it safe — anyone with this key can read and write through the MCP server.")
- Cover all technical terms across all dashboard pages: API key, slug, tool permissions, ERP config fields, plan, status, MCP, audit log entries, etc.

### Claude's Discretion
- Exact tooltip positioning logic (top/bottom/left/right based on viewport)
- Print CSS layout and spacing for the PDF
- Usage example prompts in PDF (pick 3-4 representative MCP tool examples)
- Which terms qualify as "technical" for tooltip coverage — use judgment, err on the side of more tooltips

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Tenant detail page (integration point for Setup tab)
- `dashboard/src/pages/TenantDetailPage.tsx` — Current 4-tab layout (keys, tools, erp, audit); add Setup tab here
- `dashboard/src/api.ts` — API functions for getTenant, key listing; Setup tab reads from these

### Existing copy-to-clipboard pattern
- `dashboard/src/pages/CreateTenantPage.tsx` line 131 — `navigator.clipboard.writeText()` pattern already used

### Dashboard component structure
- `dashboard/src/components/Layout.tsx` — Sidebar/layout wrapper; tooltips may appear in nav items
- `dashboard/src/App.tsx` — Router config; no new routes needed (Setup is a tab, not a page)

### Dashboard dependencies
- `dashboard/package.json` — React 19, Tailwind 4, React Router 7, no component library, no PDF library (keep it that way)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `navigator.clipboard.writeText()` pattern from CreateTenantPage — reuse for copy buttons on Setup tab
- Tab component pattern from TenantDetailPage — extend `Tab` type with 'setup'
- `getTenant` API function returns tenant slug, name, and API keys — all data needed for config snippets
- Inline feedback pattern (spinner -> result) from Phases 8-9 — reuse for copy confirmation ("Copied!")

### Established Patterns
- Dashboard uses React + Tailwind CSS, no component library
- Forms and state managed with useState hooks
- Pages are self-contained with section functions (e.g., KeysTab, ErpTab) inside the page file
- API functions follow `api<T>(path, opts)` pattern in api.ts

### Integration Points
- `TenantDetailPage.tsx` Tab type — add 'setup' to union type, add SetupTab section function
- `TenantDetailPage.tsx` tabs array — add { key: 'setup', label: 'Setup' } entry
- New `<Tooltip>` component in `dashboard/src/components/` — used across all pages
- Print-styled route or hidden component for PDF generation via window.print()

</code_context>

<specifics>
## Specific Ideas

- Config snippets should feel like documentation — clear file path comment, properly formatted JSON, obvious copy button
- Tooltip content should be written for someone who has never used MCP before — assume zero familiarity
- PDF should be something an admin can email to a developer and they can set up without any other instructions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-dashboard-ux-polish*
*Context gathered: 2026-03-19*
