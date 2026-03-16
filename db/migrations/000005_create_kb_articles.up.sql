-- Migration 000005: Create kb_articles global cache table
-- kb_articles is a GLOBAL cache — intentionally has NO tenant_id and NO RLS.
-- All tenants share the same YouTrack API documentation cache.
-- This is a locked decision from Phase 1 context (CONTEXT.md).
CREATE TABLE kb_articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtrack_id     TEXT NOT NULL UNIQUE,   -- YouTrack article ID (e.g., "PB-A-123")
    summary         TEXT NOT NULL,          -- Article title/summary
    content         TEXT,                   -- Full article body (may be large)
    tags            TEXT[] DEFAULT '{}',    -- Article tags from YouTrack
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_hash    TEXT                    -- SHA-256 of content for change detection
);

-- app_user needs SELECT for KB query tools, INSERT/UPDATE/DELETE for sync worker
GRANT SELECT, INSERT, UPDATE, DELETE ON kb_articles TO app_user;
-- UUID PK uses gen_random_uuid() — no sequence; grant included defensively
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
