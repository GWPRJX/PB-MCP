import { syncKbArticles } from './sync.js';

/**
 * Start the KB auto-sync scheduler.
 * KB-03: Runs syncKbArticles() on a configurable interval.
 * KB_SYNC_INTERVAL_MS defaults to 30 minutes (1_800_000 ms).
 */
export function startKbScheduler(): ReturnType<typeof setInterval> {
  const intervalMs = parseInt(process.env.KB_SYNC_INTERVAL_MS ?? '1800000', 10);

  process.stderr.write(`[kb/scheduler] Starting KB auto-sync every ${intervalMs}ms\n`);

  syncKbArticles().catch((err) => {
    process.stderr.write(`[kb/scheduler] Initial sync failed: ${err instanceof Error ? err.message : String(err)}\n`);
  });

  return setInterval(() => {
    syncKbArticles().catch((err) => {
      process.stderr.write(`[kb/scheduler] Scheduled sync failed: ${err instanceof Error ? err.message : String(err)}\n`);
    });
  }, intervalMs);
}
