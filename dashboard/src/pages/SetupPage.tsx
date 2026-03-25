import { useEffect, useState } from 'react';
import { useToast } from '../components/ToastProvider';
import { listToolRegistry, type ToolRegistryEntry } from '../api';

/**
 * Setup & Status page. Provides:
 * - Plain English getting-started instructions
 * - Server health status
 * - Tool registry overview (builtin vs doc-sourced)
 * - MCP config snippet with copy button
 */
export function SetupPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Setup Guide</h1>
      <p className="text-sm text-gray-500 mb-8">
        Follow these steps to get your PB MCP server connected and ready to use.
      </p>

      <div className="space-y-10">
        <GettingStartedSection />
        <ServerHealthSection />
        <ToolRegistrySection />
        <McpConfigSection />
      </div>
    </div>
  );
}

function GettingStartedSection() {
  return (
    <div>
      <h2 className="text-lg font-medium text-gray-800 mb-4">Getting Started</h2>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <ol className="list-decimal list-inside space-y-4 text-sm text-gray-700">
          <li>
            <strong>Create a Tenant</strong> — Go to the{' '}
            <a href="/dashboard/tenants/new" className="text-blue-600 hover:underline">
              Create Tenant
            </a>{' '}
            page and fill in a name and slug for your organisation. This gives you an isolated
            workspace with its own API keys, tool permissions, and ERP connection.
          </li>
          <li>
            <strong>Configure POSibolt Credentials</strong> — On the tenant detail page, enter your
            POSibolt ERP connection details (Base URL, Client ID, App Secret, Username, Password,
            and Terminal). Click "Test Connection" to verify they work before saving.
          </li>
          <li>
            <strong>Copy Your API Key</strong> — When you create a tenant, an API key is generated.
            Copy it immediately — it is shown only once. You will use this key to authenticate MCP
            requests from your AI assistant (Claude, Cursor, etc.).
          </li>
          <li>
            <strong>Configure Your AI Client</strong> — Copy the MCP config snippet from the section
            below and paste it into your AI client's MCP settings file. Replace the placeholder API
            key with your real key.
          </li>
          <li>
            <strong>Set Tool Permissions</strong> — On the tenant detail page under "Tool
            Permissions", enable or disable individual tools. By default all 27 builtin tools are
            enabled. Disable any tools you don't want the AI to access.
          </li>
          <li>
            <strong>Upload API Documentation (Optional)</strong> — Go to{' '}
            <a href="/dashboard/kb" className="text-blue-600 hover:underline">
              Knowledge Base
            </a>{' '}
            to upload POSibolt REST API docs or connect YouTrack. These docs help the AI give more
            accurate answers about your ERP system.
          </li>
        </ol>
      </div>
    </div>
  );
}

function ServerHealthSection() {
  const [health, setHealth] = useState<{ status: string; database: string; uptime: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setHealth)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Checking server health...</p>;

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-800 mb-4">Server Status</h2>
      <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-xl">
        {error ? (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full" />
            <span className="text-sm text-red-700">Server unreachable: {error}</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
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
        )}
      </div>
    </div>
  );
}

function ToolRegistrySection() {
  const [tools, setTools] = useState<ToolRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listToolRegistry()
      .then(setTools)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500 text-sm">Loading tool registry...</p>;

  const categories = new Map<string, ToolRegistryEntry[]>();
  for (const t of tools) {
    const list = categories.get(t.category) ?? [];
    list.push(t);
    categories.set(t.category, list);
  }

  const builtinCount = tools.filter((t) => t.source === 'builtin').length;
  const docCount = tools.filter((t) => t.source !== 'builtin').length;

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-800 mb-4">Tool Registry</h2>
      <p className="text-sm text-gray-500 mb-4">
        {builtinCount} builtin tool{builtinCount !== 1 ? 's' : ''} registered
        {docCount > 0 ? `, ${docCount} from docs` : ''}.
        These are the MCP tools available to AI clients.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from(categories.entries()).map(([cat, catTools]) => (
          <div key={cat} className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-800 uppercase tracking-wide mb-3">
              {cat} ({catTools.length})
            </h3>
            <ul className="space-y-1.5">
              {catTools.map((t) => (
                <li key={t.toolName} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${t.isActive ? 'bg-green-400' : 'bg-gray-300'}`} />
                  <span className="text-gray-700">{t.displayName}</span>
                  {t.source !== 'builtin' && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                      {t.source}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function McpConfigSection() {
  const toast = useToast();
  const serverUrl = window.location.origin;

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
      toast.error('Failed to copy — please select and copy manually');
    }
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-800 mb-4">MCP Client Configuration</h2>
      <div className="max-w-2xl">
        <p className="text-sm text-gray-600 mb-3">
          Add this to your AI client's MCP settings file. For Claude Desktop, add it to{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">claude_desktop_config.json</code>.
          For Cursor, add it to your MCP settings. Replace <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">YOUR_API_KEY_HERE</code> with
          the API key from your tenant.
        </p>

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

        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Where to paste this config:</h3>
          <ul className="text-xs text-blue-700 space-y-1.5 list-disc list-inside">
            <li><strong>Claude Desktop:</strong> Settings &rarr; Developer &rarr; Edit Config &rarr; paste into the JSON file</li>
            <li><strong>Claude Code (CLI):</strong> Add to <code className="bg-blue-100 px-1 rounded">~/.claude/settings.json</code> under <code className="bg-blue-100 px-1 rounded">mcpServers</code></li>
            <li><strong>Cursor:</strong> Settings &rarr; MCP &rarr; Add new MCP server &rarr; paste the URL and headers</li>
            <li><strong>Other MCP clients:</strong> Look for "MCP server configuration" in your client's settings</li>
          </ul>
        </div>
      </div>
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
