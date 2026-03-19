# Requirements: PB MCP

**Defined:** 2026-03-19
**Core Value:** Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

## v2.1 Requirements

Requirements for v2.1 release. Each maps to roadmap phases.

### KB/Docs Management

- [ ] **KB-01**: Admin can upload API docs at server level (not per-tenant)
- [ ] **KB-02**: Admin can trigger manual YouTrack sync from dashboard via sync button
- [ ] **KB-03**: Dashboard shows last sync timestamp and status

### Tenant Onboarding

- [ ] **ONBOARD-01**: Tenant creation flow prompts for ERP credentials first
- [ ] **ONBOARD-02**: ERP connection is tested before proceeding to API key generation
- [ ] **ONBOARD-03**: API key is only generated after successful ERP connection test

### Dashboard UX

- [ ] **UX-01**: Dashboard shows MCP client setup instructions (URL, API key, where to add them)
- [ ] **UX-02**: Setup instructions cover Claude Desktop, Cursor, and generic MCP client
- [ ] **UX-03**: Admin can export per-tenant branded PDF with setup + usage instructions (tenant name, MCP URL, masked API key)
- [ ] **UX-04**: Tooltips added for all technical terms (API key, slug, tool permissions, ERP config, etc.)

### Documentation

- [ ] **DOCS-01**: README overhauled with clear project overview and quickstart
- [ ] **DOCS-02**: Step-by-step setup guide for Linux/VPS (Ubuntu/Debian + Node.js + PostgreSQL)
- [ ] **DOCS-03**: Step-by-step setup guide for Docker (Dockerfile + docker-compose)
- [ ] **DOCS-04**: Step-by-step setup guide for Windows Server

## Future Requirements

None — v2.1 is a polish/documentation milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New MCP tools | No new tools in v2.1 — this is UX/docs only |
| Database schema changes | No data model changes needed |
| Multi-language docs | English only for now |
| Video tutorials | Written guides sufficient for v2.1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| KB-01 | TBD | Pending |
| KB-02 | TBD | Pending |
| KB-03 | TBD | Pending |
| ONBOARD-01 | TBD | Pending |
| ONBOARD-02 | TBD | Pending |
| ONBOARD-03 | TBD | Pending |
| UX-01 | TBD | Pending |
| UX-02 | TBD | Pending |
| UX-03 | TBD | Pending |
| UX-04 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |
| DOCS-04 | TBD | Pending |

**Coverage:**
- v2.1 requirements: 14 total
- Mapped to phases: 0
- Unmapped: 14

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after initial definition*
