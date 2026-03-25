import { syncKbArticles } from './sync.js';
import { getSettings, updateSyncStatus } from '../admin/settings-service.js';
import { logger } from '../logger.js';

/**
 * Start the KB auto-sync scheduler.
 * Awaits initial sync so KB data is ready before the server starts listening.
 * Schedules recurring syncs on a configurable interval afterward.
 *
 * KB-03: Runs syncKbArticles() on a configurable interval.
 * Reads interval from DB first, falls back to KB_SYNC_INTERVAL_MS env var, default 30 min.
 * Records sync status (timestamp, count, error) to server_settings after each run.
 */
export async function startKbScheduler(): Promise<NodeJS.Timeout> {
  const settings = await getSettings().catch(() => null);
  const intervalMs = settings?.syncIntervalMs
    ?? parseInt(process.env.KB_SYNC_INTERVAL_MS ?? '1800000', 10);

  logger.info({ intervalMs }, 'Starting KB auto-sync');

  // Initial sync — blocks until complete (30s timeout prevents hanging startup)
  try {
    const result = await Promise.race([
      syncKbArticles(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('KB bootstrap sync timed out after 30s')), 30_000)
      ),
    ]);
    await updateSyncStatus({
      syncedAt: result.synced_at.toISOString(),
      articleCount: result.article_count,
    });
    logger.info({ count: result.article_count }, 'KB bootstrap sync complete');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, 'KB bootstrap sync failed — will retry on schedule');
    await updateSyncStatus({
      syncedAt: new Date().toISOString(),
      articleCount: 0,
      error: errorMsg,
    }).catch(() => {});
  }

  // Schedule recurring sync (non-blocking) — return handle for graceful shutdown
  const handle = setInterval(async () => {
    try {
      const result = await syncKbArticles();
      await updateSyncStatus({
        syncedAt: result.synced_at.toISOString(),
        articleCount: result.article_count,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Scheduled sync failed');
      await updateSyncStatus({
        syncedAt: new Date().toISOString(),
        articleCount: 0,
        error: errorMsg,
      }).catch(() => {});
    }
  }, intervalMs);

  return handle;
}
