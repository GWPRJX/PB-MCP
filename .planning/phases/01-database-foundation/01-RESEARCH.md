# Phase 1: Database Foundation - Research

**Researched:** 2026-03-07
**Domain:** PostgreSQL RLS, golang-migrate, Docker Compose dev environment, GitHub Actions CI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration tooling**
- Plain SQL files (not TypeScript or ORM-generated) — auditable, DBA-readable, no runtime code execution
- Runner: golang-migrate, invoked via npm script wrappers (`npm run migrate:up`, `npm run migrate:down`)
- Migrations run as a separate explicit command — not auto-run on server boot
- On server startup, log a warning to stderr if pending (unapplied) migrations are detected; make this check configurable via environment variable (e.g., `MIGRATION_ALERT=true`)

**Local development setup**
- Docker Compose ships with the repo — brings up both PostgreSQL and the app container
- App container uses a volume-mounted `src/` directory with `tsx watch` for hot reload (no image rebuild on code changes)
- Environment configuration: `.env` file (gitignored) + `.env.example` (committed with placeholder values)

**CI platform**
- GitHub Actions — runs on every push and every pull request
- Required status check: CI must pass before any PR can be merged to main
- CI pipeline: start PostgreSQL service container → run migrations → run RLS policy assertion (INFRA-07)

**ERP table scope**
- Full ERP schemas created in Phase 1 — all columns that Phase 3 tools will need, not skeleton stubs
- Tables: `tenants`, `products`, `stock_levels`, `suppliers`, `orders`, `order_line_items`, `invoices`, `contacts`, `api_keys`
- All tenant-bearing tables get `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- KB articles (`kb_articles`) is a global cache — no `tenant_id`, no RLS — all tenants share the same YouTrack article data

### Claude's Discretion
- Exact column definitions for each ERP table (derive from Phase 3 tool requirements)
- RLS policy expressions (current tenant ID via session variable set by application)
- Specific golang-migrate version and installation method
- Docker Compose service names and port mapping
- Migration files location (recommended: `db/migrations/`)

### Deferred Ideas (OUT OF SCOPE)
- Full admin alerting UI for pending migrations (email, webhook, dashboard badge) — Phase 2+ when admin API exists
- Per-tenant YouTrack KB cache — explicitly out of scope; KB is a global cache in v1
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | System runs as a single Node.js (TypeScript) process with Fastify 5 | Project structure, Docker Compose app container setup, tsx watch pattern |
| INFRA-02 | MCP server uses Streamable HTTP transport (not stdio) | Logging to stderr critical for this; Phase 1 establishes the logging discipline |
| INFRA-03 | PostgreSQL with Row-Level Security (RLS) isolates all tenant data in a shared schema | RLS SQL patterns, `SET LOCAL` session variable, application role creation |
| INFRA-04 | Every tenant-bearing table has both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` | Exact SQL DDL patterns, migration file structure |
| INFRA-05 | Application uses a dedicated non-superuser PostgreSQL role (no BYPASSRLS) | Role creation SQL, GRANT pattern, connection URL for app role |
| INFRA-06 | stderr-only logging (no stdout writes that corrupt MCP transport) | Docker Compose log config, startup script stderr enforcement |
| INFRA-07 | CI check asserts all tenant-bearing tables have RLS policies | `pg_class` + `pg_policies` assertion query, GitHub Actions workflow |
</phase_requirements>

---

## Summary

Phase 1 establishes the PostgreSQL schema with Row-Level Security as the tenant isolation boundary. All subsequent phases build on top of this foundation. Getting isolation wrong here is the most catastrophic failure mode in the entire project — it is silent (no error raised, just wrong data returned) and extremely difficult to retrofit.

The chosen migration tooling — plain SQL files run by golang-migrate — is the correct choice for auditability and DBA-readability. The golang-migrate binary is installed into the project via a CI download step (curl from GitHub releases) and locally via Homebrew or direct download. npm script wrappers (`migrate:up`, `migrate:down`) give developers a consistent interface without requiring direct binary knowledge.

The two non-negotiable RLS requirements are (1) connecting as a dedicated non-superuser role so `FORCE ROW LEVEL SECURITY` actually applies, and (2) the CI assertion that fails the build when any tenant-bearing table is missing an RLS policy. Without both, the isolation is untested theater. The test suite for this phase is primarily SQL-level integration tests that verify the actual PostgreSQL state after migrations run — not mocked unit tests.

**Primary recommendation:** Establish the dedicated `app_user` PostgreSQL role and the `FORCE ROW LEVEL SECURITY` pattern in migration 001 before creating any tenant-bearing tables. The CI assertion query must fail with a non-zero exit code when violations exist — make this a script, not an ad-hoc psql command.

---

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| golang-migrate | v4.19.1 | SQL migration runner | Plain SQL files, no code generation, multi-database, well-maintained CLI binary |
| postgres (postgres.js) | 3.4.x | PostgreSQL client for pending-migration check and startup warning | Native `SET LOCAL` support, fastest Node.js PG driver |
| PostgreSQL | 17 (Docker image) | Database engine | Latest LTS image; use `postgres:17-alpine` for smaller image |
| Docker Compose | v2 | Local dev orchestration | Ships `docker compose` as plugin; no separate install needed |
| tsx | latest | TypeScript runner with watch mode | Hot reload without image rebuild; used in app container |
| vitest | latest | Test runner for RLS integration tests | Fast, native ESM, runs TypeScript directly |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| dotenv | 16.x | Load `.env` into Node.js process | For the startup migration-check script |
| @types/node | 22.x | Node.js type definitions | TypeScript compilation |
| typescript | 5.x | Language compiler | Project-wide |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| golang-migrate | node-pg-migrate | node-pg-migrate supports JS/TS migration files in addition to SQL, but user specifically chose plain SQL + golang-migrate for auditability |
| golang-migrate | Drizzle Kit | Drizzle Kit generates migrations from TypeScript schema; user decision was against this — plain SQL only |
| golang-migrate | Flyway | Flyway is Java-based and heavier; golang-migrate is a single static binary |
| postgres.js | node-postgres (pg) | pg is less ergonomic for `SET LOCAL`; postgres.js tagged-template API is cleaner |
| vitest | jest | vitest is faster, native ESM, no transpile step; preferred for TypeScript projects in 2026 |

**Installation:**
```bash
# Runtime deps
npm install postgres dotenv

# Dev deps
npm install -D typescript @types/node tsx vitest

# golang-migrate is NOT an npm package — installed separately (see below)
```

---

## Architecture Patterns

### Recommended Project Structure

```
/
├── db/
│   └── migrations/          # Plain SQL files, golang-migrate format
│       ├── 000001_create_roles.up.sql
│       ├── 000001_create_roles.down.sql
│       ├── 000002_create_tenants.up.sql
│       ├── 000002_create_tenants.down.sql
│       ├── 000003_create_erp_tables.up.sql
│       └── 000003_create_erp_tables.down.sql
├── src/
│   ├── db/
│   │   ├── client.ts         # postgres.js client init
│   │   └── check-pending.ts  # startup migration-alert script
│   └── index.ts              # Fastify server entry (Phase 2+)
├── scripts/
│   └── check-rls.sql         # CI assertion query (INFRA-07)
├── tests/
│   └── db/
│       ├── rls-isolation.test.ts   # Cross-tenant isolation tests
│       └── rls-policy-coverage.test.ts  # Every table has policy
├── docker-compose.yml
├── docker-compose.test.yml   # CI variant (optional)
├── Dockerfile.dev
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Pattern 1: golang-migrate CLI Installation

golang-migrate is a static binary with no runtime dependencies. The standard pattern for Node.js projects is:

**Local development (macOS):**
```bash
brew install golang-migrate
```

**Local development (Linux/WSL):**
```bash
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/migrate
```

**CI (GitHub Actions):**
```bash
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/migrate
```

**npm script wrappers in `package.json`:**
```json
{
  "scripts": {
    "migrate:up":    "migrate -path db/migrations -database \"${DATABASE_URL}\" up",
    "migrate:down":  "migrate -path db/migrations -database \"${DATABASE_URL}\" down 1",
    "migrate:status": "migrate -path db/migrations -database \"${DATABASE_URL}\" version",
    "migrate:create": "migrate create -ext sql -dir db/migrations -seq"
  }
}
```

The `DATABASE_URL` must be the superuser/admin URL for migrations (needs schema creation privileges). The app role URL is separate and has no DDL privileges.

### Pattern 2: Migration File Naming

golang-migrate uses sequential or timestamp-based naming. **Use sequential with 6-digit padding** (`-seq` flag) for this project — easier to read in a directory listing:

```
000001_create_roles.up.sql
000001_create_roles.down.sql
000002_create_tenants.up.sql
000002_create_tenants.down.sql
000003_create_api_keys.up.sql
000003_create_api_keys.down.sql
000004_create_erp_tables.up.sql
000004_create_erp_tables.down.sql
000005_create_kb_articles.up.sql
000005_create_kb_articles.down.sql
```

**Create a new migration:**
```bash
npm run migrate:create -- add_index_to_products
# Produces: 000006_add_index_to_products.up.sql + .down.sql
```

### Pattern 3: RLS SQL — The Complete Pattern

Every tenant-bearing table requires four elements. This is the canonical migration pattern:

```sql
-- Source: PostgreSQL official docs + AWS multi-tenant RLS guide

-- 1. Create the application role (once, in migration 000001)
CREATE ROLE app_user NOLOGIN;
GRANT CONNECT ON DATABASE pb_mcp TO app_user;

-- 2. Create the table (include tenant_id on every tenant-bearing table)
CREATE TABLE products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    -- ... other columns ...
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable RLS — BOTH statements required
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

-- 4. Create the isolation policy
CREATE POLICY tenant_isolation ON products
    USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- 5. Grant table access to app role (never ownership)
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_user;

-- 6. Scope unique constraints to tenant (not global)
-- WRONG:  UNIQUE(email)           -- leaks data existence across tenants
-- RIGHT:  UNIQUE(tenant_id, email) -- scoped to tenant
```

### Pattern 4: postgres.js SET LOCAL per Transaction

```typescript
// Source: postgres.js docs + Crunchy Data RLS guide
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

// Every query that touches tenant data MUST use this wrapper
async function withTenantContext<T>(
  tenantId: string,
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  return await sql.begin(async (tx) => {
    // SET LOCAL is transaction-scoped — auto-cleared on transaction end
    // This prevents connection pool contamination
    await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

// Usage
const products = await withTenantContext(tenantId, (tx) =>
  tx`SELECT * FROM products`
);
```

**Critical:** Use `set_config('app.current_tenant_id', $1, true)` where the third parameter `true` means "local to transaction". This is equivalent to `SET LOCAL`. Never use `SET` (session-scoped) — it persists beyond the transaction and contaminates pooled connections.

### Pattern 5: Startup Pending-Migration Check

```typescript
// src/db/check-pending.ts
import postgres from 'postgres';

export async function checkPendingMigrations(): Promise<void> {
  if (process.env.MIGRATION_ALERT !== 'true') return;

  const sql = postgres(process.env.DATABASE_URL!);
  try {
    // golang-migrate tracks applied migrations in schema_migrations table
    const result = await sql`
      SELECT COUNT(*) as applied_count
      FROM schema_migrations
      WHERE dirty = false
    `;
    // Compare against known migration count or just log presence of table
    process.stderr.write(`[startup] Migration check: ${result[0].applied_count} migrations applied\n`);
  } catch {
    // schema_migrations table doesn't exist = no migrations run
    process.stderr.write('[startup] WARNING: No migrations applied. Run npm run migrate:up\n');
  } finally {
    await sql.end();
  }
}
```

**Note:** A more robust approach is to shell out to `migrate version` and compare against the highest migration number on disk. The simple check above warns when zero migrations are applied. For a proper pending-count check, parse the filesystem migration count vs. DB version.

### Pattern 6: CI RLS Assertion Query (INFRA-07)

```sql
-- scripts/check-rls.sql
-- Run as: psql $DATABASE_URL -f scripts/check-rls.sql
-- Returns rows for any tenant-bearing table that violates RLS requirements
-- CI must fail if this query returns any rows

SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    COUNT(p.policyname) AS policy_count
FROM pg_class c
LEFT JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname
WHERE c.relkind = 'r'                     -- regular tables only
  AND n.nspname = 'public'                -- public schema
  AND c.relname IN (                      -- tenant-bearing table whitelist
      'products',
      'stock_levels',
      'suppliers',
      'orders',
      'order_line_items',
      'invoices',
      'contacts',
      'api_keys'
  )
  AND (
      c.relrowsecurity = false            -- RLS not enabled
      OR c.relforcerowsecurity = false    -- FORCE not set
      OR COUNT(p.policyname) = 0          -- no policies defined
  )
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;
```

**CI usage — fail build if any rows returned:**
```bash
VIOLATIONS=$(psql "$DATABASE_URL" -t -A -f scripts/check-rls.sql)
if [ -n "$VIOLATIONS" ]; then
  echo "RLS VIOLATION: Tables missing RLS policies:"
  echo "$VIOLATIONS"
  exit 1
fi
echo "RLS check passed: all tenant-bearing tables have policies"
```

### Pattern 7: Docker Compose for Local Dev

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: pb_mcp
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - ./src:/app/src        # Hot reload: only src/ mounted
      - /app/node_modules      # Prevent host node_modules from overriding
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgres://app_user:app_password@postgres:5432/pb_mcp
      - MIGRATION_ALERT=true
      # Windows/WSL Docker polling fix for tsx watch:
      - CHOKIDAR_USEPOLLING=true
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    command: npx tsx watch src/index.ts

volumes:
  postgres_data:
```

**Dockerfile.dev:**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
# src/ is volume-mounted at runtime — no COPY src needed
EXPOSE 3000
```

**Important:** tsx watch requires polling on Windows/WSL2 because Docker volume mounts do not propagate native file-change events. The `CHOKIDAR_USEPOLLING=true` environment variable enables this. tsx 4.x supports `--poll` flag as an alternative.

### Pattern 8: GitHub Actions CI Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: pb_mcp_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/pb_mcp_test

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci

      - name: Install golang-migrate
        run: |
          curl -L https://github.com/golang-migrate/migrate/releases/download/v4.19.1/migrate.linux-amd64.tar.gz | tar xvz
          sudo mv migrate /usr/local/bin/migrate

      - name: Run migrations
        run: migrate -path db/migrations -database "$DATABASE_URL" up

      - name: Create app role in test DB
        run: |
          psql "$DATABASE_URL" -c "
            DO \$\$ BEGIN
              IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
                CREATE ROLE app_user NOLOGIN;
              END IF;
            END \$\$;
            GRANT CONNECT ON DATABASE pb_mcp_test TO app_user;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
          "

      - name: Assert RLS coverage (INFRA-07)
        run: |
          VIOLATIONS=$(psql "$DATABASE_URL" -t -A -f scripts/check-rls.sql)
          if [ -n "$VIOLATIONS" ]; then
            echo "RLS VIOLATION detected:"
            echo "$VIOLATIONS"
            exit 1
          fi
          echo "RLS check passed"

      - name: Run test suite
        run: npm test
```

### Anti-Patterns to Avoid

- **Connecting as the table owner for migrations AND the app:** The migration role needs DDL privileges (CREATE TABLE, ALTER TABLE). The app role needs only DML (SELECT, INSERT, UPDATE, DELETE). Never use the same role for both — the app role connecting as owner bypasses `FORCE ROW LEVEL SECURITY`.
- **Using `SET` instead of `SET LOCAL`:** Session-scoped `SET` persists beyond transaction end and contaminates the next request from a pooled connection. Always use `SET LOCAL` or the `set_config($key, $value, true)` form.
- **Creating global uniqueness constraints:** `UNIQUE(email)` on a tenant-bearing table leaks information about whether a value exists in another tenant's data. Always scope to tenant: `UNIQUE(tenant_id, email)`.
- **Adding tables without RLS:** RLS is opt-in per table. The CI check is the safety net — it must fail the build.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration runner | Custom Node.js migration script | golang-migrate | Handles dirty state, locking, partial failure, version tracking, down migrations |
| SQL file sequencing | Custom filename parser | golang-migrate's built-in sequencing | Handles ties, gaps, team concurrency |
| RLS policy enforcement | Application-layer tenant filter in every query | PostgreSQL RLS | DB-enforced — no possibility of query escaping the filter |
| DB health check in Docker | Custom probe script | `pg_isready` (built into PostgreSQL image) | Already handles connection readiness correctly |
| Pending migration detection | Custom tracking table | `schema_migrations` table (golang-migrate managed) | golang-migrate writes and maintains this automatically |

**Key insight:** golang-migrate handles the hard parts of migrations: dirty state recovery (when a previous migration failed mid-run), advisory locks to prevent concurrent migration runs, and the `schema_migrations` version table. Do not replicate this logic.

---

## Common Pitfalls

### Pitfall 1: App Connects as Table Owner (CRITICAL)

**What goes wrong:** PostgreSQL superusers and table owners bypass `ENABLE ROW LEVEL SECURITY`. `FORCE ROW LEVEL SECURITY` prevents the table owner from bypassing, but only if the app connects as a different role. If `DATABASE_URL` points to the same role that owns the tables, all RLS policies are silently ignored regardless of `FORCE ROW LEVEL SECURITY`.

**Why it happens:** Development bootstrap uses one high-privilege user for convenience. The app inherits that URL.

**How to avoid:** Create `app_user` NOLOGIN role in migration 000001. Create a separate login role (`app_login`) that is a member of `app_user`. Use `app_login`'s connection URL for the application. Never use the DBA/migration URL in the app process.

**Warning signs:** RLS tests pass but you're connecting as the table owner; `EXPLAIN` shows no RLS filter in query plans.

### Pitfall 2: SET vs SET LOCAL (Connection Pool Contamination)

**What goes wrong:** `SET app.current_tenant_id = 'abc'` is session-scoped. When the connection is returned to the pool and reused by a different request, that request inherits the previous tenant's context. RLS silently serves the wrong tenant's data.

**Why it happens:** Developers use `SET` instead of `SET LOCAL` or forget to reset the variable in error paths.

**How to avoid:** Always use `set_config('app.current_tenant_id', $tenantId, true)` (the `true` parameter means "local to current transaction"). postgres.js's `sql.begin()` transaction block auto-resets session locals on commit/rollback.

**Warning signs:** No `sql.begin()` wrapping the tenant context setter; using `SET` directly.

### Pitfall 3: RLS on Views (SECURITY DEFINER Default)

**What goes wrong:** PostgreSQL views execute with the privileges of the view creator (SECURITY DEFINER), not the caller. RLS is bypassed entirely when data is accessed through such a view.

**Why it happens:** Views are SECURITY DEFINER by default in PostgreSQL.

**How to avoid:** If views are needed (not required in Phase 1), always create them with `CREATE VIEW ... WITH (security_invoker = true)` (PostgreSQL 15+). For Phase 1, avoid views entirely — use direct table queries.

**Warning signs:** Any `CREATE VIEW` statement in migrations without `security_invoker = true`.

### Pitfall 4: tsx watch Silently Fails on Windows/WSL2

**What goes wrong:** tsx watch in a Docker container on Windows/WSL2 does not detect file changes from the Windows host filesystem because WSL2 does not propagate native file-change events into Linux containers.

**Why it happens:** Docker volume mounts on Windows use the WSL2 layer, which blocks inotify events.

**How to avoid:** Set `CHOKIDAR_USEPOLLING=true` in the Docker Compose `app` service environment. This switches tsx's file watcher to polling mode. Expect slightly higher CPU usage during development.

**Warning signs:** Code changes in the editor have no effect on the running container; tsx watch shows no output after file saves.

### Pitfall 5: Migration URL vs App URL Confusion

**What goes wrong:** Using the same connection URL for `npm run migrate:up` and the application. If the migration URL is a superuser, the app inherits superuser privileges and bypasses RLS.

**How to avoid:** Maintain two separate credentials: `DATABASE_MIGRATION_URL` (superuser, for `npm run migrate:up`) and `DATABASE_URL` (app_user login role, for the application). Both in `.env`. Only `DATABASE_URL` is used by the running app.

### Pitfall 6: Missing FORCE ROW LEVEL SECURITY

**What goes wrong:** `ENABLE ROW LEVEL SECURITY` alone does not prevent the table owner from bypassing policies. Without `FORCE ROW LEVEL SECURITY`, the table owner role sees all rows regardless of policies.

**How to avoid:** Both statements are required for every tenant-bearing table. Make them mandatory in the migration template. The CI assertion checks `relforcerowsecurity` in `pg_class`.

---

## Code Examples

### Complete Migration: Create Roles

```sql
-- db/migrations/000001_create_roles.up.sql
-- Create the application role (non-superuser, no BYPASSRLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_login') THEN
    CREATE ROLE app_login LOGIN PASSWORD 'changeme_in_env';
  END IF;
END $$;

GRANT app_user TO app_login;
GRANT CONNECT ON DATABASE pb_mcp TO app_user;
```

```sql
-- db/migrations/000001_create_roles.down.sql
DROP ROLE IF EXISTS app_login;
DROP ROLE IF EXISTS app_user;
```

### Complete Migration: Tenants Table (No RLS — Control Table)

```sql
-- db/migrations/000002_create_tenants.up.sql
CREATE TABLE tenants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,   -- Global uniqueness OK; tenants are not tenant-scoped
    plan       TEXT NOT NULL DEFAULT 'standard',
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenants table is NOT tenant-bearing (it IS the tenant registry) — no RLS
GRANT SELECT, INSERT, UPDATE ON tenants TO app_user;
```

### Complete Migration: api_keys Table (Tenant-Bearing)

```sql
-- db/migrations/000003_create_api_keys.up.sql
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,    -- SHA-256 of the raw key
    label       TEXT,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON api_keys TO app_user;
```

**Note:** `current_setting('app.current_tenant_id', true)` — the second argument `true` means "return NULL instead of error if the setting is not set". This prevents errors during queries that run outside a tenant context (e.g., the migration itself).

### Complete ERP Tables Migration (Sample — products)

```sql
-- db/migrations/000004_create_erp_tables.up.sql (excerpt — products table)

CREATE TABLE products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku              TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    price            NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency         TEXT NOT NULL DEFAULT 'USD',
    category         TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    reorder_point    INTEGER NOT NULL DEFAULT 0,   -- low stock threshold
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, sku)   -- scoped unique constraint, not global
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON products
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_user;
```

### Cross-Tenant Isolation Test (Vitest)

```typescript
// tests/db/rls-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

// Connect as the admin role to seed data
const adminSql = postgres(process.env.DATABASE_MIGRATION_URL!);
// Connect as app_user to verify RLS
const appSql = postgres(process.env.DATABASE_URL!);

beforeAll(async () => {
  // Insert two tenants and a product for each
  await adminSql`
    INSERT INTO tenants (id, name, slug) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'Tenant A', 'tenant-a'),
      ('b0000000-0000-0000-0000-000000000002', 'Tenant B', 'tenant-b')
    ON CONFLICT DO NOTHING
  `;
  await adminSql`
    INSERT INTO products (tenant_id, sku, name, price) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'SKU-A', 'Product A', 10.00),
      ('b0000000-0000-0000-0000-000000000002', 'SKU-B', 'Product B', 20.00)
    ON CONFLICT DO NOTHING
  `;
});

afterAll(async () => {
  await adminSql`DELETE FROM products WHERE sku IN ('SKU-A', 'SKU-B')`;
  await adminSql`DELETE FROM tenants WHERE slug IN ('tenant-a', 'tenant-b')`;
  await adminSql.end();
  await appSql.end();
});

it('Tenant A can only see their own products', async () => {
  const rows = await appSql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', 'a0000000-0000-0000-0000-000000000001', true)`;
    return tx`SELECT sku FROM products`;
  });
  expect(rows.map(r => r.sku)).toEqual(['SKU-A']);
  expect(rows.map(r => r.sku)).not.toContain('SKU-B');
});

it('Tenant B querying as Tenant A returns zero rows', async () => {
  // Set context to Tenant A, but try to read Tenant B data
  const rows = await appSql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_tenant_id', 'a0000000-0000-0000-0000-000000000001', true)`;
    // Direct query without WHERE — RLS should filter to only Tenant A rows
    return tx`SELECT * FROM products WHERE tenant_id = 'b0000000-0000-0000-0000-000000000002'`;
  });
  // RLS + the explicit WHERE should return zero rows (not Tenant B's data)
  expect(rows).toHaveLength(0);
});

it('No context set returns zero rows (not an error)', async () => {
  const rows = await appSql.begin(async (tx) => {
    // Intentionally do NOT set tenant context
    return tx`SELECT * FROM products`;
  });
  expect(rows).toHaveLength(0);
});
```

### RLS Policy Coverage Test (INFRA-07)

```typescript
// tests/db/rls-policy-coverage.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_MIGRATION_URL!);

const TENANT_BEARING_TABLES = [
  'products', 'stock_levels', 'suppliers',
  'orders', 'order_line_items', 'invoices',
  'contacts', 'api_keys',
];

afterAll(() => sql.end());

it('all tenant-bearing tables have RLS enabled and forced with at least one policy', async () => {
  const violations = await sql`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced,
      COUNT(p.policyname) AS policy_count
    FROM pg_class c
    LEFT JOIN pg_namespace n ON c.relnamespace = n.oid
    LEFT JOIN pg_policies p
      ON p.tablename = c.relname AND p.schemaname = n.nspname
    WHERE c.relkind = 'r'
      AND n.nspname = 'public'
      AND c.relname = ANY(${TENANT_BEARING_TABLES})
      AND (
        c.relrowsecurity = false
        OR c.relforcerowsecurity = false
        OR COUNT(p.policyname) = 0
      )
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
  `;

  expect(violations, `Tables missing RLS: ${JSON.stringify(violations)}`).toHaveLength(0);
});

it('kb_articles table has NO tenant_id column (global cache)', async () => {
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'kb_articles'
      AND column_name = 'tenant_id'
  `;
  expect(cols).toHaveLength(0);
});
```

---

## ERP Table Schema Reference

Derived from Phase 3 tool requirements. These columns must be present in Phase 1 migrations so Phase 3 needs no ALTER TABLE.

| Table | Key Columns | Notes |
|-------|------------|-------|
| `tenants` | `id, name, slug, plan, status, created_at, updated_at` | No tenant_id; no RLS |
| `api_keys` | `id, tenant_id, key_hash, label, status, created_at, revoked_at` | RLS |
| `products` | `id, tenant_id, sku, name, description, price, currency, category, is_active, reorder_point` | RLS; `UNIQUE(tenant_id, sku)` |
| `stock_levels` | `id, tenant_id, product_id, quantity_on_hand, warehouse_location` | RLS; FK to products |
| `suppliers` | `id, tenant_id, name, email, phone, address, notes` | RLS |
| `contacts` | `id, tenant_id, name, email, phone, company, type, tags, notes, last_contact_at` | RLS; `UNIQUE(tenant_id, email)` |
| `orders` | `id, tenant_id, contact_id, status, order_date, notes, subtotal, tax_amount, total` | RLS; FK to contacts |
| `order_line_items` | `id, tenant_id, order_id, product_id, quantity, unit_price, line_total` | RLS; FKs to orders + products |
| `invoices` | `id, tenant_id, order_id, contact_id, status, issued_at, due_at, paid_at, subtotal, tax_amount, total, notes` | RLS; FKs to orders + contacts |
| `kb_articles` | `id, youtrack_id, summary, content, tags, synced_at, content_hash` | NO tenant_id; NO RLS |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Drizzle Kit migrations (TS-generated SQL) | Plain SQL + golang-migrate | Decision in CONTEXT.md | Fully auditable; DBA-readable; no Node.js dependency in migration runner |
| SSE transport | Streamable HTTP | MCP spec March 2025 | Affects Phase 1 only in that INFRA-06 (stderr logging) is motivated by Streamable HTTP correctness |
| Per-schema tenant isolation | RLS on shared schema | 2022-2023 SaaS industry shift | Single migration run; flat operational cost at any tenant count |
| `SET` session variable | `SET LOCAL` / `set_config(..., true)` | RLS best-practice docs 2024+ | Prevents pool contamination — critical correctness requirement |
| Views without security_invoker | `CREATE VIEW ... WITH (security_invoker = true)` | PostgreSQL 15 (2022) | Views now respect caller's privileges; RLS not bypassed |

**Deprecated/outdated:**
- `ENABLE ROW LEVEL SECURITY` alone: insufficient without `FORCE ROW LEVEL SECURITY`
- `SET app.tenant = $1` (session-scoped): replaced by `SET LOCAL` / `set_config(..., true)`
- Schema-per-tenant: migration explosion, PgBouncer incompatibility, catalog bloat

---

## Open Questions

1. **PgBouncer in Phase 1 or Phase 2?**
   - What we know: postgres.js has a built-in connection pool. PgBouncer adds connection multiplexing at the proxy level.
   - What's unclear: At what tenant count does PgBouncer become necessary?
   - Recommendation (from STATE.md): Plain postgres.js pool for Phase 1 (under 50 tenants). Document PgBouncer as Phase 2 scaling step. Requires `track_extra_parameters` in PgBouncer 1.20+ for RLS session vars to survive transaction pooling.

2. **Migration URL vs App URL in Docker Compose**
   - What we know: Two separate credentials are needed.
   - What's unclear: How to present this cleanly to developers in `.env.example`.
   - Recommendation: `DATABASE_MIGRATION_URL` (admin) and `DATABASE_URL` (app_user) as separate env vars. Document distinction in `.env.example` comments.

3. **golang-migrate binary in CI — pin version or use latest?**
   - What we know: v4.19.1 is current stable (November 2025).
   - Recommendation: Pin to v4.19.1 in CI workflow. Update explicitly. Do not use `@latest` in CI scripts.

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (latest) |
| Config file | `vitest.config.ts` — Wave 0 gap |
| Quick run command | `vitest run --reporter=verbose tests/db/` |
| Full suite command | `vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Single Node.js process starts | smoke | `vitest run tests/smoke/process.test.ts` | Wave 0 |
| INFRA-02 | No stdout output from server process | integration | `vitest run tests/db/stderr-only.test.ts` | Wave 0 |
| INFRA-03 | RLS isolates tenant data in shared schema | integration | `vitest run tests/db/rls-isolation.test.ts` | Wave 0 |
| INFRA-04 | ENABLE + FORCE RLS on every tenant-bearing table | integration | `vitest run tests/db/rls-policy-coverage.test.ts` | Wave 0 |
| INFRA-05 | App role is non-superuser, has no BYPASSRLS | integration | `vitest run tests/db/app-role.test.ts` | Wave 0 |
| INFRA-06 | stderr-only logging | integration | `vitest run tests/db/stderr-only.test.ts` | Wave 0 |
| INFRA-07 | CI fails build when tenant table lacks RLS policy | ci-script | `bash scripts/assert-rls.sh` (psql query) | Wave 0 |

### Detailed Test Descriptions

**INFRA-03: Cross-Tenant Isolation** (`tests/db/rls-isolation.test.ts`)
- Seed Tenant A and Tenant B data using admin connection
- Connect as `app_user` role, set context to Tenant A, assert Tenant B rows are NOT returned
- Connect as `app_user` role, set context to Tenant B, assert Tenant A rows are NOT returned
- Connect as `app_user` role with NO context set, assert zero rows returned from any tenant table

**INFRA-04: RLS Policy Coverage** (`tests/db/rls-policy-coverage.test.ts`)
- Query `pg_class` for all tenant-bearing tables
- Assert `relrowsecurity = true` AND `relforcerowsecurity = true` for each
- Assert at least one policy in `pg_policies` for each table

**INFRA-05: App Role Verification** (`tests/db/app-role.test.ts`)
- Connect as `app_login` role
- Assert `SELECT current_setting('is_superuser') = 'off'`
- Assert `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user' OR rolname = 'app_login'` returns `false` for both
- Assert `app_login` cannot execute DDL (e.g., `CREATE TABLE` raises PermissionDenied)

**INFRA-06 + INFRA-02: stderr-only logging** (`tests/db/stderr-only.test.ts`)
- Spawn the app process as a child process capturing both stdout and stderr
- Wait for startup to complete (detect a sentinel log line on stderr)
- Assert stdout remains empty (no bytes written)
- This is a process-level test, not a unit test

**INFRA-07: CI RLS Assertion Script** (`scripts/assert-rls.sh`)
- Runs `scripts/check-rls.sql` against the test database using `psql`
- Exits with code 1 if any violations returned
- This is the CI gate — referenced in the GitHub Actions workflow

### Sampling Rate

- **Per task commit:** `vitest run tests/db/rls-isolation.test.ts tests/db/rls-policy-coverage.test.ts`
- **Per wave merge:** `vitest run`
- **Phase gate:** Full suite green + `bash scripts/assert-rls.sh` exits 0 before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — framework config with test env setup
- [ ] `tests/db/rls-isolation.test.ts` — covers INFRA-03
- [ ] `tests/db/rls-policy-coverage.test.ts` — covers INFRA-04
- [ ] `tests/db/app-role.test.ts` — covers INFRA-05
- [ ] `tests/db/stderr-only.test.ts` — covers INFRA-02 + INFRA-06
- [ ] `scripts/assert-rls.sh` — covers INFRA-07 (CI gate script)
- [ ] `scripts/check-rls.sql` — SQL query used by assert-rls.sh
- [ ] Framework install: `npm install -D vitest` — vitest not yet in package.json

---

## Sources

### Primary (HIGH confidence)
- PostgreSQL 18 docs: Row Security Policies — `pg_class.relrowsecurity`, `relforcerowsecurity` system catalog fields, `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` DDL syntax
- golang-migrate GitHub releases — v4.19.1 confirmed current stable (November 2025)
- golang-migrate CLI README — file naming convention, `migrate create -seq` flag, connection URL format
- GitHub Actions official docs — PostgreSQL service container YAML, `pg_isready` health check pattern
- postgres.js GitHub — `set_config` pattern for `SET LOCAL` equivalent in tagged-template SQL

### Secondary (MEDIUM confidence)
- Crunchy Data: "Row-Level Security for Tenants in Postgres" — RLS policy SQL patterns, session variable approach
- AWS: "Multi-tenant data isolation with PostgreSQL Row Level Security" — `FORCE ROW LEVEL SECURITY` requirement, dedicated app role pattern
- tsx/privatenumber GitHub issue #266 — `CHOKIDAR_USEPOLLING=true` required for Docker on Windows/WSL2
- betterstack.com golang-migrate guide — CLI syntax verification, connection URL format

### Tertiary (LOW confidence)
- permit.io blog: Postgres RLS Implementation Guide — role creation patterns
- Vitest + Testcontainers integration guide (Nikola Milovic, 2025-04) — snapshot/restore pattern for test isolation

---

## Metadata

**Confidence breakdown:**
- Standard stack (golang-migrate, postgres.js, vitest): HIGH — versions verified against GitHub releases
- RLS SQL patterns: HIGH — cross-referenced against PostgreSQL official docs and AWS/Crunchy Data production guides
- Docker Compose / tsx watch: HIGH for pattern; MEDIUM for Windows polling fix (confirmed in tsx GitHub issues)
- CI GitHub Actions: HIGH — official GitHub docs
- Test patterns: MEDIUM — adapted from community sources; specific vitest + postgres.js RLS test patterns not found in official docs

**Research date:** 2026-03-07
**Valid until:** 2026-09-07 (stable tooling; golang-migrate and PostgreSQL RLS patterns are stable)
