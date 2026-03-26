const BASE = '/admin';

let token = '';

/**
 * Stores the JWT in module memory and persists it to localStorage so it
 * survives page reloads.
 * @param t - The JWT string returned by the login endpoint.
 */
export function setToken(t: string) {
  token = t;
  localStorage.setItem('jwt_token', t);
}

/**
 * Returns the current JWT. Hydrates from localStorage on first call if the
 * in-memory value is empty (e.g. after a page reload).
 * @returns The stored JWT string, or an empty string if not authenticated.
 */
export function getToken(): string {
  if (!token) {
    token = localStorage.getItem('jwt_token') ?? '';
  }
  return token;
}

/**
 * Clears the JWT from both module memory and localStorage. Called on logout
 * or when the server returns a 401 response.
 */
export function clearToken() {
  token = '';
  localStorage.removeItem('jwt_token');
}

/**
 * Authenticates against the admin login endpoint.
 * @param username - Admin username.
 * @param password - Admin password.
 * @returns The JWT string on success.
 * @throws If credentials are invalid (401) or the server returns another error.
 */
export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (res.status === 401) {
    throw new Error('Invalid credentials');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const body = await res.json();
  return body.token;
}

/**
 * Authenticated HTTP helper. Attaches the stored JWT as a Bearer token,
 * handles 401 by clearing the token and reloading, and parses JSON responses.
 * Returns `undefined` for 204 No Content responses.
 * @param path - Path relative to the admin base URL (e.g. `/tenants`).
 * @param opts - Standard `fetch` init options (method, body, extra headers).
 * @returns Parsed response body typed as `T`.
 * @throws On non-2xx responses with the server's error message or HTTP status.
 */
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${getToken()}`,
  };
  if (opts.body) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...headers,
      ...opts.headers as Record<string, string>,
    },
  });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Tenant types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  keyCount: number;
  createdAt: string;
}

export interface TenantDetail extends Tenant {
  updatedAt: string;
  apiKeys: ApiKey[];
  erpBaseUrl?: string | null;
  erpClientId?: string | null;
  erpAppSecret?: string | null;
  erpUsername?: string | null;
  erpPassword?: string | null;
  erpTerminal?: string | null;
}

export interface ApiKey {
  id: string;
  label: string | null;
  status: string;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
  allowedTools: string[] | null;
}

export interface ToolPermission {
  toolName: string;
  enabled: boolean;
}

export interface AuditEntry {
  id: string;
  toolName: string;
  keyId: string | null;
  params: unknown;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

// KB doc types
export interface KbDoc {
  id: string;
  youtrackId: string;
  title: string;
  tags: string[];
  createdAt: string;
}

export interface KbDocFull extends KbDoc {
  content: string;
}

// KB Settings types
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

// API functions

/** Fetches the full list of tenants. */
export const listTenants = () => api<Tenant[]>('/tenants');

/**
 * Fetches full detail for a single tenant, including API keys and ERP config.
 * @param id - Tenant UUID.
 */
export const getTenant = (id: string) => api<TenantDetail>(`/tenants/${id}`);

/**
 * Creates a new tenant with optional ERP credentials.
 * @param data - Tenant fields including name, slug, plan, and optional ERP config.
 * @returns The new tenant's UUID and its initial plaintext API key (shown once only).
 */
export const createTenant = (data: {
  name: string;
  slug: string;
  plan?: string;
  erpBaseUrl?: string;
  erpClientId?: string;
  erpAppSecret?: string;
  erpUsername?: string;
  erpPassword?: string;
  erpTerminal?: string;
}) =>
  api<{ tenantId: string; apiKey: string }>('/tenants', {
    method: 'POST',
    body: JSON.stringify(data),
  });

/**
 * Issues a new API key for a tenant.
 * @param tenantId - Tenant UUID.
 * @param label - Optional human-readable label for the key.
 * @param expiresAt - Optional ISO 8601 expiry datetime; pass null for no expiry.
 * @returns The new key's UUID and plaintext secret (shown once only).
 */
export const createApiKey = (tenantId: string, label?: string, expiresAt?: string | null) =>
  api<{ keyId: string; apiKey: string }>(`/tenants/${tenantId}/keys`, {
    method: 'POST',
    body: JSON.stringify({ label, expiresAt: expiresAt || undefined }),
  });

/**
 * Permanently revokes an API key. Revoked keys cannot be reinstated.
 * @param tenantId - Tenant UUID.
 * @param keyId - Key UUID to revoke.
 */
export const revokeApiKey = (tenantId: string, keyId: string) =>
  api<void>(`/tenants/${tenantId}/keys/${keyId}`, { method: 'DELETE' });

/**
 * Fetches the enabled/disabled state of every MCP tool for a tenant.
 * @param tenantId - Tenant UUID.
 */
export const getToolPermissions = (tenantId: string) =>
  api<ToolPermission[]>(`/tenants/${tenantId}/tools`);

/**
 * Replaces the tool permission set for a tenant.
 * @param tenantId - Tenant UUID.
 * @param permissions - Full list of tool permissions to save.
 * @returns The updated permission list as persisted by the server.
 */
export const updateToolPermissions = (tenantId: string, permissions: ToolPermission[]) =>
  api<ToolPermission[]>(`/tenants/${tenantId}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });

/**
 * Sets a per-key tool allowlist, restricting which MCP tools this key may call.
 * Pass `null` to remove the restriction and inherit the tenant's tool permissions.
 * @param tenantId - Tenant UUID.
 * @param keyId - Key UUID to scope.
 * @param allowedTools - Array of tool names to allow, or `null` for tenant defaults.
 */
export const updateKeyAllowedTools = (tenantId: string, keyId: string, allowedTools: string[] | null) =>
  api<{ updated: boolean }>(`/tenants/${tenantId}/keys/${keyId}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ allowedTools }),
  });

/**
 * Updates the POSibolt ERP credentials for a tenant.
 * @param tenantId - Tenant UUID.
 * @param config - Partial or full ERP config fields to overwrite.
 */
export const updateErpConfig = (tenantId: string, config: Record<string, string>) =>
  api<{ updated: boolean }>(`/tenants/${tenantId}/erp-config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });

/**
 * Tests the saved ERP connection for an existing tenant using its stored credentials.
 * @param tenantId - Tenant UUID.
 * @returns Connection result with a human-readable message.
 */
export const testConnection = (tenantId: string) =>
  api<{ connected: boolean; message: string }>(`/tenants/${tenantId}/test-connection`, {
    method: 'POST',
  });

/**
 * Tests a set of ERP credentials without saving them. Used during tenant
 * creation to verify credentials before the tenant record is written.
 * @param credentials - Full set of POSibolt connection fields to test.
 * @returns Connection result with a human-readable message.
 */
export const testErpCredentials = (credentials: {
  erpBaseUrl: string;
  erpClientId: string;
  erpAppSecret: string;
  erpUsername: string;
  erpPassword: string;
  erpTerminal: string;
}) =>
  api<{ connected: boolean; message: string }>('/test-erp-credentials', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

/**
 * Fetches paginated audit log entries for a tenant, with optional filtering.
 * @param tenantId - Tenant UUID.
 * @param params.limit - Maximum number of entries to return (default server-side).
 * @param params.offset - Number of entries to skip for pagination.
 * @param params.toolName - Filter to entries for a specific tool name.
 * @param params.status - Filter to entries with a specific status (`success` or `error`).
 * @returns Paginated entries and total count.
 */
export const getAuditLog = (tenantId: string, params?: { limit?: number; offset?: number; toolName?: string; status?: string }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.toolName) qs.set('toolName', params.toolName);
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return api<{ entries: AuditEntry[]; totalCount: number }>(`/tenants/${tenantId}/audit-log${q ? `?${q}` : ''}`);
};

/** Tool registry entry returned by GET /admin/tools. */
export interface ToolRegistryEntry {
  id: string;
  toolName: string;
  displayName: string;
  description: string | null;
  category: string;
  source: 'builtin' | 'youtrack' | 'uploaded';
  isActive: boolean;
}

/** Returns all registered MCP tools from the tool registry. */
export const listToolRegistry = () => api<ToolRegistryEntry[]>('/tools');

/** Toggles a tool's active state in the global registry. */
export const toggleTool = (toolName: string) =>
  api<{ toolName: string; isActive: boolean }>(`/tools/${toolName}/toggle`, { method: 'PUT' });

/** Returns the names of every MCP tool registered on the server. */
export const listAllTools = async (): Promise<string[]> => {
  const tools = await listToolRegistry();
  return tools.map((t) => t.toolName);
};

/**
 * Triggers an immediate YouTrack sync, pulling new and updated articles.
 * @returns Sync result with the number of articles processed.
 */
export const refreshKb = () =>
  api<{ synced: boolean; article_count: number }>('/kb/refresh', { method: 'POST' });

// KB doc CRUD

/**
 * Uploads a new manually-authored document to the knowledge base.
 * @param data.title - Document title.
 * @param data.content - Markdown content body.
 * @param data.tags - Optional array of tags for filtering.
 * @returns The created {@link KbDoc} metadata record.
 */
export const uploadDoc = (data: { title: string; content: string; tags?: string[] }) =>
  api<KbDoc>('/kb/upload', { method: 'POST', body: JSON.stringify(data) });

/**
 * Lists manually-uploaded KB documents with pagination.
 * @param params.limit - Maximum number of documents to return.
 * @param params.offset - Number of documents to skip for pagination.
 * @returns Paginated document metadata and total count.
 */
export const listDocs = (params?: { limit?: number; offset?: number }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return api<{ docs: KbDoc[]; totalCount: number }>(`/kb/docs${q ? `?${q}` : ''}`);
};

/**
 * Fetches a single KB document including its full Markdown content.
 * @param id - Document UUID.
 */
export const getDoc = (id: string) =>
  api<KbDocFull>(`/kb/docs/${id}`);

/**
 * Updates an existing KB document's title, content, or tags.
 * @param id - Document UUID.
 * @param data - Fields to update (all optional).
 */
export const updateDoc = (id: string, data: { title?: string; content?: string; tags?: string[] }) =>
  api<{ updated: boolean }>(`/kb/docs/${id}`, { method: 'PUT', body: JSON.stringify(data) });

/**
 * Permanently deletes a manually-uploaded KB document.
 * @param id - Document UUID.
 */
export const deleteDoc = (id: string) =>
  api<void>(`/kb/docs/${id}`, { method: 'DELETE' });

/** Analyze a doc's content for POSibolt API patterns and suggest tool mappings. */
export const analyzeDoc = (id: string) =>
  api<{
    suggestions: { toolName: string; confidence: string; matchedPatterns: string[] }[];
    currentMappings: string[];
  }>(`/kb/docs/${id}/analyze`, { method: 'POST' });

/** Save confirmed tool mappings for an uploaded doc. */
export const updateDocMappings = (id: string, mappedTools: string[]) =>
  api<{ updated: boolean; mappedTools: string[] }>(`/kb/docs/${id}/mappings`, {
    method: 'PUT',
    body: JSON.stringify({ mappedTools }),
  });

// KB Settings & Sync

/** Fetches the current YouTrack connection settings and sync interval. */
export const getKbSettings = () =>
  api<KbSettings>('/kb/settings');

/**
 * Saves YouTrack connection settings and/or the sync interval.
 * Only fields present in `settings` are updated; omit a field to leave it unchanged.
 * The token is only updated when a new non-masked value is provided.
 * @param settings - Partial KB settings to persist.
 */
export const updateKbSettings = (settings: Partial<KbSettings>) =>
  api<{ updated: boolean }>('/kb/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

/**
 * Fetches the current YouTrack sync status including last sync time,
 * article counts, and any error from the most recent sync attempt.
 */
export const getKbSyncStatus = () =>
  api<SyncStatus>('/kb/sync-status');

/** Tests the saved YouTrack connection using stored credentials. */
export const testYouTrackConnection = () =>
  api<{ connected: boolean; message: string }>('/kb/test-connection', { method: 'POST' });

// Tool API config

export interface ToolApiConfig {
  endpoint: string;
  method?: string;
  notes?: string;
}

/** Fetches the configured API endpoint override for a tool. */
export const getToolConfig = (toolName: string) =>
  api<{ config: ToolApiConfig | null }>(`/tools/${toolName}/config`);

/** Saves an API endpoint override for a tool. */
export const updateToolConfig = (toolName: string, config: ToolApiConfig) =>
  api<{ updated: boolean }>(`/tools/${toolName}/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
