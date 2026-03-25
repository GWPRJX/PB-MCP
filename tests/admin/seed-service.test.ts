import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockLogger, mockSql, mockCreateTenant } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  mockSql: vi.fn().mockResolvedValue([]),
  mockCreateTenant: vi.fn().mockResolvedValue({ rawApiKey: 'pb_testapikey123' }),
}));

vi.mock('../../src/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../src/db/client.js', () => ({ sql: mockSql }));
vi.mock('../../src/admin/tenant-service.js', () => ({ createTenant: mockCreateTenant }));

import { seedDemoTenant } from '../../src/admin/seed-service.js';

describe('seedDemoTenant()', () => {
  const savedNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue([]);
    mockCreateTenant.mockResolvedValue({ rawApiKey: 'pb_testapikey123' });
    process.env.NODE_ENV = 'development';
    delete process.env.DEMO_ERP_BASE_URL;
    delete process.env.DEMO_ERP_CLIENT_ID;
    delete process.env.DEMO_ERP_APP_SECRET;
    delete process.env.DEMO_ERP_USERNAME;
    delete process.env.DEMO_ERP_PASSWORD;
    delete process.env.DEMO_ERP_TERMINAL;
  });

  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
  });

  it('is no-op in production', async () => {
    process.env.NODE_ENV = 'production';
    await seedDemoTenant();
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCreateTenant).not.toHaveBeenCalled();
  });

  it('is no-op when NODE_ENV is not development', async () => {
    process.env.NODE_ENV = 'staging';
    await seedDemoTenant();
    expect(mockSql).not.toHaveBeenCalled();
    expect(mockCreateTenant).not.toHaveBeenCalled();
  });

  it('creates tenant when none exists', async () => {
    process.env.NODE_ENV = 'development';
    await seedDemoTenant();
    expect(mockCreateTenant).toHaveBeenCalledWith('Demo Company', 'demo', 'free', undefined);
    expect(mockLogger.info).toHaveBeenCalledWith('Demo tenant seeded successfully');
  });

  it('skips when demo tenant already exists', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'existing-id' }]);
    await seedDemoTenant();
    expect(mockCreateTenant).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Demo tenant already exists, skipping seed');
  });

  it('handles DUPLICATE_SLUG gracefully (race condition)', async () => {
    const err = new Error("Tenant with slug 'demo' already exists") as Error & { code: string };
    err.code = 'DUPLICATE_SLUG';
    mockCreateTenant.mockRejectedValueOnce(err);

    await seedDemoTenant();
    expect(mockLogger.info).toHaveBeenCalledWith('Demo tenant already exists, skipping seed');
  });

  it('re-throws non-DUPLICATE_SLUG errors', async () => {
    mockCreateTenant.mockRejectedValueOnce(new Error('DB connection failed'));
    await expect(seedDemoTenant()).rejects.toThrow('DB connection failed');
  });

  it('passes ERP config from env vars when DEMO_ERP_BASE_URL is set', async () => {
    process.env.DEMO_ERP_BASE_URL = 'https://test.posibolt.com';
    process.env.DEMO_ERP_CLIENT_ID = 'test-client';
    process.env.DEMO_ERP_APP_SECRET = 'test-secret';
    process.env.DEMO_ERP_USERNAME = 'test-user';
    process.env.DEMO_ERP_PASSWORD = 'test-pass';
    process.env.DEMO_ERP_TERMINAL = 'Terminal 1';

    await seedDemoTenant();

    expect(mockCreateTenant).toHaveBeenCalledWith('Demo Company', 'demo', 'free', {
      erpBaseUrl: 'https://test.posibolt.com',
      erpClientId: 'test-client',
      erpAppSecret: 'test-secret',
      erpUsername: 'test-user',
      erpPassword: 'test-pass',
      erpTerminal: 'Terminal 1',
    });
  });

  it('passes undefined ERP config when DEMO_ERP_BASE_URL is not set', async () => {
    await seedDemoTenant();
    expect(mockCreateTenant).toHaveBeenCalledWith('Demo Company', 'demo', 'free', undefined);
  });
});
