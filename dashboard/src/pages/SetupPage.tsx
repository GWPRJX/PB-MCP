import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../components/ToastProvider';
import {
  listToolRegistry,
  toggleTool,
  getKbSyncStatus,
  refreshKb,
  type ToolRegistryEntry,
  type SyncStatus,
} from '../api';

/**
 * Server Setup & Onboarding page. Ensures the MCP server is healthy,
 * KB articles are synced, tools are configured, and provides a ready-to-copy
 * MCP client config snippet.
 */
export function SetupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Server Setup</h1>
      <p className="text-sm text-gray-500 mb-8">
        Verify your MCP server is running, articles are synced, and tools are configured for all clients.
      </p>

      <div className="space-y-10">
        <ServerHealthSection />
        <KbStatusSection />
        <ToolRegistrySection />
        <McpConfigSection />
      </div>
    </div>
  );
}

/* ─── 1. Server Health ──────────────────────────────────────── */

function ServerHealthSection() {
  const [health, setHealth] = useState<{ status: string; database: string; uptime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setHealth)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { check(); }, [check]);

  return (
    <Section
      step={1}
      title="Server Health"
      subtitle="Verify the MCP server and database are reachable."
      status={loading ? 'loading' : error ? 'error' : 'ok'}
    >
      {loading ? (
        <p className="text-sm text-gray-500">Checking...</p>
      ) : error ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full" />
            <span className="text-sm text-red-700">Server unreachable: {error}</span>
          </div>
          <button onClick={check} className="text-xs text-blue-600 hover:underline">Retry</button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-3 gap-6 flex-1">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Status</p>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${health?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-800 capitalize">{health?.status ?? 'Unknown'}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Database</p>
              <span className="text-sm text-gray-800 capitalize">{health?.database ?? 'Unknown'}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Uptime</p>
              <span className="text-sm text-gray-800">{health?.uptime ? formatUptime(health.uptime) : '-'}</span>
            </div>
          </div>
          <button onClick={check} className="text-xs text-blue-600 hover:underline ml-4">Refresh</button>
        </div>
      )}
    </Section>
  );
}

/* ─── 2. Knowledge Base Status ──────────────────────────────── */

function KbStatusSection() {
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    getKbSyncStatus()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await refreshKb();
      toast.success(`Synced ${res.article_count} articles`);
      fetchStatus();
    } catch (e) {
      toast.error(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const hasArticles = (status?.totalArticleCount ?? 0) > 0;
  const hasError = !!status?.lastSyncError;

  return (
    <Section
      step={2}
      title="Knowledge Base"
      subtitle="Ensure YouTrack articles are synced so AI clients have the latest documentation."
      status={loading ? 'loading' : hasError ? 'warning' : hasArticles ? 'ok' : 'warning'}
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading sync status...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Articles</p>
              <span className={`text-sm font-medium ${hasArticles ? 'text-gray-800' : 'text-amber-600'}`}>
                {status?.totalArticleCount ?? 0}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Last Sync</p>
              <span className="text-sm text-gray-800">
                {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Last Run</p>
              <span className="text-sm text-gray-800">
                {status?.lastSyncArticleCount != null ? `${status.lastSyncArticleCount} articles` : '-'}
              </span>
            </div>
          </div>

          {hasError && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
              Last sync error: {status!.lastSyncError}
            </div>
          )}

          {!hasArticles && !hasError && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
              No articles synced yet. Configure YouTrack credentials in the{' '}
              <a href="/dashboard/kb" className="underline font-medium">Knowledge Base</a> page,
              then click Sync Now.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <a href="/dashboard/kb" className="text-xs text-blue-600 hover:underline">
              Configure YouTrack settings
            </a>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ─── 3. Tool Registry with Toggles ─────────────────────────── */

function ToolRegistrySection() {
  const toast = useToast();
  const [tools, setTools] = useState<ToolRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchTools = useCallback(() => {
    setLoading(true);
    listToolRegistry()
      .then(setTools)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleToggle = async (toolName: string) => {
    setToggling(toolName);
    try {
      const result = await toggleTool(toolName);
      setTools((prev) =>
        prev.map((t) => (t.toolName === toolName ? { ...t, isActive: result.isActive } : t)),
      );
      toast.success(`${toolName} ${result.isActive ? 'enabled' : 'disabled'}`);
    } catch (e) {
      toast.error(`Failed to toggle: ${(e as Error).message}`);
    } finally {
      setToggling(null);
    }
  };

  const categories = new Map<string, ToolRegistryEntry[]>();
  for (const t of tools) {
    const list = categories.get(t.category) ?? [];
    list.push(t);
    categories.set(t.category, list);
  }

  const activeCount = tools.filter((t) => t.isActive).length;

  return (
    <Section
      step={3}
      title="Tool Registry"
      subtitle="Enable or disable MCP tools globally for all clients. Per-tenant overrides are configured on each tenant's detail page."
      status={loading ? 'loading' : activeCount > 0 ? 'ok' : 'warning'}
    >
      {loading ? (
        <p className="text-sm text-gray-500">Loading tools...</p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {activeCount} of {tools.length} tools active globally.
            Disabled tools will not appear in any client's tool list.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from(categories.entries()).map(([cat, catTools]) => (
              <div key={cat} className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide mb-3">
                  {cat} ({catTools.filter((t) => t.isActive).length}/{catTools.length})
                </h3>
                <ul className="space-y-2">
                  {catTools.map((t) => (
                    <li key={t.toolName} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-700 truncate">{t.displayName}</span>
                        {t.source !== 'builtin' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded flex-shrink-0">
                            {t.source}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleToggle(t.toolName)}
                        disabled={toggling === t.toolName}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                          t.isActive ? 'bg-green-500' : 'bg-gray-300'
                        } ${toggling === t.toolName ? 'opacity-50' : ''}`}
                        title={t.isActive ? 'Click to disable' : 'Click to enable'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                            t.isActive ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/* ─── 4. MCP Client Config ──────────────────────────────────── */

function McpConfigSection() {
  const toast = useToast();
  const serverUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const config = JSON.stringify(
    {
      mcpServers: {
        'pb-mcp': {
          url: `${serverUrl}/mcp`,
          headers: {
            Authorization: 'Bearer YOUR_API_KEY_HERE',
          },
        },
      },
    },
    null,
    2,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      toast.success('Config copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Section
      step={4}
      title="MCP Client Configuration"
      subtitle="Copy this snippet into your AI client's MCP settings. Replace the API key with one from your tenant."
      status="ok"
    >
      <div className="max-w-2xl space-y-4">
        <div className="relative">
          <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto">
            {config}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded hover:bg-gray-600"
          >
            Copy
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Where to paste:</h3>
          <ul className="text-xs text-blue-700 space-y-1.5 list-disc list-inside">
            <li><strong>Claude Desktop:</strong> Settings &rarr; Developer &rarr; Edit Config</li>
            <li><strong>Claude Code (CLI):</strong> <code className="bg-blue-100 px-1 rounded">~/.claude/settings.json</code> under <code className="bg-blue-100 px-1 rounded">mcpServers</code></li>
            <li><strong>Cursor:</strong> Settings &rarr; MCP &rarr; Add new MCP server</li>
            <li><strong>Other clients:</strong> Look for "MCP server configuration" in settings</li>
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ─── Shared Components ─────────────────────────────────────── */

function Section({
  step,
  title,
  subtitle,
  status,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  status: 'ok' | 'error' | 'warning' | 'loading';
  children: React.ReactNode;
}) {
  const indicator = {
    ok: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    loading: 'bg-gray-300 animate-pulse',
  }[status];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-bold text-gray-600 flex-shrink-0">
          {step}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium text-gray-800">{title}</h2>
            <span className={`w-2.5 h-2.5 rounded-full ${indicator}`} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="ml-11">{children}</div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
