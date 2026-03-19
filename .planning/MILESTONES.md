# Milestones

## v1.0 Core MCP Server (Shipped: 2026-03-17)

4 phases, 16 plans, 39/40 requirements. Read-only MCP server with 21 tools, PostgreSQL RLS tenant isolation, API key auth, YouTrack KB sync.

---

## v2.0 Admin Dashboard + Write Operations (Shipped: 2026-03-18)

3 phases, 7 plans, 26/26 requirements. Tool access control, audit logging, JWT dashboard auth, API key expiry, React admin dashboard, API doc upload, 6 MCP write tools.

---

## v2.1 UI Polish + Setup Documentation (Shipped: 2026-03-19)

**Phases completed:** 4 phases, 8 plans, 16/16 requirements
**Source changes:** 26 files changed, 2,693 insertions, 410 deletions
**Codebase:** 10,228 LOC TypeScript

**Key accomplishments:**

1. Server-level KB management — YouTrack config, manual sync, and doc upload from dashboard (Phase 8)
2. 3-step tenant creation wizard with ERP credential testing gate (Phase 9)
3. Setup tab with MCP client config snippets for Claude Desktop, Cursor, and generic clients with copy buttons (Phase 10)
4. 32 tooltips across all dashboard pages explaining every technical term (Phase 10)
5. Browser print-to-PDF export for tenant setup instructions (Phase 10)
6. Production Dockerfile, docker-compose.prod.yml, and deployment guides for Linux, Docker, and Windows (Phase 11)
7. README with project overview, quickstart, and MCP client configuration (Phase 11)

---
