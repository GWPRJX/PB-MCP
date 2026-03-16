import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// These tests require: migrations applied, app_login role exists, DATABASE_URL + DATABASE_MIGRATION_URL set
// They will be implemented (stubs replaced) in plan 01-03 after migrations exist.

describe('RLS cross-tenant isolation (INFRA-03)', () => {
  it.todo('Tenant A can only see their own products when context is set to Tenant A');
  it.todo('Tenant B querying with Tenant A context returns zero rows');
  it.todo('No context set returns zero rows from any tenant table (not an error)');
  it.todo('Cross-tenant isolation holds for: stock_levels');
  it.todo('Cross-tenant isolation holds for: orders');
  it.todo('Cross-tenant isolation holds for: invoices');
  it.todo('Cross-tenant isolation holds for: contacts');
});
