---
phase: 11-setup-documentation
plan: 01
subsystem: infra
tags: [docker, documentation, readme, dockerfile, docker-compose]

# Dependency graph
requires:
  - phase: 10-dashboard-ux-polish
    provides: "Completed dashboard and all server features documented"
provides:
  - "README.md at repo root with overview, quickstart, client config, and links"
  - "Production Dockerfile (node:22-alpine, dashboard build, tsx as runtime dep)"
  - "docker-compose.prod.yml with postgres, migrate (profiled), and app services"
  - "docs/docker.md 7-step annotated Docker deployment guide"
affects: [11-02, docs-linux-vps, docs-windows-server]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Production Dockerfile separate from Dockerfile.dev (dev has volume mounts, prod builds in-image)"
    - "migrate/migrate Docker image with profiles for opt-in migration runs"
    - "tsx in dependencies (not devDependencies) for production runtime use"

key-files:
  created:
    - README.md
    - Dockerfile
    - docker-compose.prod.yml
    - docs/docker.md
  modified:
    - package.json

key-decisions:
  - "tsx moved to dependencies: production start command requires tsx at runtime; npm ci --omit=dev would exclude devDependencies"
  - "migrate service uses profiles:[migrate] so it never runs on bare docker compose up; must be explicitly invoked"
  - "APP_LOGIN_PASSWORD extracted as env var in compose so DATABASE_URL password can be set to match the ALTER ROLE grant"
  - "Docker guide is standalone with full annotated steps; not a thin wrapper that defers to SETUP.md"

patterns-established:
  - "docs/ directory established for deployment guides (docker.md, linux-vps.md, windows-server.md)"
  - "README = overview + quickstart + links; detail lives in guides"

requirements-completed: [DOCS-01, DOCS-03]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 11 Plan 01: README + Docker Deployment Infrastructure Summary

**Production Dockerfile building dashboard + tsx runtime, docker-compose.prod.yml with profiled migration service, and 7-step annotated Docker guide; README with overview, tool table, quickstart, and MCP client config**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-19T17:59:29Z
- **Completed:** 2026-03-19T18:03:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Production Dockerfile that installs deps, builds dashboard, copies source, and starts with tsx/esm -- no dev volume mounts
- docker-compose.prod.yml with postgres (healthcheck + restart), migrate (profile-gated), and app services; APP_LOGIN_PASSWORD and POSTGRES_PASSWORD extracted as variables
- docs/docker.md covering the full clone-to-running workflow in 7 annotated steps including the critical post-migration ALTER ROLE and GRANT commands, with troubleshooting section
- README.md providing project overview, 21-tool summary table, Docker quickstart, MCP Streamable HTTP client configuration, deployment guide links, admin dashboard overview, and stack table
- tsx moved from devDependencies to dependencies so npm ci --omit=dev includes it in the production image

## Task Commits

Each task was committed atomically:

1. **Task 1: Production Dockerfile, docker-compose.prod.yml, Docker guide, tsx to deps** - `02425d3` (feat)
2. **Task 2: Create README.md with project overview and Docker quickstart** - `e32aaa9` (feat)

## Files Created/Modified

- `README.md` - Project overview, tool table, Docker quickstart, MCP client config, deployment guide links, stack table
- `Dockerfile` - Production multi-stage image: node:22-alpine, npm ci --omit=dev, dashboard build, tsx CMD
- `docker-compose.prod.yml` - Production compose: postgres with healthcheck, migrate service (profiles: migrate), app service
- `docs/docker.md` - 7-step Docker deployment guide: prerequisites through AI client connection, update workflow, troubleshooting
- `package.json` - tsx moved from devDependencies to dependencies

## Decisions Made

- **tsx in dependencies:** Production CMD is `node --import tsx/esm src/index.ts` -- tsx is a runtime dependency, not a build tool. Moving it to dependencies ensures `npm ci --omit=dev` includes it.
- **migrate service uses profiles:** The `profiles: [migrate]` key means `docker compose up` never runs migrations automatically. The user must explicitly run `docker compose --profile migrate run --rm migrate`. This prevents accidental migration runs on every container restart.
- **APP_LOGIN_PASSWORD as compose variable:** The compose file sets `DATABASE_URL=postgres://app_login:${APP_LOGIN_PASSWORD}@...` so the password in the connection string matches whatever the user sets in the ALTER ROLE command, making the relationship explicit.
- **Docker guide is self-contained:** The guide covers every step end-to-end including the critical post-migration grants. Not a thin wrapper pointing to SETUP.md -- users deploying via Docker should not need to consult another document.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failures (5 files, 51 tests) requiring a running PostgreSQL instance -- identical failure count confirmed before and after changes. These are not regressions from this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- docs/ directory is established; linux-vps.md and windows-server.md can be added in plan 11-02
- README.md links to docs/linux-vps.md and docs/windows-server.md which will be created in 11-02
- Production Docker infrastructure is complete and functional

---
*Phase: 11-setup-documentation*
*Completed: 2026-03-19*
