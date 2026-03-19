# Phase 11: Setup Documentation - Research

**Researched:** 2026-03-19
**Domain:** Technical documentation writing (README, deployment guides)
**Confidence:** HIGH

---

## Summary

Phase 11 is pure documentation work — no source code changes. The task is to produce four markdown files: a README, a Linux/VPS deployment guide, a Docker deployment guide, and a Windows Server deployment guide. All the technical facts needed for these documents already live in the project — specifically in `SETUP.md` (step-by-step setup) and `HOW_IT_WORKS.md` (architecture reference). The planner's job is to structure writing tasks that draw from these existing sources rather than rediscover facts.

The primary constraint is accuracy: the new docs must match the running system. `SETUP.md` is already comprehensive and detailed, making it the canonical source for the Linux and Windows guides. The Docker config exists as `Dockerfile.dev` and `docker-compose.yml` but both are dev-only — a production Dockerfile and docker-compose will need to be written as part of DOCS-03.

The documentation phase follows Phase 10 (all dashboard UX work is complete). There are no code dependencies remaining. This phase can be planned and executed purely as a content-creation exercise.

**Primary recommendation:** Treat each requirement as one writing task. The content already exists in SETUP.md and HOW_IT_WORKS.md — the planner should instruct the implementer to synthesise and expand those files into the four target deliverables, not to re-research the system.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DOCS-01 | README overhauled with clear project overview and quickstart | HOW_IT_WORKS.md provides architecture overview; SETUP.md steps 1–9 provide quickstart content |
| DOCS-02 | Step-by-step setup guide for Linux/VPS (Ubuntu/Debian + Node.js + PostgreSQL) | SETUP.md already covers every step; needs platform-specific commands (apt, systemd) added explicitly |
| DOCS-03 | Step-by-step setup guide for Docker (Dockerfile + docker-compose) | Dockerfile.dev and docker-compose.yml exist but are dev-only; a production Dockerfile and compose file must be created alongside the guide |
| DOCS-04 | Step-by-step setup guide for Windows Server | SETUP.md covers Windows migrate install; needs Windows-specific steps (winget/chocolatey/scoop, PowerShell, NSSM/Task Scheduler) |
</phase_requirements>

---

## What Already Exists

This is critical context — the planner must know what is already written to avoid duplication and to set correct task scope.

| File | Contents | Status |
|------|----------|--------|
| `SETUP.md` | 10-step setup walkthrough, prerequisite table, .env reference, migration steps, systemd service unit, troubleshooting, admin operations reference, seeding test data | EXISTS — high quality, accurate |
| `HOW_IT_WORKS.md` | Full architecture reference: stack table, directory layout, request flow diagrams, DB schema, API endpoints table, tool list, design decisions | EXISTS — high quality, accurate |
| `Dockerfile.dev` | Alpine Node 22, copies package.json, runs npm ci, volume-mounts src/ for hot reload | EXISTS — dev only, not suitable for production |
| `docker-compose.yml` | postgres:17-alpine + app container using Dockerfile.dev, dev env vars, src/ volume | EXISTS — dev only, incomplete for production |
| `README.md` | Does not exist | MISSING — must be created |
| Linux/VPS guide | Partially covered in SETUP.md (no Ubuntu/Debian-specific apt commands, no explicit Node.js install via NodeSource/nvm) | PARTIAL — needs platform specifics |
| Docker production guide | No production Dockerfile, no production docker-compose.yml | MISSING — both file and guide must be created |
| Windows Server guide | Windows migrate binary install covered in SETUP.md; no PowerShell env var syntax, no nvm-windows, no NSSM | PARTIAL — needs Windows-specific tooling steps |

---

## Standard Stack

No new libraries are needed for this phase. The documentation describes the existing stack. Confirmed from `package.json` and `HOW_IT_WORKS.md`:

### Project Stack (for accurate documentation)

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 22 LTS | `engines.node: ">=22"` in package.json |
| TypeScript | ^5.0.0 | ESM modules (`"type": "module"`) |
| Fastify | ^5.0.0 | HTTP server |
| PostgreSQL | 15+ (17 recommended) | `postgres:17-alpine` used in CI and docker-compose |
| golang-migrate | v4.19.1 | Static binary, used for all migrations |
| @modelcontextprotocol/sdk | ^1.27.0 | MCP Streamable HTTP transport |
| tsx | latest | TypeScript execution without pre-compile |
| Drizzle ORM | ^0.45.0 | Type generation; raw postgres.js for queries |
| postgres.js | ^3.4.0 | SQL client |
| zod | ^3.25.0 | Schema validation |
| vitest | latest | Test framework |

### Dashboard Stack (for accurate documentation)

| Component | Version | Notes |
|-----------|---------|-------|
| React | 19 | |
| Vite | latest | `npm run dashboard:build` produces `dashboard/dist/` |
| Tailwind CSS | v4 | |
| React Router | v7 | |

---

## Architecture Patterns

### What the README Must Convey

A README for a multi-tenant MCP server has a specific audience: a developer evaluating whether to deploy it, and a developer starting deployment. The README must answer:

1. What is this? (one paragraph, non-technical)
2. What does an AI assistant actually get to do? (tool list or summary)
3. What is the architecture? (multi-tenant, PostgreSQL, MCP Streamable HTTP)
4. How do I try it in 5 minutes? (quickstart — Docker is the fastest path)
5. Where do I go for full setup? (links to guides)

The README should be short. The detail lives in the guides. This is the standard open-source pattern: README = overview + quickstart + links.

### Quickstart Strategy (DOCS-01)

Docker is the correct quickstart path because it has the fewest prerequisites (just Docker) and the least environment-specific setup. The quickstart section in the README should use Docker, pointing to the full Docker guide for annotated detail.

A minimal Docker quickstart looks like:
```
git clone ... && cd pb-mcp
cp .env.example .env   # edit ADMIN_SECRET, JWT_SECRET
docker compose up -d
# then: run migrations, create first tenant
```

### Linux/VPS Guide Structure (DOCS-02)

Ubuntu/Debian is the most common VPS OS. The guide needs these platform-specific sections that SETUP.md currently lacks:

1. **Node.js installation** — recommended path is NodeSource PPA (`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -` then `sudo apt-get install -y nodejs`) or nvm (`curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`)
2. **PostgreSQL installation** — `sudo apt install postgresql postgresql-contrib` (Ubuntu 22.04 ships Postgres 14; for 15+ use official PGDG apt repo)
3. **golang-migrate installation** — already documented in SETUP.md with the Linux curl command; just copy it
4. **Cloning + npm ci** — same as SETUP.md
5. **.env, migrations, grants** — copy from SETUP.md verbatim
6. **Production start** — `node --import tsx/esm src/index.ts` or the systemd unit from SETUP.md
7. **systemd service** — SETUP.md already has a complete unit file; include it

The PGDG repo is needed if the target system is Ubuntu 20.04/22.04 (ships PG 12/14). The guide should note: "Ubuntu 22.04 ships PostgreSQL 14 which is below the recommended 15+ minimum. To install 17, add the official PGDG repository."

### Docker Guide Structure (DOCS-03)

The existing `Dockerfile.dev` and `docker-compose.yml` are dev-only (src volume mount, tsx watch). A production setup needs:

**Production Dockerfile** — must:
- Use `node:22-alpine` base
- Copy all source files
- Run `npm ci --omit=dev` (omit devDependencies)
- Build the dashboard: `npm run dashboard:build`
- Set `NODE_ENV=production`
- Use `node --import tsx/esm src/index.ts` as the CMD (consistent with SETUP.md)
- Expose port 3000

**Production docker-compose.yml** — must:
- Use `postgres:17-alpine`
- Include a `migrate` one-shot service that runs migrations before the app starts
- OR document running migrations as a separate step before `docker compose up`
- Include all required environment variables (pointing to postgres service)
- Volume for postgres data persistence
- Health check on postgres (already in existing compose)
- The app depends on postgres (already in existing compose)

The golang-migrate step is the tricky part for Docker. Options:
1. Run migration as a separate `docker compose run migrate` command using the migrate Docker image (`migrate/migrate`)
2. Add a migrate init container to docker-compose
3. Use a shell entrypoint that runs migrations before starting the server

Option 2 (init container using `migrate/migrate` image) is cleanest for a compose-based guide. The `migrate/migrate` Docker image exists on Docker Hub and is the standard approach.

### Windows Server Guide Structure (DOCS-04)

Windows-specific gaps that SETUP.md does not cover:

1. **Node.js installation** — winget (`winget install OpenJS.NodeJS.LTS`) or direct installer from nodejs.org
2. **PostgreSQL installation** — installer from postgresql.org/download/windows or `winget install PostgreSQL.PostgreSQL`
3. **golang-migrate** — SETUP.md already documents this (download zip, extract exe, add to PATH)
4. **Environment variables** — `.env` file approach still works; note that `cp .env.example .env` in PowerShell is `Copy-Item .env.example .env`
5. **Running the server** — PowerShell commands differ slightly; show `$env:NODE_ENV = "production"` for PowerShell
6. **Service management** — NSSM (Non-Sucking Service Manager) is the standard tool for running Node.js as a Windows Service; `winget install NSSM.NSSM`
7. **Firewall** — brief note that port 3000 may need a Windows Defender Firewall inbound rule

The guide should use PowerShell syntax throughout (not cmd.exe).

---

## Don't Hand-Roll

This phase is documentation-only; there is no code to write. However, there are two files that must be created as artefacts alongside DOCS-03:

| Item | What to Create | Why |
|------|---------------|-----|
| Production Dockerfile | `Dockerfile` (distinct from `Dockerfile.dev`) | The Docker guide cannot reference a file that doesn't exist |
| Production docker-compose | `docker-compose.prod.yml` or extend existing compose | Same reason; dev compose uses src volume mounts which are wrong for production |

These are small infrastructure files, not application code. They should be part of DOCS-03's implementation task.

---

## Common Pitfalls

### Pitfall 1: SETUP.md vs. New Guide Drift

**What goes wrong:** The new Linux and Windows guides duplicate SETUP.md content but with minor differences — a different password example, a different port, a missing step. Two sources of truth immediately go stale.

**Why it happens:** Copy-paste documentation with edits that are never synchronised.

**How to avoid:** The new guides should be framed as platform-specific companions to SETUP.md, not replacements. Steps that are platform-agnostic (create .env, run migrations, grant permissions, start server) should either reference SETUP.md or be copied verbatim. The platform-specific sections (install Node.js, install PostgreSQL, service management) are where each guide adds unique value.

**Recommendation:** Do not create a third setup document that covers the same ground as SETUP.md at the same level of detail. The Linux guide should start from "prerequisites installed" and cover only platform-specific steps, then link back to SETUP.md for the rest. Alternatively, SETUP.md becomes the master document and the guides are thin platform-specific wrappers that fill in the gaps.

For this project's scale (small team), the second approach is better: keep SETUP.md as the authoritative detailed walkthrough, and make each platform guide cover only the environment setup steps (installing Node, PostgreSQL, migrate) before directing the reader to follow SETUP.md from Step 2 onward.

### Pitfall 2: Incorrect Migration Step for Docker

**What goes wrong:** The Docker guide omits or gets wrong the migration + grant step. The app starts, the database exists, but tables don't — the server crashes immediately.

**Why it happens:** Migrations are a pre-run step that's easy to forget in a "just docker compose up" mental model.

**How to avoid:** The Docker guide must make migrations explicit and unavoidable. Either use an init container (migrate service in compose) or show a two-command sequence: `docker compose run --rm migrate up` followed by `docker compose up -d`.

### Pitfall 3: Production Dockerfile Missing Dashboard Build

**What goes wrong:** The production Dockerfile doesn't run `npm run dashboard:build`. The server starts but `/dashboard/` returns 404 because `dashboard/dist/` doesn't exist.

**Why it happens:** The dev setup uses Vite dev server (`npm run dashboard:dev`); the dashboard build step is separate and easy to miss when writing a Dockerfile.

**How to avoid:** The production Dockerfile must run `npm run dashboard:build` as a build step. The dashboard dependencies are in `dashboard/package.json` so `cd dashboard && npm ci && npm run build` must be in the Dockerfile before the server CMD.

### Pitfall 4: app_login Password Grant Step Omitted

**What goes wrong:** Migrations succeed but the server can't query any tables. Error: "password authentication failed for user app_login" or "permission denied for table products".

**Why it happens:** Migration 000001 creates `app_login` with a placeholder password (`changeme`). Two extra steps are required after `npm run migrate:up`:
1. `ALTER ROLE app_login PASSWORD '...'` to match DATABASE_URL
2. `GRANT SELECT, INSERT, UPDATE ON ALL TABLES` to app_user

These are in SETUP.md Step 5 but easy to miss in a condensed guide.

**How to avoid:** Every guide must include these two post-migration commands in a clearly labelled "Post-migration grants" subsection.

### Pitfall 5: Windows PATH for golang-migrate

**What goes wrong:** `migrate --version` fails on Windows because `migrate.exe` was placed somewhere not on PATH.

**Why it happens:** Windows PATH management is manual and non-obvious compared to Linux.

**How to avoid:** The Windows guide should give a concrete example: place `migrate.exe` in `C:\Program Files\migrate\` and add that folder to System PATH via System Properties → Environment Variables. Or use the simpler `C:\Windows\System32\` path (already on PATH but not recommended for third-party tools).

### Pitfall 6: Stdout Contamination in Production

**What goes wrong:** After deploying, an AI client connects and gets garbled responses. The developer added `console.log()` somewhere for debugging.

**Why it happens:** MCP uses stdout for its wire protocol. Any output to stdout corrupts the stream.

**How to avoid:** The README and all deployment guides should include a prominent callout: "The server outputs nothing to stdout. All logs go to stderr. This is required — the MCP transport uses stdout as its communication channel."

---

## Code Examples

### Confirmed Production Start Command (from SETUP.md)

```bash
# Source: SETUP.md Step 7
node --import tsx/esm src/index.ts
```

### Confirmed Migration Commands (from SETUP.md and package.json)

```bash
# Run migrations
npm run migrate:up

# Set app_login password (must match DATABASE_URL)
psql "$DATABASE_MIGRATION_URL" -c "ALTER ROLE app_login PASSWORD 'your-password';"

# Grant table permissions
psql "$DATABASE_MIGRATION_URL" -c "
  GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
"

# Verify migration version
npm run migrate:status
# Expected: Version: 10
```

Note: SETUP.md says "Version: 9" but the project now has 10 migrations (000010_create_server_settings added in Phase 8). The new docs must say "Version: 10".

### Confirmed Environment Variables (from .env.example)

Required variables (server exits without these):
- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `ADMIN_SECRET`
- `JWT_SECRET`

Optional with defaults:
- `JWT_EXPIRY_HOURS` (default: 8)
- `ADMIN_USERNAME` (default: admin)
- `MIGRATION_ALERT` (default: not set; true enables startup warning)
- `PORT` (default: 3000)
- `NODE_ENV` (default: not set; "production" recommended)

Optional YouTrack (server starts without them):
- `YOUTRACK_BASE_URL`
- `YOUTRACK_TOKEN`
- `YOUTRACK_PROJECT`
- `KB_SYNC_INTERVAL_MS` (default: 1800000)

### Production Dockerfile Pattern

```dockerfile
# Source: derived from Dockerfile.dev + HOW_IT_WORKS.md production notes
FROM node:22-alpine

WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Build dashboard
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci
COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# Copy server source
COPY src/ ./src/
COPY tsconfig.json ./
COPY db/ ./db/

EXPOSE 3000

CMD ["node", "--import", "tsx/esm", "src/index.ts"]
```

Note: tsx is in devDependencies. The production Dockerfile must either keep it as a devDependency and NOT use `--omit=dev`, OR add tsx to dependencies. The current `package.json` has tsx in devDependencies. This is a decision the implementer must address: recommended approach is move tsx to dependencies since it's the production runtime.

### Docker Compose Migration Service Pattern

```yaml
# migrate one-shot service using the official migrate image
services:
  migrate:
    image: migrate/migrate:v4.19.1
    volumes:
      - ./db/migrations:/migrations
    command: ["-path", "/migrations", "-database", "${DATABASE_MIGRATION_URL}", "up"]
    depends_on:
      postgres:
        condition: service_healthy
    restart: on-failure
```

### systemd Service Unit (from SETUP.md — copy verbatim)

```ini
[Unit]
Description=PB MCP Server
After=network.target postgresql.service

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/pb-mcp
EnvironmentFile=/path/to/pb-mcp/.env
ExecStart=/usr/bin/node --import tsx/esm src/index.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| README as primary setup guide | README = overview + quickstart + links to dedicated guides | This project currently has no README; the pattern is standard for projects with multi-platform deployment |
| Single setup doc | Platform-specific guides per target OS | Better UX for developers who only need one platform |
| Dev dockerfile = prod dockerfile | Separate Dockerfile and Dockerfile.dev | Dev has hot reload volumes; prod builds and copies |
| stdio MCP transport | Streamable HTTP MCP transport | Must be documented — Claude Desktop config uses `url` not `command` |

**Documentation note:** MCP Streamable HTTP transport configuration for Claude Desktop uses the `url` key, not the `command`/`args` pattern used by stdio transports. This is different from what most MCP tutorials show. The README and guides must use the correct format:

```json
{
  "mcpServers": {
    "pb-mcp": {
      "url": "http://YOUR_SERVER:3000/mcp",
      "headers": { "X-Api-Key": "pb_..." }
    }
  }
}
```

---

## Open Questions

1. **tsx in devDependencies for production**
   - What we know: tsx is listed under devDependencies; production start command requires it
   - What's unclear: Should tsx move to dependencies before writing the Docker guide, or should the Docker guide use `--omit=dev` and document tsx as a required dependency?
   - Recommendation: Move tsx to dependencies as part of DOCS-03 task. This is the correct place for a production runtime dependency.

2. **SETUP.md retention**
   - What we know: SETUP.md is detailed and accurate; the new Linux guide covers much of the same ground
   - What's unclear: Should SETUP.md be kept alongside the new guides, replaced by them, or linked from them?
   - Recommendation: Keep SETUP.md as-is. The new guides are platform-specific companions. SETUP.md serves as the "generic/already-have-prerequisites" reference. Update it to fix the "Version: 9" reference to "Version: 10".

3. **HOW_IT_WORKS.md updates**
   - What we know: HOW_IT_WORKS.md correctly describes the system but lists 9 migrations and says "9 test files" in one place
   - What's unclear: Should this be updated as part of Phase 11 or a separate task?
   - Recommendation: Update migration count (9 → 10) and verify test file counts as part of DOCS-01 task since the README will link to HOW_IT_WORKS.md.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (latest, confirmed in package.json) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

Documentation phases have no automated test coverage by nature. The correctness of documentation is verified through human review and manual follow-through.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DOCS-01 | README file exists at repo root | smoke/manual | `test -f README.md` (shell) | Wave 0 gap |
| DOCS-02 | Linux guide file exists | smoke/manual | `test -f docs/linux-vps.md` | Wave 0 gap |
| DOCS-03 | Docker guide + Dockerfile exist | smoke/manual | `test -f Dockerfile && test -f docs/docker.md` | Wave 0 gap |
| DOCS-04 | Windows guide file exists | smoke/manual | `test -f docs/windows-server.md` | Wave 0 gap |

Note: These are file-existence checks only. Content correctness requires manual verification (following the guide on a fresh machine). The vitest suite tests the server itself, not documentation quality.

### Sampling Rate

- **Per task commit:** N/A — documentation commits have no automated test
- **Per wave merge:** `npm test` — ensures no server code was accidentally broken
- **Phase gate:** Manual review of each guide for accuracy before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No test file gaps — existing test infrastructure is unaffected by this phase
- [ ] Output file locations need to be decided (see Architecture Patterns above): `README.md` at root, deployment guides at `docs/linux-vps.md`, `docs/docker.md`, `docs/windows-server.md`

---

## Sources

### Primary (HIGH confidence)

- `SETUP.md` — complete setup walkthrough; all technical commands verified against running system
- `HOW_IT_WORKS.md` — architecture reference; stack table, directory layout, request flows, database schema, API table
- `package.json` — authoritative dependency versions and npm scripts
- `Dockerfile.dev` — existing Docker dev configuration
- `docker-compose.yml` — existing compose configuration
- `.env.example` — authoritative env var reference
- `db/migrations/` — migration count (10 total, confirming "Version: 10" for new docs)

### Secondary (MEDIUM confidence)

- NodeSource PPA documentation for Node.js 22 on Ubuntu/Debian — standard installation method, widely documented
- PGDG apt repository — official PostgreSQL apt repo for Ubuntu; needed for PG 15+ on older Ubuntu LTS
- `migrate/migrate` Docker Hub image — official golang-migrate Docker image for compose migration service

### Tertiary (LOW confidence)

- NSSM (Non-Sucking Service Manager) as Windows service manager — community standard for Node.js Windows services; not officially endorsed by any vendor
- `winget` commands for Node.js/PostgreSQL — winget package IDs may change; verify against winget-pkgs registry at documentation time

---

## Metadata

**Confidence breakdown:**
- Documentation scope: HIGH — all source files read, requirements are explicit
- Technical facts: HIGH — drawn directly from SETUP.md, HOW_IT_WORKS.md, package.json, docker files
- Platform-specific steps (Linux): MEDIUM — standard NodeSource/PGDG patterns; verify URLs are current
- Platform-specific steps (Windows): MEDIUM — winget IDs and NSSM approach are standard but should be verified at write time
- Docker production pattern: MEDIUM — standard pattern; tsx devDependency issue is a real gap that needs resolution in the task

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (stable documentation domain; dependency versions may change)
