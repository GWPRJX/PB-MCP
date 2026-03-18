-- Migration 000006: Add ERP connection config columns to tenants table.
-- Stores per-tenant POSibolt API credentials for live querying.
-- All columns nullable — tenant can exist without ERP config (KB-only mode).
ALTER TABLE tenants
  ADD COLUMN erp_base_url   TEXT,
  ADD COLUMN erp_client_id  TEXT,
  ADD COLUMN erp_app_secret TEXT,
  ADD COLUMN erp_username   TEXT,
  ADD COLUMN erp_password   TEXT,
  ADD COLUMN erp_terminal   TEXT;
