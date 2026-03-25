import { sql } from '../db/client.js';
import { createTenant, type ErpConfigInput } from './tenant-service.js';
import { logger } from '../logger.js';

/**
 * Seed a demo tenant with test POSibolt credentials in development mode.
 * No-op in production. Idempotent — skips if demo tenant already exists.
 */
export async function seedDemoTenant(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const existing = await sql`SELECT id FROM tenants WHERE slug = 'demo'`;
  if (existing.length > 0) {
    logger.info('Demo tenant already exists, skipping seed');
    return;
  }

  const erpConfig: ErpConfigInput | undefined = process.env.DEMO_ERP_BASE_URL
    ? {
        erpBaseUrl: process.env.DEMO_ERP_BASE_URL,
        erpClientId: process.env.DEMO_ERP_CLIENT_ID,
        erpAppSecret: process.env.DEMO_ERP_APP_SECRET,
        erpUsername: process.env.DEMO_ERP_USERNAME,
        erpPassword: process.env.DEMO_ERP_PASSWORD,
        erpTerminal: process.env.DEMO_ERP_TERMINAL,
      }
    : undefined;

  try {
    const { rawApiKey } = await createTenant('Demo Company', 'demo', 'free', erpConfig);
    logger.info('Demo tenant seeded successfully');
    process.stderr.write(`\n  Demo API key (copy now — not stored): ${rawApiKey}\n\n`);
  } catch (err: unknown) {
    // Race condition guard — another process may have created the tenant
    if (err instanceof Error && (err as Error & { code?: string }).code === 'DUPLICATE_SLUG') {
      logger.info('Demo tenant already exists, skipping seed');
      return;
    }
    throw err;
  }
}
