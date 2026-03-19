---
phase: 11-setup-documentation
plan: "02"
subsystem: documentation
tags: [docs, linux, windows, deployment, setup]
dependency_graph:
  requires: [11-01-PLAN.md]
  provides: [docs/linux-vps.md, docs/windows-server.md, SETUP.md-v10]
  affects: []
tech_stack:
  added: []
  patterns: [platform-specific deployment guides, companion-doc pattern]
key_files:
  created:
    - docs/linux-vps.md
    - docs/windows-server.md
  modified:
    - SETUP.md
decisions:
  - "Linux guide as companion doc: covers only Ubuntu/Debian platform-specific steps (NodeSource PPA, PGDG repo, systemd), then hands off to SETUP.md for platform-agnostic steps — avoids duplication drift"
  - "Windows guide includes inline post-migration steps: ALTER ROLE and GRANT commands reproduced inline in Step 7 PowerShell notes to match SETUP.md without requiring navigation"
  - "SETUP.md test count updated 18->19: discovered 19 test files exist, not 18 as stated"
metrics:
  duration_seconds: 282
  completed_date: "2026-03-19"
  tasks_completed: 2
  files_changed: 3
---

# Phase 11 Plan 02: Linux/VPS and Windows Server Deployment Guides Summary

Platform-specific deployment guides for Ubuntu/Debian (NodeSource PPA, PGDG repo, systemd) and Windows Server (winget, PowerShell, NSSM) with surgical SETUP.md migration version fix (9 to 10).

---

## What Was Built

### docs/linux-vps.md

A step-by-step Ubuntu/Debian deployment guide that covers the platform-specific environment setup and then hands off to SETUP.md for the platform-agnostic workflow.

Key sections:
- **Step 1: Node.js 22** via NodeSource PPA (Option A) or nvm (Option B)
- **Step 2: PostgreSQL 17** via PGDG apt repository (with Ubuntu 22.04 compatibility note) or system default
- **Step 3: golang-migrate** via Linux binary download from GitHub releases
- **Steps 4-5**: Clone repository and create database
- **Step 6**: Handoff to SETUP.md Step 4 for .env, migrations, grants, and server startup
- **Running as systemd service**: Complete unit file with `daemon-reload`, `enable`, `start`, and log commands
- **Firewall**: `ufw allow 3000/tcp` with reverse-proxy caveat
- **Troubleshooting**: 4 common failure modes with resolution commands

### docs/windows-server.md

A complete Windows Server/desktop deployment guide using PowerShell syntax throughout.

Key sections:
- **Step 1: Node.js 22** via `winget install OpenJS.NodeJS.LTS`
- **Step 2: PostgreSQL 17** via `winget install PostgreSQL.PostgreSQL.17` with `Start-Service` note
- **Step 3: golang-migrate** via `Invoke-WebRequest`, `Expand-Archive`, and `[Environment]::SetEnvironmentVariable` for PATH
- **Steps 4-6**: Clone, database creation, `.env` with PowerShell secret generation snippet
- **Step 7**: Handoff to SETUP.md Step 5 with PowerShell equivalents for `$env:` env var syntax
- **Windows Service**: NSSM (recommended) via `nssm install pb-mcp` + Task Scheduler alternative
- **Firewall**: `New-NetFirewallRule` for inbound port 3000
- **Troubleshooting**: 6 failure modes including PATH issue, PostgreSQL service, grants, dashboard 404

### SETUP.md (surgical fixes)

Four targeted changes — no rewrites:
1. "nine migrations" → "ten migrations"
2. Added migration `000010` row: `server_settings` table
3. `Version: 9` → `Version: 10` in migrate:status output
4. Test file count: `18 test files` → `19 test files` (actual count verified)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test file count from 18 to 19**
- **Found during:** Task 1 (verification step for SETUP.md test count)
- **Issue:** SETUP.md said "all tests pass across 18 test files" but the project has 19 test files
- **Fix:** Updated count to 19 in SETUP.md Step 6
- **Files modified:** SETUP.md
- **Commit:** 891c642

---

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| docs/linux-vps.md exists | FOUND |
| docs/windows-server.md exists | FOUND |
| SETUP.md exists | FOUND |
| 11-02-SUMMARY.md exists | FOUND |
| commit 891c642 (Task 1) | FOUND |
| commit 704ce6f (Task 2) | FOUND |
