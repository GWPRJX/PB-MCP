-- Audit log for MCP tool calls. Append-only — no UPDATE, no DELETE by app.
CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_id        UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    tool_name     TEXT NOT NULL,
    params        JSONB,
    status        TEXT NOT NULL CHECK (status IN ('success', 'error')),
    error_message TEXT,
    duration_ms   INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries by tenant + time
CREATE INDEX idx_audit_log_tenant_time ON audit_log (tenant_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON audit_log
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- App can only read and insert — never update or delete audit records
GRANT SELECT, INSERT ON audit_log TO app_user;
