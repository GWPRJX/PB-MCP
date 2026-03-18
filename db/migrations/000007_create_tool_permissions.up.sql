-- Tool-level access control per tenant.
-- Default behavior: if no rows exist for a tenant, ALL tools are enabled.
-- Admin creates rows with enabled=false to disable specific tools.
CREATE TABLE tool_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tool_name   TEXT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, tool_name)
);

-- RLS isolation (same pattern as all tenant-bearing tables)
ALTER TABLE tool_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_permissions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tool_permissions
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tool_permissions TO app_user;

-- Per-key tool scoping: nullable array on api_keys.
-- NULL = inherit tenant-level permissions; non-null = restrict to listed tools only.
ALTER TABLE api_keys ADD COLUMN allowed_tools TEXT[];
