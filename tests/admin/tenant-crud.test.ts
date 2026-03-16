import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Tests require: running Fastify server (buildServer()), DATABASE_URL set, ADMIN_SECRET set
// Implemented in plan 02-03 (Wave 3) after admin routes exist.
// Uses fastify.inject() — no real HTTP port needed.

describe('POST /admin/tenants — create tenant (TENANT-01)', () => {
  it.todo('returns 201 with { tenantId, apiKey } on valid { name, slug, plan }');
  it.todo('apiKey begins with pb_ prefix and is 67 chars total');
  it.todo('raw apiKey is not stored in DB — only the SHA-256 hash');
  it.todo('returns 409 Conflict when slug already exists');
  it.todo('returns 400 when name is missing');
  it.todo('returns 400 when slug is missing');
  it.todo('returns 401 when X-Admin-Secret header is wrong');
  it.todo('returns 401 when X-Admin-Secret header is missing');
});

describe('GET /admin/tenants — list tenants (TENANT-02)', () => {
  it.todo('returns 200 with array of tenants including status and keyCount');
  it.todo('returns 401 when X-Admin-Secret is missing');
  it.todo('newly created tenant appears in list');
  it.todo('keyCount reflects number of active keys for tenant');
});

describe('GET /admin/tenants/:id — get tenant detail (TENANT-03)', () => {
  it.todo('returns 200 with full tenant object including apiKeys array');
  it.todo('apiKeys array contains key metadata but NOT key_hash or raw key');
  it.todo('returns 404 when tenant ID does not exist');
  it.todo('returns 401 when X-Admin-Secret is missing');
});
