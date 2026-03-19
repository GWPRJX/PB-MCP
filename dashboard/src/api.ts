const BASE = '/admin';

let token = '';

export function setToken(t: string) {
  token = t;
  localStorage.setItem('jwt_token', t);
}

export function getToken(): string {
  if (!token) {
    token = localStorage.getItem('jwt_token') ?? '';
  }
  return token;
}

export function clearToken() {
  token = '';
  localStorage.removeItem('jwt_token');
}

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

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...opts.headers,
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
  syncIntervalMs: number;
}

export interface SyncStatus {
  lastSyncAt: string | null;
  lastSyncArticleCount: number | null;
  lastSyncError: string | null;
  totalArticleCount: number;
}

// API functions
export const listTenants = () => api<Tenant[]>('/tenants');

export const getTenant = (id: string) => api<TenantDetail>(`/tenants/${id}`);

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

export const createApiKey = (tenantId: string, label?: string, expiresAt?: string | null) =>
  api<{ keyId: string; apiKey: string }>(`/tenants/${tenantId}/keys`, {
    method: 'POST',
    body: JSON.stringify({ label, expiresAt: expiresAt || undefined }),
  });

export const revokeApiKey = (tenantId: string, keyId: string) =>
  api<void>(`/tenants/${tenantId}/keys/${keyId}`, { method: 'DELETE' });

export const getToolPermissions = (tenantId: string) =>
  api<ToolPermission[]>(`/tenants/${tenantId}/tools`);

export const updateToolPermissions = (tenantId: string, permissions: ToolPermission[]) =>
  api<ToolPermission[]>(`/tenants/${tenantId}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });

export const updateKeyAllowedTools = (tenantId: string, keyId: string, allowedTools: string[] | null) =>
  api<{ updated: boolean }>(`/tenants/${tenantId}/keys/${keyId}/tools`, {
    method: 'PUT',
    body: JSON.stringify({ allowedTools }),
  });

export const updateErpConfig = (tenantId: string, config: Record<string, string>) =>
  api<{ updated: boolean }>(`/tenants/${tenantId}/erp-config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });

export const testConnection = (tenantId: string) =>
  api<{ connected: boolean; message: string }>(`/tenants/${tenantId}/test-connection`, {
    method: 'POST',
  });

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

export const getAuditLog = (tenantId: string, params?: { limit?: number; offset?: number; toolName?: string; status?: string }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  if (params?.toolName) qs.set('toolName', params.toolName);
  if (params?.status) qs.set('status', params.status);
  const q = qs.toString();
  return api<{ entries: AuditEntry[]; totalCount: number }>(`/tenants/${tenantId}/audit-log${q ? `?${q}` : ''}`);
};

export const listAllTools = () => api<string[]>('/tools');

export const refreshKb = () =>
  api<{ synced: boolean; article_count: number }>('/kb/refresh', { method: 'POST' });

// KB doc CRUD
export const uploadDoc = (data: { title: string; content: string; tags?: string[] }) =>
  api<KbDoc>('/kb/upload', { method: 'POST', body: JSON.stringify(data) });

export const listDocs = (params?: { limit?: number; offset?: number }) => {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return api<{ docs: KbDoc[]; totalCount: number }>(`/kb/docs${q ? `?${q}` : ''}`);
};

export const getDoc = (id: string) =>
  api<KbDocFull>(`/kb/docs/${id}`);

export const updateDoc = (id: string, data: { title?: string; content?: string; tags?: string[] }) =>
  api<{ updated: boolean }>(`/kb/docs/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteDoc = (id: string) =>
  api<void>(`/kb/docs/${id}`, { method: 'DELETE' });

// KB Settings & Sync
export const getKbSettings = () =>
  api<KbSettings>('/kb/settings');

export const updateKbSettings = (settings: Partial<KbSettings>) =>
  api<{ updated: boolean }>('/kb/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

export const getKbSyncStatus = () =>
  api<SyncStatus>('/kb/sync-status');
