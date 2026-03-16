import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';
import postgres from 'postgres';

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';
const SLUG_PREFIX = `test-${Date.now()}`;

let app: FastifyInstance;
let tenantId: string;
let apiKey: string;

beforeAll(async () => {
  // Ensure ADMIN_SECRET is set for tests
  process.env.ADMIN_SECRET = ADMIN_SECRET;
  app = await buildServer();
  await app.ready();

  // Create a test tenant
  const res = await app.inject({
    method: 'POST',
    url: '/admin/tenants',
    headers: { 'x-admin-secret': ADMIN_SECRET },
    payload: { name: 'Test Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
  });
  expect(res.statusCode).toBe(201);
  const body = JSON.parse(res.body);
  tenantId = body.tenantId;
  apiKey = body.apiKey;
});

afterAll(async () => {
  // Cleanup: delete test tenant (cascades to api_keys via FK)
  // Must use DATABASE_MIGRATION_URL (superuser) — app_login lacks DELETE on tenants
  if (tenantId) {
    const cleanupSql = postgres(process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '');
    await cleanupSql`DELETE FROM tenants WHERE id = ${tenantId}`;
    await cleanupSql.end();
  }
  await app.close();
});

describe('POST /admin/tenants — create tenant (TENANT-01)', () => {
  it('returns 201 with { tenantId, apiKey } on valid input', () => {
    expect(tenantId).toMatch(/^[0-9a-f-]{36}$/);
    expect(apiKey).toMatch(/^pb_[0-9a-f]{64}$/);
  });

  it('apiKey begins with pb_ prefix and is 67 chars total', () => {
    expect(apiKey).toHaveLength(67);
    expect(apiKey.startsWith('pb_')).toBe(true);
  });

  it('returns 409 Conflict when slug already exists', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: { name: 'Duplicate Corp', slug: `${SLUG_PREFIX}-main`, plan: 'standard' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: { slug: `${SLUG_PREFIX}-noname`, plan: 'standard' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when slug is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': ADMIN_SECRET },
      payload: { name: 'No Slug Corp', plan: 'standard' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 when X-Admin-Secret header is wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': 'wrong-secret' },
      payload: { name: 'Hacker Corp', slug: `${SLUG_PREFIX}-hacker`, plan: 'standard' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when X-Admin-Secret header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      payload: { name: 'No Auth Corp', slug: `${SLUG_PREFIX}-noauth`, plan: 'standard' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /admin/tenants — list tenants (TENANT-02)', () => {
  it('returns 200 with array of tenants including keyCount', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    // Find our test tenant
    const found = body.find((t: { id: string }) => t.id === tenantId);
    expect(found).toBeDefined();
    expect(typeof found.keyCount).toBe('number');
    expect(found.keyCount).toBeGreaterThanOrEqual(1); // initial key created on tenant creation
  });

  it('returns 401 when X-Admin-Secret is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/tenants' });
    expect(res.statusCode).toBe(401);
  });

  it('newly created tenant appears in list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    const body = JSON.parse(res.body);
    expect(body.some((t: { id: string }) => t.id === tenantId)).toBe(true);
  });
});

describe('GET /admin/tenants/:id — get tenant detail (TENANT-03)', () => {
  it('returns 200 with full tenant object including apiKeys array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe(tenantId);
    expect(Array.isArray(body.apiKeys)).toBe(true);
    expect(body.apiKeys.length).toBeGreaterThanOrEqual(1);
  });

  it('apiKeys array does not contain key_hash or raw key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantId}`,
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    const body = JSON.parse(res.body);
    for (const key of body.apiKeys) {
      expect(key.keyHash).toBeUndefined();
      expect(key.key_hash).toBeUndefined();
    }
  });

  it('returns 404 when tenant ID does not exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants/00000000-0000-0000-0000-000000000000',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 when X-Admin-Secret is missing', async () => {
    const res = await app.inject({ method: 'GET', url: `/admin/tenants/${tenantId}` });
    expect(res.statusCode).toBe(401);
  });
});
