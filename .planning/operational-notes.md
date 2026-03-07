# Operational Notes

Running log of maintenance-related decisions, action items, and admin concerns captured during planning.

---

## Migrations

- **Runner**: golang-migrate, invoked via npm script wrappers (`npm run migrate:up`, `npm run migrate:down`)
- **Authoring**: Plain SQL files — auditable, DBA-readable, no runtime code execution
- **Execution**: Separate command (not auto-run on server boot) — explicit, safe in multi-instance deploys
- **File location**: TBD (Claude's discretion — `db/migrations/` recommended)

### Action item: Pending migration alerting
- The server should be configurable to alert admins when pending (unapplied) migrations exist
- Minimum viable: log a warning to stderr on startup if pending migrations are detected
- Full alerting UI (email, webhook, dashboard badge) is a Phase 2+ concern when the admin API exists
- Make the check and threshold configurable via environment variable (e.g., `MIGRATION_ALERT=true`)

---
*Last updated: 2026-03-07*
