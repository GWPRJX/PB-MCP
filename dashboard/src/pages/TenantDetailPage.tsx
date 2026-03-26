import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getTenant,
  createApiKey,
  revokeApiKey,
  getToolPermissions,
  updateToolPermissions,
  updateErpConfig,
  testConnection,
  getAuditLog,
  listAllTools,
  listToolRegistry,
  updateKeyAllowedTools,
  type TenantDetail,
  type ApiKey,
  type ToolPermission,
  type ToolRegistryEntry,
  type AuditEntry,
} from '../api';
import { Tooltip } from '../components/Tooltip';

type Tab = 'keys' | 'tools' | 'erp' | 'setup' | 'audit';

/**
 * Tenant detail page. Loads a single tenant by URL param `id` and renders a
 * tabbed interface with five tabs:
 * - **API Keys** ({@link KeysTab}) — issue, revoke, and scope keys.
 * - **Tool Permissions** ({@link ToolsTab}) — enable/disable MCP tools per tenant.
 * - **ERP Config** ({@link ErpTab}) — update and test POSibolt credentials.
 * - **Setup** ({@link SetupTab}) — MCP client config snippets and PDF export.
 * - **Audit Log** ({@link AuditTab}) — paginated, filterable tool call history.
 */
export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('keys');

  const load = () => {
    if (!id) return;
    setLoading(true);
    getTenant(id)
      .then(setTenant)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!tenant) return <p className="text-gray-500">Tenant not found</p>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'keys', label: 'API Keys' },
    { key: 'tools', label: 'Tool Permissions' },
    { key: 'erp', label: 'ERP Config' },
    { key: 'setup', label: 'Setup' },
    { key: 'audit', label: 'Audit Log' },
  ];

  const handleExportPdf = (_tenant: TenantDetail) => {
    setTab('setup');
    // Small delay to ensure Setup tab renders before printing
    setTimeout(() => window.print(), 100);
  };

  return (
    <div>
      <div className="mb-6">
        <Link to="/tenants" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block no-print">
          &larr; All tenants
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{tenant.name}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${tenant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {tenant.status}
          </span>
          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{tenant.plan}</span>
          <button
            onClick={() => handleExportPdf(tenant)}
            title="Export setup as PDF"
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.75v.75c0 .966-.784 1.75-1.75 1.75h-6.5A1.75 1.75 0 0 1 5 15.75V15h-.75A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.126-.153V2.75Zm1.5 0v3.379a49.71 49.71 0 0 1 7 0V2.75a.25.25 0 0 0-.25-.25h-6.5a.25.25 0 0 0-.25.25Zm-1.543 5.674A.75.75 0 0 1 5.75 8h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.793-.576ZM6.5 15.75v-3h7v3a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          <span className="inline-flex items-center gap-1">Slug<Tooltip text="A short, URL-safe identifier for this tenant. Used as the server name in MCP client configuration files." /></span>: <code className="text-xs bg-gray-100 px-1 rounded">{tenant.slug}</code>
          {' '}&middot;{' '}
          ID: <code className="text-xs bg-gray-100 px-1 rounded">{tenant.id}</code>
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6 no-print">
        <div className="flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`pb-2 text-sm font-medium border-b-2 ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'keys' && <KeysTab tenant={tenant} onRefresh={load} />}
      {tab === 'tools' && <ToolsTab tenantId={tenant.id} />}
      {tab === 'erp' && <ErpTab tenant={tenant} />}
      {tab === 'setup' && <SetupTab tenant={tenant} />}
      {tab === 'audit' && <AuditTab tenantId={tenant.id} />}
    </div>
  );
}

/**
 * Setup guide tab. Generates ready-to-paste MCP client configuration snippets
 * for Claude Desktop, Cursor, and generic clients using the tenant's slug and
 * the current server URL. When multiple active keys exist, the user can select
 * which key to reference. Also provides a print-to-PDF export that renders a
 * print-only layout with all three snippet variants and example prompts.
 *
 * @param tenant - Full tenant detail including active API keys and slug.
 */
function SetupTab({ tenant }: { tenant: TenantDetail }) {
  const [activeSnippet, setActiveSnippet] = useState<'claude' | 'cursor' | 'generic'>('claude');
  const [copiedField, setCopiedField] = useState<string>('');

  const serverUrl = (() => {
    const loc = window.location;
    const base = `${loc.protocol}//${loc.host}`;
    return `${base}/mcp`;
  })();

  const activeKeyCount = tenant.apiKeys.filter(
    (k) => k.status === 'active' && (!k.expiresAt || new Date(k.expiresAt) > new Date())
  ).length;

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const getClaudeDesktopConfig = () => {
    return `// Config file: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// or: %APPDATA%\\Claude\\claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "${tenant.slug}": {
      "url": "${serverUrl}",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}`;
  };

  const getCursorConfig = () => {
    return `// Config file: ~/.cursor/mcp.json
{
  "mcpServers": {
    "${tenant.slug}": {
      "url": "${serverUrl}",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}`;
  };

  const getGenericConfig = () => {
    return `Server URL:   ${serverUrl}
Transport:    Streamable HTTP
Header:       x-api-key: YOUR_API_KEY

Replace YOUR_API_KEY with the API key generated for this tenant.`;
  };

  const snippetLabels: { key: 'claude' | 'cursor' | 'generic'; label: string }[] = [
    { key: 'claude', label: 'Claude Desktop' },
    { key: 'cursor', label: 'Cursor' },
    { key: 'generic', label: 'Generic' },
  ];

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-600 mb-6">
        Connect an AI assistant to this tenant&apos;s data through PB MCP.
        Replace <code className="bg-gray-100 px-1 rounded text-xs">YOUR_API_KEY</code> with
        a key from the <strong>API Keys</strong> tab.
      </p>

      {activeKeyCount === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            No active API keys. Create one in the <strong>API Keys</strong> tab first.
          </p>
        </div>
      )}

      {/* Client tabs */}
      <div className="mb-6">
        <div className="flex border-b border-gray-200 mb-6">
          {snippetLabels.map((s) => (
            <button
              key={s.key}
              onClick={() => setActiveSnippet(s.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeSnippet === s.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Claude Desktop instructions */}
        {activeSnippet === 'claude' && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">How to connect Claude Desktop to this server</h2>
            <p className="text-sm text-gray-600 mb-6">
              MCP (Model Context Protocol) is the standard that lets AI assistants like Claude talk to external
              data sources. This configuration tells Claude Desktop where your PB MCP server is and how to authenticate.
            </p>

            <ol className="space-y-6 text-sm text-gray-700">
              <li>
                <p className="font-medium text-gray-900 mb-2">Step 1: Find your Claude Desktop settings file</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span><strong>Mac:</strong> Open Finder &rarr; Go &rarr; Go to Folder &rarr; paste: <code className="bg-gray-100 px-1 rounded text-xs">~/Library/Application Support/Claude/claude_desktop_config.json</code></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span><strong>Windows:</strong> Press <kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Win+R</kbd> &rarr; paste: <code className="bg-gray-100 px-1 rounded text-xs">%APPDATA%\Claude\claude_desktop_config.json</code></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If the file doesn&apos;t exist, create a new file at that path.</span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 2: Copy the configuration below into your settings file</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="relative">
                    <pre className="p-4 text-sm font-mono text-gray-800 overflow-x-auto bg-gray-50 whitespace-pre">
                      {getClaudeDesktopConfig()}
                    </pre>
                    <button
                      onClick={() => handleCopy(getClaudeDesktopConfig(), 'snippet')}
                      className="absolute top-2 right-2 border border-gray-300 text-gray-700 text-xs font-medium py-1 px-2 rounded hover:bg-gray-50 bg-white transition-colors"
                    >
                      {copiedField === 'snippet' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 3: Replace YOUR_API_KEY with your actual API key</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Your API key was shown once when you created it on the <strong>Keys</strong> tab.</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If you&apos;ve lost it, go to the Keys tab, revoke the old key, and create a new one.</span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 4: Save the file and restart Claude Desktop</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Close Claude Desktop completely (quit from system tray / menu bar).</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Reopen it — the MCP connection will activate automatically.</span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 5: Verify the connection works</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>In Claude Desktop, type: <code className="bg-gray-100 px-1 rounded text-xs">"Use the list_products tool"</code></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If it returns product data, you&apos;re connected!</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If you see an error, check that the server is running and the API key is correct.</span></li>
                </ul>
              </li>
            </ol>
          </div>
        )}

        {/* Cursor instructions */}
        {activeSnippet === 'cursor' && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">How to connect Cursor to this server</h2>
            <p className="text-sm text-gray-600 mb-6">
              Cursor supports MCP servers through a global config file. This configuration tells Cursor where your
              PB MCP server is and how to authenticate.
            </p>

            <ol className="space-y-6 text-sm text-gray-700">
              <li>
                <p className="font-medium text-gray-900 mb-2">Step 1: Find your Cursor MCP settings file</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span><strong>Mac / Linux:</strong> <code className="bg-gray-100 px-1 rounded text-xs">~/.cursor/mcp.json</code></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span><strong>Windows:</strong> <code className="bg-gray-100 px-1 rounded text-xs">%USERPROFILE%\.cursor\mcp.json</code></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If the file doesn&apos;t exist, create a new file at that path.</span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 2: Copy the configuration below into your settings file</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="relative">
                    <pre className="p-4 text-sm font-mono text-gray-800 overflow-x-auto bg-gray-50 whitespace-pre">
                      {getCursorConfig()}
                    </pre>
                    <button
                      onClick={() => handleCopy(getCursorConfig(), 'snippet')}
                      className="absolute top-2 right-2 border border-gray-300 text-gray-700 text-xs font-medium py-1 px-2 rounded hover:bg-gray-50 bg-white transition-colors"
                    >
                      {copiedField === 'snippet' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 3: Replace YOUR_API_KEY with your actual API key</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Your API key was shown once when you created it on the <strong>Keys</strong> tab.</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If you&apos;ve lost it, go to the Keys tab, revoke the old key, and create a new one.</span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 4: Save the file and reload Cursor</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Reload the Cursor window: press <kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+Shift+P</kbd> and run <strong>Reload Window</strong>.</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>The MCP server will appear in the Cursor MCP panel after reload.</span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 5: Verify the connection works</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Open the Cursor chat and type: <code className="bg-gray-100 px-1 rounded text-xs">"Use the list_products tool"</code></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If it returns product data, you&apos;re connected!</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If you see an error, check that the server is running and the API key is correct.</span></li>
                </ul>
              </li>
            </ol>
          </div>
        )}

        {/* Generic instructions */}
        {activeSnippet === 'generic' && (
          <div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Connect any MCP-compatible client</h2>
            <p className="text-sm text-gray-600 mb-6">
              Any MCP-compatible AI client can connect using these details. Consult your AI client&apos;s
              documentation for where to enter the server URL and authentication header.
            </p>

            <ol className="space-y-6 text-sm text-gray-700">
              <li>
                <p className="font-medium text-gray-900 mb-2">Step 1: Use the server URL and connection details below</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="relative">
                    <pre className="p-4 text-sm font-mono text-gray-800 overflow-x-auto bg-gray-50 whitespace-pre">
                      {getGenericConfig()}
                    </pre>
                    <button
                      onClick={() => handleCopy(getGenericConfig(), 'snippet')}
                      className="absolute top-2 right-2 border border-gray-300 text-gray-700 text-xs font-medium py-1 px-2 rounded hover:bg-gray-50 bg-white transition-colors"
                    >
                      {copiedField === 'snippet' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 2: Replace YOUR_API_KEY with your actual API key</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Your API key was shown once when you created it on the <strong>Keys</strong> tab.</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>If you&apos;ve lost it, go to the Keys tab, revoke the old key, and create a new one.</span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Pass the key as an HTTP header: <code className="bg-gray-100 px-1 rounded text-xs">X-Api-Key: YOUR_API_KEY</code></span></li>
                </ul>
              </li>

              <li>
                <p className="font-medium text-gray-900 mb-2">Step 3: Configure your client</p>
                <ul className="space-y-1 ml-4 text-gray-600">
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Transport type: <strong>Streamable HTTP</strong></span></li>
                  <li className="flex gap-2"><span className="text-gray-400 select-none">•</span><span>Consult your AI client&apos;s documentation for where to enter these values.</span></li>
                </ul>
              </li>
            </ol>
          </div>
        )}
      </div>

      {/* Export PDF button */}
      <div className="pt-4 border-t border-gray-200 no-print">
        <button
          onClick={() => window.print()}
          className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50"
        >
          Export as PDF
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Opens your browser&apos;s print dialog. Choose &quot;Save as PDF&quot; to download.
        </p>
      </div>

      {/* Print-only content — hidden on screen, shown when printing */}
      <div className="hidden print-only">
        <h1 style={{ fontSize: '18pt', marginBottom: '0.5rem' }}>{tenant.name} — MCP Setup Guide</h1>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
          Tenant: {tenant.slug} | Generated: {new Date().toLocaleDateString()}
        </p>

        <h2 style={{ fontSize: '14pt', marginBottom: '0.5rem' }}>MCP Server URL</h2>
        <div className="print-snippet">
          <code>{serverUrl}</code>
        </div>

        <h2 style={{ fontSize: '14pt', marginBottom: '0.5rem' }}>API Key</h2>
        <p style={{ marginBottom: '1rem', fontSize: '10pt', color: '#6b7280' }}>
          Use the API key that was shown when you created it. Replace YOUR_API_KEY in the snippets below.
        </p>

        <h2 style={{ fontSize: '14pt', marginBottom: '0.5rem' }}>Configuration — Claude Desktop</h2>
        <div className="print-snippet">
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '10pt' }}>{getClaudeDesktopConfig()}</pre>
        </div>

        <h2 style={{ fontSize: '14pt', marginBottom: '0.5rem' }}>Configuration — Cursor</h2>
        <div className="print-snippet">
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '10pt' }}>{getCursorConfig()}</pre>
        </div>

        <h2 style={{ fontSize: '14pt', marginBottom: '0.5rem' }}>Configuration — Generic MCP Client</h2>
        <div className="print-snippet">
          <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '10pt' }}>{getGenericConfig()}</pre>
        </div>

        <h2 style={{ fontSize: '14pt', marginTop: '1.5rem', marginBottom: '0.5rem' }}>Getting Started — Example Prompts</h2>
        <p style={{ fontSize: '10pt', color: '#6b7280', marginBottom: '0.75rem' }}>
          Once connected, try these prompts in your MCP client:
        </p>
        <ul style={{ fontSize: '10pt', lineHeight: '1.8', paddingLeft: '1.5rem' }}>
          <li>&quot;Show me all products that are low on stock&quot;</li>
          <li>&quot;Look up the latest invoices for customer John Smith&quot;</li>
          <li>&quot;What is the current stock level for product SKU-1234?&quot;</li>
          <li>&quot;Search the knowledge base for return policy information&quot;</li>
        </ul>

        <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', fontSize: '9pt', color: '#9ca3af' }}>
          Generated from PB MCP Admin Dashboard | {window.location.origin}
        </div>
      </div>
    </div>
  );
}

/**
 * API Keys management tab. Lists all API keys for the tenant with their
 * status, expiry, and creation date. Allows issuing new keys with an optional
 * label and expiry, revoking active keys, and expanding a row to configure
 * per-key tool scoping (restricting which MCP tools that key may call).
 *
 * @param tenant - Full tenant detail including the current API key list.
 * @param onRefresh - Callback to reload tenant data after a key mutation.
 */
function KeysTab({ tenant, onRefresh }: { tenant: TenantDetail; onRefresh: () => void }) {
  const [newKey, setNewKey] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalLabel, setModalLabel] = useState('');
  const [modalExpiry, setModalExpiry] = useState('');
  const [modalTools, setModalTools] = useState<Set<string>>(new Set());
  const [allTools, setAllTools] = useState<string[]>([]);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [savingScope, setSavingScope] = useState(false);

  // Load tools list once
  useEffect(() => {
    if (!toolsLoaded) {
      listAllTools().then((tools) => {
        setAllTools(tools);
        setToolsLoaded(true);
      }).catch(() => {});
    }
  }, [toolsLoaded]);

  const openModal = () => {
    setModalLabel('');
    setModalExpiry('');
    setModalTools(new Set(allTools)); // default: all tools selected
    setShowModal(true);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const toolsToSend = modalTools.size === allTools.length ? undefined : [...modalTools];
      const res = await createApiKey(tenant.id, modalLabel || undefined, modalExpiry || null);
      // If tool scoping was customized, save it
      if (toolsToSend) {
        await updateKeyAllowedTools(tenant.id, res.keyId, toolsToSend);
      }
      setNewKey(res.apiKey);
      setShowModal(false);
      onRefresh();
    } catch {
      // error handling via UI
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Revoke this API key? This action cannot be undone.')) return;
    await revokeApiKey(tenant.id, keyId);
    onRefresh();
  };

  const handleExpand = (key: ApiKey) => {
    if (expandedKeyId === key.id) {
      setExpandedKeyId(null);
      return;
    }
    // Pre-populate selected tools from key's allowedTools
    if (key.allowedTools) {
      setSelectedTools(new Set(key.allowedTools));
    } else {
      setSelectedTools(new Set(allTools));
    }
    setExpandedKeyId(key.id);
  };

  const handleSaveScope = async (keyId: string) => {
    setSavingScope(true);
    try {
      const toolsToSend = selectedTools.size === allTools.length ? null : [...selectedTools];
      await updateKeyAllowedTools(tenant.id, keyId, toolsToSend);
      onRefresh();
    } finally {
      setSavingScope(false);
    }
  };

  const handleResetScope = async (keyId: string) => {
    setSavingScope(true);
    try {
      await updateKeyAllowedTools(tenant.id, keyId, null);
      setSelectedTools(new Set(allTools));
      onRefresh();
    } finally {
      setSavingScope(false);
    }
  };

  const isExpired = (key: ApiKey) => {
    if (!key.expiresAt) return false;
    return new Date(key.expiresAt) < new Date();
  };

  const filteredKeys = searchFilter
    ? tenant.apiKeys.filter((k) =>
        (k.label ?? '').toLowerCase().includes(searchFilter.toLowerCase())
      )
    : tenant.apiKeys;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        <span className="inline-flex items-center gap-1">API Keys<Tooltip text="Secret tokens that let MCP clients authenticate as this tenant. Each key grants access to the tenant's ERP data through MCP tools. Keep them safe — anyone with a key can read and write data." /></span>
        {' '}manage access for MCP clients.
      </p>

      {newKey && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-yellow-800 font-medium mb-2">New API key created. Save it now — it will not be shown again.</p>
          <div className="bg-white border border-yellow-300 rounded px-3 py-2 font-mono text-xs break-all select-all">
            {newKey}
          </div>
          <button onClick={() => setNewKey('')} className="text-xs text-yellow-700 mt-2 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Search keys by label..."
          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={openModal}
          className="bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-blue-700 whitespace-nowrap"
        >
          + Issue New Key
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Label</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                <span className="inline-flex items-center gap-1">Expires<Tooltip text="When this key stops working. After expiry, MCP clients using this key will get authentication errors. Set to 'Never' for keys that don't expire." /></span>
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredKeys.map((k) => (
              <KeyRow
                key={k.id}
                k={k}
                isExpanded={expandedKeyId === k.id}
                isExpired={isExpired(k)}
                onExpand={() => handleExpand(k)}
                onRevoke={() => handleRevoke(k.id)}
                allTools={allTools}
                selectedTools={selectedTools}
                setSelectedTools={setSelectedTools}
                onSaveScope={() => handleSaveScope(k.id)}
                onResetScope={() => handleResetScope(k.id)}
                savingScope={savingScope}
              />
            ))}
            {filteredKeys.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">
                {searchFilter ? 'No keys match your search.' : 'No API keys yet.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Issue New Key Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Issue New API Key</h3>
              <p className="text-xs text-gray-500 mt-1">Configure the key label, expiry, and tool access before creating.</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
                <input
                  type="text"
                  value={modalLabel}
                  onChange={(e) => setModalLabel(e.target.value)}
                  placeholder="e.g. Claude Desktop, Cursor, Production..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expiry (optional)</label>
                <input
                  type="datetime-local"
                  value={modalExpiry}
                  onChange={(e) => setModalExpiry(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for a key that never expires.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Tool Access</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setModalTools(new Set(allTools))}
                      className="text-xs text-blue-600 hover:underline"
                    >All</button>
                    <button
                      onClick={() => setModalTools(new Set())}
                      className="text-xs text-red-600 hover:underline"
                    >None</button>
                  </div>
                </div>
                <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {allTools.map((tool) => (
                    <label key={tool} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <span className="text-xs font-mono text-gray-700">{tool}</span>
                      <input
                        type="checkbox"
                        checked={modalTools.has(tool)}
                        onChange={() => {
                          const next = new Set(modalTools);
                          if (next.has(tool)) next.delete(tool); else next.add(tool);
                          setModalTools(next);
                        }}
                        className="h-3.5 w-3.5 text-blue-600 rounded border-gray-300"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {modalTools.size === allTools.length ? 'All tools — inherits tenant permissions.' : `${modalTools.size} of ${allTools.length} tools selected.`}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KeyRow({
  k,
  isExpanded,
  isExpired,
  onExpand,
  onRevoke,
  allTools,
  selectedTools,
  setSelectedTools,
  onSaveScope,
  onResetScope,
  savingScope,
}: {
  k: ApiKey;
  isExpanded: boolean;
  isExpired: boolean;
  onExpand: () => void;
  onRevoke: () => void;
  allTools: string[];
  selectedTools: Set<string>;
  setSelectedTools: (s: Set<string>) => void;
  onSaveScope: () => void;
  onResetScope: () => void;
  savingScope: boolean;
}) {
  const handleToggleTool = (tool: string) => {
    const next = new Set(selectedTools);
    if (next.has(tool)) {
      next.delete(tool);
    } else {
      next.add(tool);
    }
    setSelectedTools(next);
  };

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}
        onClick={onExpand}
      >
        <td className="px-4 py-3 text-gray-700">
          {k.label || <span className="text-gray-400 italic">no label</span>}
          {k.allowedTools && (
            <span className="ml-2 inline-flex items-center gap-0.5">
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">scoped</span>
              <Tooltip text="This key can only access specific tools instead of all tenant tools. Useful for limiting what an MCP client can do." />
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {isExpired ? (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">expired</span>
          ) : (
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${k.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {k.status}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs">
          {k.expiresAt ? new Date(k.expiresAt).toLocaleString() : 'Never'}
        </td>
        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(k.createdAt).toLocaleString()}</td>
        <td className="px-4 py-3">
          {k.status === 'active' && !isExpired && (
            <button
              onClick={(e) => { e.stopPropagation(); onRevoke(); }}
              className="text-red-600 text-xs hover:underline"
            >
              Revoke
            </button>
          )}
          {k.revokedAt && <span className="text-xs text-gray-400">Revoked {new Date(k.revokedAt).toLocaleDateString()}</span>}
        </td>
      </tr>
      {isExpanded && k.status === 'active' && !isExpired && (
        <tr>
          <td colSpan={5} className="px-4 py-4 bg-gray-50 border-t border-gray-200">
            <div className="max-w-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">
                <span className="inline-flex items-center gap-1">Per-Key Tool Scoping<Tooltip text="Restrict which MCP tools this specific key can call. By default, a key inherits the tenant's tool permissions. Scoping lets you create limited-access keys for specific use cases." /></span>
              </h4>
              <p className="text-xs text-gray-500 mb-3">
                Select which tools this key can access. Reset to inherit tenant defaults.
              </p>
              <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto mb-3">
                {allTools.map((tool) => (
                  <label key={tool} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <span className="text-xs font-mono text-gray-700">{tool}</span>
                    <input
                      type="checkbox"
                      checked={selectedTools.has(tool)}
                      onChange={() => handleToggleTool(tool)}
                      className="h-3.5 w-3.5 text-blue-600 rounded border-gray-300"
                    />
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onSaveScope(); }}
                  disabled={savingScope}
                  className="bg-blue-600 text-white text-xs font-medium py-1.5 px-3 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingScope ? 'Saving...' : 'Save Scope'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onResetScope(); }}
                  disabled={savingScope}
                  className="border border-gray-300 text-gray-700 text-xs font-medium py-1.5 px-3 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Reset to Tenant Default
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Tool permissions tab. Fetches the enabled/disabled state of all MCP tools
 * for the tenant and renders them grouped by category (Inventory, Orders &
 * Billing, CRM, Knowledge Base). Changes are staged locally until "Save
 * Changes" is clicked. "Enable All" and "Disable All" shortcuts are provided.
 *
 * @param tenantId - UUID of the tenant whose tool permissions are managed.
 */
function ToolsTab({ tenantId }: { tenantId: string }) {
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [globalRegistry, setGlobalRegistry] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([getToolPermissions(tenantId), listToolRegistry()])
      .then(([perms, registry]) => {
        setPermissions(perms);
        setGlobalRegistry(new Map(registry.map((t) => [t.toolName, t.isActive])));
        setDirty(false);
      })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const toggle = (toolName: string) => {
    if (globalRegistry.get(toolName) === false) return;
    setPermissions((prev) =>
      prev.map((p) => (p.toolName === toolName ? { ...p, enabled: !p.enabled } : p))
    );
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await updateToolPermissions(tenantId, permissions);
      setPermissions(result);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const enableAll = () => {
    setPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        enabled: globalRegistry.get(p.toolName) !== false,
      }))
    );
    setDirty(true);
  };

  const disableAll = () => {
    setPermissions((prev) => prev.map((p) => ({ ...p, enabled: false })));
    setDirty(true);
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const groups = [
    { label: 'Inventory', tools: permissions.filter((p) => ['list_products', 'get_product', 'list_stock_levels', 'get_stock_level', 'list_low_stock', 'list_suppliers', 'get_supplier'].includes(p.toolName)) },
    { label: 'Orders & Billing', tools: permissions.filter((p) => ['list_orders', 'get_order', 'list_invoices', 'get_invoice', 'list_overdue_invoices', 'get_payment_summary'].includes(p.toolName)) },
    { label: 'CRM', tools: permissions.filter((p) => ['list_contacts', 'get_contact', 'search_contacts', 'get_contact_orders', 'get_contact_invoices'].includes(p.toolName)) },
    { label: 'Knowledge Base', tools: permissions.filter((p) => ['search_kb', 'get_kb_article', 'get_kb_sync_status'].includes(p.toolName)) },
  ];

  const disabledGlobalCount = permissions.filter((p) => globalRegistry.get(p.toolName) === false).length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={enableAll} className="text-xs text-blue-600 hover:underline">Enable All</button>
        <button onClick={disableAll} className="text-xs text-red-600 hover:underline">Disable All</button>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {disabledGlobalCount > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mb-4 text-xs text-gray-500">
          {disabledGlobalCount} tool{disabledGlobalCount > 1 ? 's are' : ' is'} disabled globally in{' '}
          <a href="/dashboard/setup" className="text-blue-600 hover:underline font-medium">Server Setup</a>{' '}
          and cannot be enabled per-tenant.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.label}>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              <span className="inline-flex items-center gap-1">{g.label}
                {g.label === 'Inventory' && <Tooltip text="Tools for checking product catalogs, stock levels, and supplier information from the ERP system." />}
                {g.label === 'Orders & Billing' && <Tooltip text="Tools for viewing sales orders, invoices, overdue payments, and payment summaries from the ERP system." />}
                {g.label === 'CRM' && <Tooltip text="Tools for looking up customer contacts, their order history, and invoice records in the ERP system." />}
                {g.label === 'Knowledge Base' && <Tooltip text="Tools for searching and retrieving articles from the knowledge base. Includes both YouTrack-synced and manually uploaded documents." />}
              </span>
            </h3>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {g.tools.map((p) => {
                const globallyDisabled = globalRegistry.get(p.toolName) === false;
                return (
                  <label
                    key={p.toolName}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      globallyDisabled
                        ? 'opacity-50 cursor-not-allowed bg-gray-50'
                        : 'cursor-pointer hover:bg-gray-50'
                    }`}
                    title={globallyDisabled ? 'Disabled globally in Server Setup' : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-mono ${globallyDisabled ? 'text-gray-400' : 'text-gray-700'}`}>{p.toolName}</span>
                      {globallyDisabled && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">Global Off</span>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={globallyDisabled ? false : p.enabled}
                      onChange={() => toggle(p.toolName)}
                      disabled={globallyDisabled}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 disabled:opacity-40"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * ERP configuration tab. Pre-populates fields from the tenant's stored ERP
 * credentials and allows updating them. Provides a "Test Connection" button
 * that verifies the saved credentials via a live API call without requiring
 * a save first. Credential fields are masked for passwords and secrets.
 *
 * @param tenant - Full tenant detail used to pre-populate the ERP fields.
 */
function ErpTab({ tenant }: { tenant: TenantDetail }) {
  const tenantId = tenant.id;
  const [config, setConfig] = useState({
    erpBaseUrl: tenant.erpBaseUrl ?? '',
    erpClientId: tenant.erpClientId ?? '',
    erpAppSecret: tenant.erpAppSecret ?? '',
    erpUsername: tenant.erpUsername ?? '',
    erpPassword: tenant.erpPassword ?? '',
    erpTerminal: tenant.erpTerminal ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await updateErpConfig(tenantId, config);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(tenantId);
      setTestResult(res);
    } catch (e) {
      setTestResult({ connected: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const fields = [
    { key: 'erpBaseUrl', label: 'Base URL', placeholder: 'https://bigblue.posibolt.com', type: 'url', tooltip: 'The root URL of your POSibolt ERP server. All API calls go to endpoints under this address.' },
    { key: 'erpClientId', label: 'Client ID', placeholder: 'OAuth client_id', type: 'text', tooltip: 'The OAuth client identifier issued by POSibolt. Used together with the App Secret to authenticate API requests.' },
    { key: 'erpAppSecret', label: 'App Secret', placeholder: 'OAuth app_secret', type: 'password', tooltip: 'The OAuth client secret from POSibolt. Paired with the Client ID to obtain access tokens. Never share this value.' },
    { key: 'erpUsername', label: 'Username', placeholder: 'POSibolt username', type: 'text', tooltip: "The POSibolt user account that will be used for all ERP operations. This user's permissions determine what data is accessible." },
    { key: 'erpPassword', label: 'Password', placeholder: 'POSibolt password', type: 'password', tooltip: 'The password for the POSibolt user account. Stored encrypted and used to obtain OAuth tokens.' },
    { key: 'erpTerminal', label: 'Terminal', placeholder: 'Terminal 1', type: 'text', tooltip: 'The POSibolt terminal or point-of-sale identifier. Required for transaction operations like creating invoices.' },
  ] satisfies { key: keyof typeof config; label: string; placeholder: string; type: string; tooltip: string }[];

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-4">
        Configure the POSibolt ERP connection for this tenant. All 6 fields are required for ERP tools to work.
        Leave fields blank to keep existing values.
      </p>

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-flex items-center gap-1">{f.label}<Tooltip text={f.tooltip} /></span>
            </label>
            <input
              type={f.type}
              value={config[f.key]}
              onChange={(e) => setConfig((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Config'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      {saved && <p className="text-sm text-green-600 mt-3">Configuration saved.</p>}

      {testResult && (
        <div className={`mt-3 p-3 rounded-lg text-sm ${testResult.connected ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {testResult.connected ? 'Connected successfully' : testResult.message}
        </div>
      )}
    </div>
  );
}

/**
 * Audit log tab. Displays a paginated, filterable table of MCP tool calls
 * made by clients using this tenant's API keys. Each entry shows the tool
 * name, success/error status, execution duration, and timestamp. Users can
 * filter by tool name or status, and clear filters with one click.
 *
 * @param tenantId - UUID of the tenant whose audit log is displayed.
 */
function AuditTab({ tenantId }: { tenantId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Filter state
  const [filterTool, setFilterTool] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [allTools, setAllTools] = useState<string[]>([]);

  // Load tools list for filter dropdown
  useEffect(() => {
    listAllTools().then(setAllTools).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    getAuditLog(tenantId, {
      limit,
      offset,
      toolName: filterTool || undefined,
      status: filterStatus || undefined,
    })
      .then((res) => { setEntries(res.entries); setTotalCount(res.totalCount); })
      .finally(() => setLoading(false));
  }, [tenantId, offset, filterTool, filterStatus]);

  const clearFilters = () => {
    setFilterTool('');
    setFilterStatus('');
    setOffset(0);
  };

  const hasFilters = filterTool || filterStatus;

  if (loading && entries.length === 0) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        <span className="inline-flex items-center gap-1">Audit Log<Tooltip text="A record of every MCP tool call made by clients using this tenant's API keys. Shows which tools were called, whether they succeeded, and how long they took." /></span>
      </p>

      {/* Filter controls */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterTool}
          onChange={(e) => { setFilterTool(e.target.value); setOffset(0); }}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Tools</option>
          {allTools.map((tool) => (
            <option key={tool} value={tool}>{tool}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setOffset(0); }}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {totalCount} total log entries{hasFilters ? ' (filtered)' : ''}
      </p>

      {entries.length === 0 ? (
        <p className="text-gray-400 text-sm">No audit log entries{hasFilters ? ' matching filters' : ' yet'}. Tool calls will appear here.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tool</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  <span className="inline-flex items-center gap-1">Duration<Tooltip text="How long the tool call took to complete, in milliseconds. Includes the round-trip time to the ERP server." /></span>
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{e.toolName}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{e.durationMs ? `${e.durationMs}ms` : '-'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > limit && (
        <div className="flex items-center justify-between mt-4">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Showing {offset + 1}-{Math.min(offset + limit, totalCount)} of {totalCount}
          </span>
          <button
            disabled={offset + limit >= totalCount}
            onClick={() => setOffset(offset + limit)}
            className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
