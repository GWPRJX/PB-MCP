import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `keys-test-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let keyId: string; // a key we create in beforeAll for revocation tests

beforeAll(async () => {
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  app = await buildServer();
  await app.ready();

  // Create test tenant
  const createRes = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { name: 'Key Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(createRes.statusCode).toBe(201);
  tenantId = JSON.parse(createRes.body).tenantId;

  // Create a second key for revocation tests
  const keyRes = await app.inject({
    method: 'POST',
    url: `/admin/tenants/${tenantId}/keys`,
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { label: 'test-key-for-revocation' },
  });
  expect(keyRes.statusCode).toBe(201);
  keyId = JSON.parse(keyRes.body).keyId;
});

afterAll(async () => {
  // Must use DATABASE_MIGRATION_URL (superuser) — app_login lacks DELETE on tenants
  if (tenantId) {
    const cleanupSql = postgres(process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '');
    await cleanupSql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await cleanupSql.end();
  }
  await app.close();
});

describe('POST /admin/tenants/:id/keys — issue API key (TENANT-04)', () => {
  it('returns 201 with { keyId, apiKey }', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/keys`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: { label: 'integration-key' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.keyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.apiKey).toMatch(/^pb_[0-9a-f]{64}$/);
  });

  it('apiKey begins with pb_ prefix', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/keys`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).apiKey.startsWith('pb_')).toBe(true);
  });

  it('optional label field is stored when provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/keys`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: { label: 'my-labeled-key' },
    });
    expect(res.statusCode).toBe(201);
    // Verify label appears in tenant detail
    const detailRes = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    const detail = JSON.parse(detailRes.body);
    expect(detail.apiKeys.some((k: { label: string }) => k.label === 'my-labeled-key')).toBe(true);
  });

  it('returns 404 when tenant does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants/00000000-0000-0000-0000-000000000000/keys',
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when X-Admin-Secret is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/keys`,
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /admin/tenants/:id/keys/:keyId — revoke API key (TENANT-05)', () => {
  it('returns 204 on successful revocation', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}/keys/${keyId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(204);
  });

  it('revoked key shows status=revoked in GET /admin/tenants/:id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    const body = JSON.parse(res.body);
    const revokedKey = body.apiKeys.find((k: { id: string }) => k.id === keyId);
    expect(revokedKey?.status).toBe('revoked');
    expect(revokedKey?.revokedAt).toBeTruthy();
  });

  it('returns 404 for already-revoked key', async () => {
    // keyId was revoked in previous test
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}/keys/${keyId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when key does not exist for this tenant', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}/keys/00000000-0000-0000-0000-000000000000`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when X-Admin-Secret is missing', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenantId}/keys/${keyId}`,
    });
    expect(res.statusCode).toBe(401);
  });
});
