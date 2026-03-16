-- Migration 000005 rollback: remove kb_articles global cache table
REVOKE SELECT, INSERT, UPDATE, DELETE ON kb_articles FROM app_user;
DROP TABLE IF EXISTS kb_articles;
