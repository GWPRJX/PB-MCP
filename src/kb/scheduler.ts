import { syncKbArticles } from './sync.js';
import { getSettings, updateSyncStatus } from '../admin/settings-service.js';

/**
 * Start the KB auto-sync scheduler.
 * KB-03: Runs syncKbArticles() on a configurable interval.
 * Reads interval from DB first, falls back to KB_SYNC_INTERVAL_MS env var, default 30 min.
 * Records sync status (timestamp, count, error) to server_settings after each run.
 */
export function startKbScheduler(): void {
  // Read interval from DB, fallback to env var, default 30 min
  const runScheduler = async () => {
    const settings = await getSettings().catch(() => null);
    const intervalMs = settings?.syncIntervalMs
      ?? parseInt(process.env.KB_SYNC_INTERVAL_MS ?? '1800000', 10);

    process.stderr.write(`[kb/scheduler] Starting KB auto-sync every ${intervalMs}ms\n`);

    // Initial sync
    try {
      const result = await syncKbArticles();
      await updateSyncStatus({
        syncedAt: result.synced_at.toISOString(),
        articleCount: result.article_count,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[kb/scheduler] Initial sync failed: ${errorMsg}\n`);
      await updateSyncStatus({ syncedAt: new Date().toISOString(), articleCount: 0, error: errorMsg }).catch(() => {});
    }

    setInterval(async () => {
      try {
        const result = await syncKbArticles();
        await updateSyncStatus({
          syncedAt: result.synced_at.toISOString(),
          articleCount: result.article_count,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[kb/scheduler] Scheduled sync failed: ${errorMsg}\n`);
        await updateSyncStatus({ syncedAt: new Date().toISOString(), articleCount: 0, error: errorMsg }).catch(() => {});
      }
    }, intervalMs);
  };

  runScheduler().catch((err) => {
    process.stderr.write(`[kb/scheduler] Failed to start scheduler: ${err instanceof Error ? err.message : String(err)}\n`);
  });
}
