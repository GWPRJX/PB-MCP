import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Tests require: running Fastify server, admin routes from plan 02-03
// Implemented in plan 02-03 (Wave 3).

describe('POST /admin/tenants/:id/keys — issue API key (TENANT-04)', () => {
  it.todo('returns 201 with { keyId, apiKey } — raw key shown once');
  it.todo('apiKey begins with pb_ prefix');
  it.todo('new key appears in GET /admin/tenants/:id with status active');
  it.todo('key_hash in DB is SHA-256 of raw key');
  it.todo('returns 404 when tenant does not exist');
  it.todo('returns 401 when X-Admin-Secret is missing');
  it.todo('optional label field is stored when provided');
});

describe('DELETE /admin/tenants/:id/keys/:keyId — revoke API key (TENANT-05)', () => {
  it.todo('returns 204 on successful revocation');
  it.todo('revoked key immediately returns 401 on MCP request');
  it.todo('revoked key shows status=revoked in GET /admin/tenants/:id');
  it.todo('revoked_at timestamp is set on the key record');
  it.todo('returns 404 when key does not exist for this tenant');
  it.todo('returns 401 when X-Admin-Secret is missing');
  it.todo('cannot revoke a key that is already revoked (404)');
});
