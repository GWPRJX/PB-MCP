ALTER TABLE tenants
  DROP COLUMN IF EXISTS erp_base_url,
  DROP COLUMN IF EXISTS erp_client_id,
  DROP COLUMN IF EXISTS erp_app_secret,
  DROP COLUMN IF EXISTS erp_username,
  DROP COLUMN IF EXISTS erp_password,
  DROP COLUMN IF EXISTS erp_terminal;
