# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.1 — UI Polish + Setup Documentation

**Shipped:** 2026-03-19
**Phases:** 4 | **Plans:** 8 | **Requirements:** 16/16

### What Was Built
- Server-level KB management with YouTrack config, manual sync, and doc upload from dashboard
- 3-step tenant creation wizard with ERP credential testing gate
- Setup tab with MCP config snippets (Claude Desktop, Cursor, Generic) and copy buttons
- 32 tooltips across all 4 dashboard pages for every technical term
- Browser print-to-PDF export for tenant setup instructions
- Production Dockerfile + docker-compose.prod.yml
- README with quickstart and deployment guides for Linux, Docker, and Windows

### What Worked
- Pure documentation phases (11) executed cleanly with research — researcher identified stale migration count and tsx devDependency gap before planning
- CONTEXT.md from discuss-phase gave planners concrete decisions (e.g., "Tailwind group-hover, no library" for tooltips) — zero ambiguity in execution
- Single-wave parallel plans (11-01, 11-02) for independent deliverables reduced wall time
- Tooltip component built in Wave 1 (Plan 10-01) then consumed across all pages in Wave 2 (Plan 10-02) — clean dependency chain

### What Was Inefficient
- Phases 10 and 11 could have been a single phase — the boundary between "dashboard UX" and "documentation" was artificial since both are polish work
- API key masking in Setup tab hit a data model constraint (keys are hashed) — planner adapted with YOUR_API_KEY placeholder, but this could have been caught in discuss-phase

### Patterns Established
- Platform guides as companions to SETUP.md (not duplicates) — prevents content drift
- Browser print-to-PDF via window.print() + @media print CSS — zero-dependency approach for simple PDF needs
- Tooltip component pattern: group-hover with pointer-events-none on tooltip box

### Key Lessons
1. Research pays off even for documentation phases — the tsx devDependency gap and migration count error would have caused Docker guide failures
2. When API keys are hashed, any feature assuming access to raw keys needs early flagging in discuss-phase

### Cost Observations
- Model mix: opus for planning, sonnet for research/execution/verification
- v2.1 completed in a single day (4 phases, 8 plans)
- Documentation phases are lighter on tokens than code phases — fewer files to read, simpler acceptance criteria

---

## Cross-Milestone Trends

| Metric | v1.0 | v2.0 | v2.1 |
|--------|------|------|------|
| Phases | 4 | 3 | 4 |
| Plans | 16 | 7 | 8 |
| Requirements | 39/40 | 26/26 | 16/16 |
| Timeline | 10 days | 1 day | 1 day |

**Observations:**
- Milestone velocity has increased significantly — v2.0 and v2.1 each completed in a single day
- Requirements completion rate improved from 97.5% (v1.0) to 100% (v2.0, v2.1)
- Plan granularity getting better — v1.0 averaged 4 plans/phase, v2.1 averaged 2 plans/phase with cleaner scope
