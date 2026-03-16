CREATE TABLE tenants (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,   -- Global uniqueness OK; tenants are not scoped by tenant_id
    plan       TEXT NOT NULL DEFAULT 'standard',
    status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenants table is the tenant registry itself — NOT a tenant-bearing table, NO RLS
-- app_user needs SELECT for API key resolution; INSERT/UPDATE for Phase 2 admin API
GRANT SELECT, INSERT, UPDATE ON tenants TO app_user;
