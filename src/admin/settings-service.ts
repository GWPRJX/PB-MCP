import { sql } from '../db/client.js';

export interface KbSettings {
  youtrackBaseUrl: string | null;
  youtrackToken: string | null;
  youtrackProject: string | null;
  youtrackQuery: string | null;
  syncIntervalMs: number;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncArticleCount: number | null;
  lastSyncError: string | null;
  totalArticleCount: number;
}

const SETTINGS_KEYS = {
  youtrackBaseUrl: 'youtrack_base_url',
  youtrackToken: 'youtrack_token',
  youtrackProject: 'youtrack_project',
  youtrackQuery: 'youtrack_query',
  syncIntervalMs: 'kb_sync_interval_ms',
  lastSyncAt: 'kb_last_sync_at',
  lastSyncArticleCount: 'kb_last_sync_article_count',
  lastSyncError: 'kb_last_sync_error',
} as const;

/**
 * Retrieve the current KB (YouTrack) settings from the database.
 *
 * Reads `youtrack_base_url`, `youtrack_token`, `youtrack_project`, and
 * `kb_sync_interval_ms` from `server_settings`. Missing keys fall back to
 * `null` or the default interval of 1 800 000 ms (30 minutes).
 *
 * @returns Resolved KB settings object.
 */
export async function getSettings(): Promise<KbSettings> {
  const rows = await sql`
    SELECT key, value FROM server_settings
    WHERE key IN (
      ${SETTINGS_KEYS.youtrackBaseUrl},
      ${SETTINGS_KEYS.youtrackToken},
      ${SETTINGS_KEYS.youtrackProject},
      ${SETTINGS_KEYS.youtrackQuery},
      ${SETTINGS_KEYS.syncIntervalMs}
    )
  `;
  const map = new Map((rows as unknown as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return {
    youtrackBaseUrl: map.get(SETTINGS_KEYS.youtrackBaseUrl) ?? null,
    youtrackToken: map.get(SETTINGS_KEYS.youtrackToken) ?? null,
    youtrackProject: map.get(SETTINGS_KEYS.youtrackProject) ?? null,
    youtrackQuery: map.get(SETTINGS_KEYS.youtrackQuery) ?? null,
    syncIntervalMs: parseInt(map.get(SETTINGS_KEYS.syncIntervalMs) ?? '1800000', 10),
  };
}

/**
 * Persist one or more KB settings to the database using upsert.
 *
 * Only the keys present in `settings` are written; omitted keys are left
 * unchanged. Null values clear the stored string to an empty string.
 *
 * @param settings - Partial KB settings to update.
 */
export async function updateSettings(settings: Partial<Omit<KbSettings, 'syncIntervalMs'> & { syncIntervalMs?: number }>): Promise<void> {
  const entries: [string, string][] = [];
  if (settings.youtrackBaseUrl !== undefined) entries.push([SETTINGS_KEYS.youtrackBaseUrl, settings.youtrackBaseUrl ?? '']);
  if (settings.youtrackToken !== undefined) entries.push([SETTINGS_KEYS.youtrackToken, settings.youtrackToken ?? '']);
  if (settings.youtrackProject !== undefined) entries.push([SETTINGS_KEYS.youtrackProject, settings.youtrackProject ?? '']);
  if (settings.youtrackQuery !== undefined) entries.push([SETTINGS_KEYS.youtrackQuery, settings.youtrackQuery ?? '']);
  if (settings.syncIntervalMs !== undefined) entries.push([SETTINGS_KEYS.syncIntervalMs, String(settings.syncIntervalMs)]);

  if (entries.length === 0) return;

  for (const [key, value] of entries) {
    await sql`
      INSERT INTO server_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;
  }
}

/**
 * Retrieve the current KB sync status from the database.
 *
 * Returns the timestamp and article count from the last sync run, any error
 * message from the last run, and the total count of articles currently stored
 * in `kb_articles`.
 *
 * @returns Resolved sync status object.
 */
export async function getSyncStatus(): Promise<SyncStatus> {
  const settingsRows = await sql`
    SELECT key, value FROM server_settings
    WHERE key IN (
      ${SETTINGS_KEYS.lastSyncAt},
      ${SETTINGS_KEYS.lastSyncArticleCount},
      ${SETTINGS_KEYS.lastSyncError}
    )
  `;
  const map = new Map((settingsRows as unknown as { key: string; value: string }[]).map((r) => [r.key, r.value]));

  const [countRow] = await sql`SELECT COUNT(*)::int AS count FROM kb_articles` as [{ count: number }];

  return {
    lastSyncAt: map.get(SETTINGS_KEYS.lastSyncAt) ?? null,
    lastSyncArticleCount: map.get(SETTINGS_KEYS.lastSyncArticleCount) ? parseInt(map.get(SETTINGS_KEYS.lastSyncArticleCount)!, 10) : null,
    lastSyncError: map.get(SETTINGS_KEYS.lastSyncError) ?? null,
    totalArticleCount: countRow.count,
  };
}

/**
 * Persist the outcome of a KB sync run to the database.
 *
 * Upserts `kb_last_sync_at`, `kb_last_sync_article_count`, and
 * `kb_last_sync_error`. An empty string is stored when no error occurred.
 *
 * @param result - Sync result containing the timestamp, article count, and optional error message.
 */
export async function updateSyncStatus(result: { syncedAt: string; articleCount: number; error?: string }): Promise<void> {
  const entries: [string, string][] = [
    [SETTINGS_KEYS.lastSyncAt, result.syncedAt],
    [SETTINGS_KEYS.lastSyncArticleCount, String(result.articleCount)],
    [SETTINGS_KEYS.lastSyncError, result.error ?? ''],
  ];
  for (const [key, value] of entries) {
    await sql`
      INSERT INTO server_settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
    `;
  }
}
