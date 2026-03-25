/**
 * POSibolt REST API client.
 *
 * Handles OAuth 2.0 token acquisition, caching, and typed HTTP requests
 * against a tenant's POSibolt instance.
 *
 * Token cache is per-tenant (keyed by baseUrl + username).
 * Tokens auto-refresh when within 60s of expiry.
 */

import { logger } from '../logger.js';

/** Returns true for errors that are safe to retry (transient network/server issues). */
function isTransient(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|UND_ERR_SOCKET|fetch failed/i.test(msg)) return true;
    if (/\b(502|503|504)\b/.test(msg)) return true;
  }
  return false;
}

/** Retry wrapper with exponential backoff for transient errors. */
async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries || !isTransient(err)) throw err;
      const delayMs = 1000 * Math.pow(2, attempt);
      logger.warn({ attempt: attempt + 1, maxRetries, delayMs, error: (err as Error).message }, `${label} transient error, retrying`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Unreachable');
}

export interface PosiboltConfig {
  baseUrl: string;      // e.g. https://your-instance.posibolt.com
  clientId: string;     // OAuth client_id
  appSecret: string;    // OAuth app_secret
  username: string;     // POSibolt login username
  password: string;     // POSibolt login password
  terminal: string;     // Terminal name (e.g. "Terminal 1")
}

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Derive a token cache key from a POSibolt config.
 *
 * Combines `baseUrl` and `username` so each unique tenant+user pair
 * maintains its own cached token.
 *
 * @param config - POSibolt connection config.
 * @returns Cache key string in the form `"<baseUrl>|<username>"`.
 */
function cacheKey(config: PosiboltConfig): string {
  return `${config.baseUrl}|${config.username}`;
}

/**
 * Get a valid OAuth access token, using cache when possible.
 * Refreshes automatically when token is within 60s of expiry.
 */
export async function getToken(config: PosiboltConfig): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  const basicAuth = Buffer.from(`${config.clientId}:${config.appSecret}`).toString('base64');
  const params = new URLSearchParams({
    username: config.username,
    password: config.password,
    terminal: config.terminal,
    grant_type: 'password',
  });

  const url = `${config.baseUrl}/AdempiereService/oauth/token?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POSibolt OAuth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  tokenCache.set(key, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

/**
 * Authenticated GET request to a POSibolt REST endpoint.
 * @param path  Path after /AdempiereService/PosiboltRest (e.g. "/productmaster/search")
 * @param params  Query parameters
 */
export async function pbGet<T = unknown>(
  config: PosiboltConfig,
  path: string,
  params?: Record<string, string | number | boolean>,
): Promise<T> {
  let token = await getToken(config);
  const url = new URL(`${config.baseUrl}/AdempiereService/PosiboltRest${path}`);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  return withRetry(async () => {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 401) {
      // Token expired server-side — invalidate cache and retry with fresh token
      invalidateToken(config);
      token = await getToken(config);
      const retryRes = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!retryRes.ok) {
        const text = await retryRes.text();
        throw new Error(`POSibolt GET ${path} failed (${retryRes.status}): ${text}`);
      }
      return retryRes.json() as Promise<T>;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POSibolt GET ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }, `pbGet(${path})`);
}

/**
 * Authenticated POST request to a POSibolt REST endpoint.
 */
export async function pbPost<T = unknown>(
  config: PosiboltConfig,
  path: string,
  body: unknown,
): Promise<T> {
  let token = await getToken(config);
  const url = `${config.baseUrl}/AdempiereService/PosiboltRest${path}`;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      // Token expired server-side — invalidate cache and retry with fresh token
      invalidateToken(config);
      token = await getToken(config);
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!retryRes.ok) {
        const text = await retryRes.text();
        throw new Error(`POSibolt POST ${path} failed (${retryRes.status}): ${text}`);
      }
      return retryRes.json() as Promise<T>;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POSibolt POST ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  }, `pbPost(${path})`);
}

/**
 * Invalidate cached token for a tenant config.
 * Call this when a 401 is received to force re-authentication.
 */
export function invalidateToken(config: PosiboltConfig): void {
  tokenCache.delete(cacheKey(config));
}
