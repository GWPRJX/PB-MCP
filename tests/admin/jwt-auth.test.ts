import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { signJwt, verifyJwt } from '../../src/admin/auth-middleware.js';
import { buildServer } from '../../src/server.js';

// ---------------------------------------------------------------------------
// Setup: ensure env vars are set for JWT and server tests
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-jwt-secret-for-integration-tests';
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-admin-secret';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.ADMIN_SECRET = ADMIN_SECRET;

  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// ---------------------------------------------------------------------------
// AUTH-01: JWT signing and verification
// ---------------------------------------------------------------------------

describe('signJwt (AUTH-01)', () => {
  it('creates a valid JWT string with 3 dot-separated base64url parts', () => {
    const token = signJwt({ sub: 'admin' });
    const parts = token.split('.');

    expect(parts).toHaveLength(3);

    // Each part should be valid base64url (no +, /, or = padding)
    for (const part of parts) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('encodes the payload with iat and exp claims', () => {
    const token = signJwt({ sub: 'admin', role: 'superuser' });
    const parts = token.split('.');

    // Decode payload (middle part)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));

    expect(payload.sub).toBe('admin');
    expect(payload.role).toBe('superuser');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });
});

describe('verifyJwt (AUTH-01)', () => {
  it('accepts a valid token', () => {
    const token = signJwt({ sub: 'admin' });
    const payload = verifyJwt(token);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('admin');
  });

  it('rejects a token with wrong signature', () => {
    const token = signJwt({ sub: 'admin' });
    // Tamper with the signature (last part)
    const parts = token.split('.');
    parts[2] = parts[2].split('').reverse().join('');
    const tampered = parts.join('.');

    const payload = verifyJwt(tampered);
    expect(payload).toBeNull();
  });

  it('rejects an expired token', () => {
    // Manually craft a token with past exp
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const payloadObj = { sub: 'admin', iat: pastExp - 3600, exp: pastExp };
    const encodedPayload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');

    // Sign with correct secret to get a valid signature
    const { createHmac } = require('crypto');
    const signature = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');

    const expiredToken = `${header}.${encodedPayload}.${signature}`;
    const result = verifyJwt(expiredToken);

    expect(result).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyJwt('')).toBeNull();
    expect(verifyJwt('not.a.jwt.at.all')).toBeNull();
    expect(verifyJwt('onlyonepart')).toBeNull();
    expect(verifyJwt('two.parts')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AUTH-01: HTTP endpoint tests
// ---------------------------------------------------------------------------

describe('POST /admin/auth/login (AUTH-01)', () => {
  it('returns JWT on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/auth/login',
      payload: { username: 'admin', password: ADMIN_SECRET },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe('string');

    // The returned token should be valid
    const payload = verifyJwt(body.token);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe('admin');
  });

  it('returns 401 on invalid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/auth/login',
      payload: { username: 'admin', password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// AUTH-01: Protected admin route authentication
// ---------------------------------------------------------------------------

describe('Protected admin routes (AUTH-01)', () => {
  it('accepts JWT Bearer token', async () => {
    // Get a JWT via login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/admin/auth/login',
      payload: { username: 'admin', password: ADMIN_SECRET },
    });
    const { token } = JSON.parse(loginRes.body);

    // Use JWT to access protected route
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it('accepts X-Admin-Secret header (backward compat)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { 'x-admin-secret': ADMIN_SECRET },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it('rejects invalid JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects missing auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
    });

    expect(res.statusCode).toBe(401);
  });
});
