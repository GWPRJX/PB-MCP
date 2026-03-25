import postgres from 'postgres';
import { readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../logger.js';

/**
 * checkPendingMigrations: startup migration alert.
 *
 * Checks whether all SQL migrations in db/migrations/ have been applied.
 * Only runs when MIGRATION_ALERT=true — silent in all other cases.
 * All output goes to process.stderr.write — never console.* (INFRA-06).
 *
 * Called at server startup (Phase 2 will wire this in).
 */
export async function checkPendingMigrations(): Promise<void> {
  if (process.env.MIGRATION_ALERT !== 'true') return;

  // Count .up.sql files on disk to determine expected migration count
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(__dirname, '../../db/migrations');
  let expectedCount = 0;
  try {
    const files = await readdir(migrationsDir);
    expectedCount = files.filter((f) => f.endsWith('.up.sql')).length;
  } catch {
    logger.warn('Cannot read db/migrations directory');
    return;
  }

  const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!migrationUrl) {
    logger.warn('No database URL available for migration check');
    return;
  }

  const sql = postgres(migrationUrl);
  try {
    const result = await sql<[{ version: number }]>`
      SELECT version FROM schema_migrations
      ORDER BY version DESC
      LIMIT 1
    `;
    const appliedVersion = result[0]?.version ?? 0;
    if (appliedVersion < expectedCount) {
      logger.warn(
        { pending: expectedCount - appliedVersion, appliedVersion, expectedCount },
        'Pending migrations detected. Run npm run migrate:up',
      );
    } else {
      logger.info({ appliedVersion }, 'Migrations up to date');
    }
  } catch {
    logger.warn('schema_migrations table not found. Run npm run migrate:up');
  } finally {
    await sql.end();
  }
}
