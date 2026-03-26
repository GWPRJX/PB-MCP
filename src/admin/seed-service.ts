import { sql } from '../db/client.js';
import { createTenant, type ErpConfigInput } from './tenant-service.js';
import { logger } from '../logger.js';

/**
 * Seeds the Threadline tenant on every startup. Idempotent — skips if it
 * already exists. Threadline is the primary tenant and must be present in
 * every installation of this app.
 *
 * In development mode, also seeds a Demo Company tenant with test credentials.
 */
export async function seedDemoTenant(): Promise<void> {
  await seedThreadline();

  if (process.env.NODE_ENV === 'development') {
    await seedDemo();
  }
}

async function seedThreadline(): Promise<void> {
  const existing = await sql`SELECT id FROM tenants WHERE slug = 'threadline-mcp'`;
  if (existing.length > 0) {
    logger.info('Threadline tenant already exists, skipping seed');
    return;
  }

  const erpConfig: ErpConfigInput = {
    erpBaseUrl: process.env.DEMO_ERP_BASE_URL ?? 'https://threadline.posibolt.com',
    erpClientId: process.env.DEMO_ERP_CLIENT_ID ?? '974647',
    erpAppSecret: process.env.DEMO_ERP_APP_SECRET ?? '8661320',
    erpUsername: process.env.DEMO_ERP_USERNAME ?? 'admin',
    erpPassword: process.env.DEMO_ERP_PASSWORD ?? 'thr@1080',
    erpTerminal: process.env.DEMO_ERP_TERMINAL ?? 'Terminal 1',
  };

  try {
    const { rawApiKey } = await createTenant('threadline', 'threadline-mcp', 'standard', erpConfig);
    logger.info('Threadline tenant seeded successfully');
    process.stderr.write(`\n  Threadline API key (copy now — not stored): ${rawApiKey}\n\n`);
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'DUPLICATE_SLUG') {
      logger.info('Threadline tenant already exists, skipping seed');
      return;
    }
    throw err;
  }
}

async function seedDemo(): Promise<void> {
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
    if (err instanceof Error && (err as Error & { code?: string }).code === 'DUPLICATE_SLUG') {
      logger.info('Demo tenant already exists, skipping seed');
      return;
    }
    throw err;
  }
}
