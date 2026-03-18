-- scripts/check-rls.sql
-- Run as: psql $DATABASE_URL -f scripts/check-rls.sql
-- Returns rows for any tenant-bearing table that violates RLS requirements
-- CI must fail if this query returns any rows

SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced,
    COUNT(p.policyname) AS policy_count
FROM pg_class c
LEFT JOIN pg_namespace n ON c.relnamespace = n.oid
LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname
WHERE c.relkind = 'r'                     -- regular tables only
  AND n.nspname = 'public'                -- public schema
  AND c.relname IN (                      -- tenant-bearing table whitelist
      'products',
      'stock_levels',
      'suppliers',
      'orders',
      'order_line_items',
      'invoices',
      'contacts',
      'api_keys',
      'tool_permissions',
      'audit_log'
  )
  AND (
      c.relrowsecurity = false            -- RLS not enabled
      OR c.relforcerowsecurity = false    -- FORCE not set
      OR COUNT(p.policyname) = 0          -- no policies defined
  )
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;
