import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import postgres from 'postgres';
import { createApiKey, lookupApiKeyByHash } from '../../src/admin/tenant-service.js';

// ---------------------------------------------------------------------------
// Setup: create a test tenant via superuser SQL
// ---------------------------------------------------------------------------

const migrationUrl = process.env.DATABASE_MIGRATION_URL!;
let adminSql: ReturnType<typeof postgres>;
let tenantId: string;

beforeAll(async () => {
  adminSql = postgres(migrationUrl);

  const rows = await adminSql<{ id: string }[]>`
    INSERT INTO tenants (name, slug, plan)
    VALUES ('Expiry Test Corp', ${`expiry-test-${Date.now()}`}, 'standard')
    RETURNING id
  `;
  tenantId = rows[0].id;
});

afterAll(async () => {
  // CASCADE deletes api_keys
  if (tenantId) {
    await adminSql`DELETE FROM tenants WHERE id = ${tenantId}`;
  }
  await adminSql.end();
});

// ---------------------------------------------------------------------------
// AUTH-02: API key expiry
// ---------------------------------------------------------------------------

describe('createApiKey + lookupApiKeyByHash expiry (AUTH-02)', () => {
  it('createApiKey without expiresAt creates a key that never expires', async () => {
    const { rawKey } = await createApiKey(tenantId, 'no-expiry');
    const hash = createHash('sha256').update(rawKey).digest('hex');

    const result = await lookupApiKeyByHash(hash);
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('expired');

    // Should have the normal shape with tenantId
    if (result && !('expired' in result)) {
      expect(result.tenantId).toBe(tenantId);
      expect(result.status).toBe('active');
    }
  });

  it('createApiKey with future expiresAt creates a valid key', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const { rawKey } = await createApiKey(tenantId, 'future-expiry', futureDate.toISOString());
    const hash = createHash('sha256').update(rawKey).digest('hex');

    const result = await lookupApiKeyByHash(hash);
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('expired');

    if (result && !('expired' in result)) {
      expect(result.tenantId).toBe(tenantId);
      expect(result.status).toBe('active');
    }
  });

  it('createApiKey with past expiresAt creates an expired key', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    const { rawKey } = await createApiKey(tenantId, 'past-expiry', pastDate.toISOString());
    const hash = createHash('sha256').update(rawKey).digest('hex');

    const result = await lookupApiKeyByHash(hash);
    expect(result).toEqual({ expired: true });
  });

  it('lookupApiKeyByHash returns null for non-existent hash', async () => {
    const fakeHash = createHash('sha256').update('pb_nonexistent_key_12345').digest('hex');
    const result = await lookupApiKeyByHash(fakeHash);

    expect(result).toBeNull();
  });

  it('lookupApiKeyByHash returns null for revoked key', async () => {
    // Create a key, then revoke it via direct SQL
    const { rawKey, apiKey } = await createApiKey(tenantId, 'to-revoke');
    const hash = createHash('sha256').update(rawKey).digest('hex');

    // Revoke via superuser SQL (bypasses RLS)
    await adminSql`
      UPDATE api_keys
      SET status = 'revoked', revoked_at = now()
      WHERE id = ${apiKey.id}
    `;

    const result = await lookupApiKeyByHash(hash);
    expect(result).toBeNull();
  });
});
