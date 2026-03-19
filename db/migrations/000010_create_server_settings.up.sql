-- Migration 000010: Create server_settings key-value store
-- server_settings is a GLOBAL table -- no tenant_id, no RLS.
-- Stores server-wide configuration like YouTrack credentials and sync settings.
CREATE TABLE server_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default sync interval (30 minutes in ms)
INSERT INTO server_settings (key, value) VALUES
    ('kb_sync_interval_ms', '1800000');

-- app_user needs full access to manage settings
GRANT SELECT, INSERT, UPDATE, DELETE ON server_settings TO app_user;
