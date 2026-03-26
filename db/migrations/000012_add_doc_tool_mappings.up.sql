-- Migration 000012: Add mapped_tools column to kb_articles
-- Stores which MCP tools an uploaded API doc is relevant to.
-- Only meaningful for DOC-* rows (uploaded docs), NULL for YouTrack-synced articles.
ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS mapped_tools TEXT[] DEFAULT '{}';
