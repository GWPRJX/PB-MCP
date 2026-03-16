import { describe, it } from 'vitest';

describe('RLS policy coverage (INFRA-04)', () => {
  it.todo('all tenant-bearing tables have relrowsecurity = true');
  it.todo('all tenant-bearing tables have relforcerowsecurity = true');
  it.todo('every tenant-bearing table has at least one policy in pg_policies');
  it.todo('kb_articles table has NO tenant_id column (global cache)');
});
