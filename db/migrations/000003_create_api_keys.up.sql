CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,    -- SHA-256 hex of the raw key; raw key never stored
    label       TEXT,                   -- optional human-readable name for the key
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ             -- NULL until revoked
);

-- RLS: both statements are required (ENABLE alone does not protect the table owner)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;

-- Policy: only rows where tenant_id matches the current session variable are visible
-- current_setting(..., true): second arg true = return NULL (not error) when var is unset
-- This means queries outside a tenant context see zero rows, not an error
CREATE POLICY tenant_isolation ON api_keys
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Grant DML to app_user — never ownership (table owned by migration user)
GRANT SELECT, INSERT, UPDATE ON api_keys TO app_user;
