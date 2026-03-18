-- Optional expiry timestamp. NULL = never expires (backward compatible).
ALTER TABLE api_keys ADD COLUMN expires_at TIMESTAMPTZ;
