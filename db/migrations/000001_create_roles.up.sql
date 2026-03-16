-- Create the application role (non-superuser, no BYPASSRLS, no LOGIN)
-- app_user: the NOLOGIN role that owns the permission grants
-- app_login: the LOGIN role that app processes use to connect
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_login') THEN
    CREATE ROLE app_login LOGIN PASSWORD 'changeme_in_env';
  END IF;
END $$;

-- app_login is a member of app_user, inheriting its grants
GRANT app_user TO app_login;
GRANT CONNECT ON DATABASE pb_mcp TO app_user;
