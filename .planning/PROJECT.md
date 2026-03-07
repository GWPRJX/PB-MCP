# PB MCP

## What This Is

A multi-tenant ERP MCP server that lets small businesses connect AI tools (Claude Desktop, Cursor, etc.) to manage their inventory, orders, and customer relationships through natural language. Each business (tenant) gets isolated data in PostgreSQL, provisioned and managed via an admin API/UI. The server also syncs with a YouTrack knowledge base to expose live API documentation and self-configure based on documented endpoints.

## Core Value

Small business owners and their AI assistants can manage real ERP operations — checking stock, creating invoices, looking up customers — without writing code, while developers can add new tenants and go live in under 10 minutes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-tenant MCP server with per-tenant data isolation (PostgreSQL)
- [ ] Admin API/UI to provision and manage tenant organizations
- [ ] MCP tools for Inventory & Products (read/write)
- [ ] MCP tools for Orders & Billing (read/write)
- [ ] MCP tools for CRM / Contacts (read/write)
- [ ] AI clients authenticate per-tenant (auth model TBD via research)
- [ ] YouTrack KB sync — pulls API docs (own + third-party) on refresh
- [ ] AI clients can query live YouTrack KB content ("How does the invoice API work?")
- [ ] Server self-configures tool definitions from YouTrack KB articles
- [ ] Developer onboarding: clone → add tenant → running MCP server in <10 min

### Out of Scope

- HR / Payroll — deferred to future milestone
- Mobile app — web-first, mobile later
- Real-time collaborative editing — complexity not justified for v1

## Context

- Stack is research-driven: TypeScript/Node.js or Python, to be determined
- Auth model for MCP clients is research-driven (API key per tenant vs OAuth/JWT)
- YouTrack is the company's central API documentation hub — both internal ERP APIs and third-party integration APIs are documented there as knowledge base articles
- YouTrack sync must support both pull-on-demand and periodic refresh
- PostgreSQL tenant isolation strategy (per-schema vs row-level security) TBD via research

## Constraints

- **Platform**: MCP (Model Context Protocol) — must be compatible with Claude Desktop, Cursor, and other MCP clients
- **Database**: PostgreSQL — chosen for tenant isolation capabilities
- **Source of truth**: YouTrack KB articles drive API doc exposure and tool self-configuration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| PostgreSQL over SQLite | Multi-tenant isolation, scalability | — Pending |
| Admin API/UI for tenant management | Self-service onboarding beats config files | — Pending |
| YouTrack as API doc source | Existing KB already documents all APIs | — Pending |
| Research-driven stack/auth | No hard preference — pick best fit | — Pending |

---
*Last updated: 2026-03-07 after initialization*
