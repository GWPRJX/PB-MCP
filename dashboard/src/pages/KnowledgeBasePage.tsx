import { useEffect, useState } from 'react';
import { Tooltip } from '../components/Tooltip';
import { useToast } from '../components/ToastProvider';
import mammoth from 'mammoth';
import {
  getKbSettings,
  updateKbSettings,
  getKbSyncStatus,
  refreshKb,
  testYouTrackConnection,
  listToolRegistry,
  uploadDoc,
  listDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  analyzeDoc,
  updateDocMappings,
  getToolConfig,
  updateToolConfig,
  type KbSettings,
  type SyncStatus,
  type KbDoc,
  type KbDocFull,
  type ToolRegistryEntry,
  type ToolApiConfig,
} from '../api';

/**
 * Knowledge Base management page. Renders three sections:
 * - {@link YouTrackConfigSection} — YouTrack connection settings and sync interval.
 * - {@link SyncStatusSection} — Last sync result and a manual "Sync Now" button.
 * - {@link UploadedDocsSection} — CRUD table for manually uploaded Markdown documents.
 */
export function KnowledgeBasePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-8">Knowledge Base</h1>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">
          <span className="inline-flex items-center gap-1">YouTrack Configuration<Tooltip text="Connect to a YouTrack project to automatically sync knowledge base articles. Articles are pulled on a schedule and made searchable via MCP tools." /></span>
        </h2>
        <YouTrackConfigSection />
      </div>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">
          <span className="inline-flex items-center gap-1">Sync Status<Tooltip text="Shows when the last YouTrack sync happened, how many articles were pulled, and whether it succeeded. Use Sync Now to trigger an immediate refresh." /></span>
        </h2>
        <SyncStatusSection />
      </div>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">
          <span className="inline-flex items-center gap-1">API Knowledge<Tooltip text="The POSibolt ERP APIs that PB MCP knows how to use. These are the built-in tools available to AI clients, grouped by domain." /></span>
        </h2>
        <ApiKnowledgeSection />
      </div>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">
          <span className="inline-flex items-center gap-1">Uploaded Documents<Tooltip text="Manually uploaded documentation that supplements YouTrack articles. These are searchable by all tenants via MCP knowledge base tools." /></span>
        </h2>
        <UploadedDocsSection />
      </div>
    </div>
  );
}

/**
 * Form for configuring the YouTrack integration. Loads current settings on
 * mount and allows updating the base URL, API token, project ID, and sync
 * interval. The token field shows a masked hint when a token is already set;
 * it is only included in the save payload when a new value is entered.
 */
function YouTrackConfigSection() {
  const toast = useToast();
  const [settings, setSettings] = useState<KbSettings>({
    youtrackBaseUrl: '',
    youtrackToken: '',
    youtrackProject: '',
    youtrackQuery: '',
    syncIntervalMs: 3600000,
  });
  const [originalToken, setOriginalToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);

  useEffect(() => {
    getKbSettings()
      .then((s) => {
        setSettings(s);
        setOriginalToken(s.youtrackToken);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload: Partial<KbSettings> = {};
      if (settings.youtrackBaseUrl !== null) payload.youtrackBaseUrl = settings.youtrackBaseUrl;
      if (settings.youtrackProject !== null) payload.youtrackProject = settings.youtrackProject;
      if (settings.youtrackQuery !== null) payload.youtrackQuery = settings.youtrackQuery;
      payload.syncIntervalMs = settings.syncIntervalMs;

      // Only send token if user typed a new one (not the masked value)
      const tokenChanged = settings.youtrackToken !== originalToken;
      const tokenIsJustAsterisks = settings.youtrackToken != null && /^\*+$/.test(settings.youtrackToken || '');
      if (tokenChanged && !tokenIsJustAsterisks) {
        payload.youtrackToken = settings.youtrackToken;
      }

      await updateKbSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Settings saved');
    } catch (e) {
      toast.error('Failed to save settings: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const intervalMinutes = Math.round(settings.syncIntervalMs / 60000);

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="max-w-xl">
      <p className="text-sm text-gray-500 mb-4">
        Configure the YouTrack instance for automatic KB article syncing. Leave fields blank to keep existing values.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
          <input
            type="text"
            value={settings.youtrackBaseUrl ?? ''}
            onChange={(e) => setSettings((prev) => ({ ...prev, youtrackBaseUrl: e.target.value }))}
            placeholder="https://youtrack.example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="inline-flex items-center gap-1">API Token<Tooltip text="A permanent token from YouTrack that grants read access to your project's articles. Generate one in YouTrack under Profile > Authentication > New Token." /></span>
          </label>
          <input
            type="password"
            value={settings.youtrackToken ?? ''}
            onChange={(e) => setSettings((prev) => ({ ...prev, youtrackToken: e.target.value }))}
            placeholder="perm.your-token-here"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {originalToken && (
            <p className="text-xs text-gray-400 mt-1">Token is set. Enter a new value to replace it.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project ID</label>
          <input
            type="text"
            value={settings.youtrackProject ?? ''}
            onChange={(e) => setSettings((prev) => ({ ...prev, youtrackProject: e.target.value }))}
            placeholder="MY-PROJECT"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="inline-flex items-center gap-1">Article Filter<Tooltip text="Optional YouTrack search query appended to the project filter. Use this to sync only specific articles, e.g. 'tag: api' to sync only articles tagged 'api', or 'tag: {api} tag: {docs}' for multiple tags." /></span>
          </label>
          <input
            type="text"
            value={settings.youtrackQuery ?? ''}
            onChange={(e) => setSettings((prev) => ({ ...prev, youtrackQuery: e.target.value }))}
            placeholder="tag: api (leave blank for all articles)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            YouTrack query syntax. Examples: <code className="bg-gray-100 px-1 rounded">tag: api</code> (single tag),{' '}
            <code className="bg-gray-100 px-1 rounded">tag: api tag: docs</code> (multiple tags),{' '}
            <code className="bg-gray-100 px-1 rounded">tag: api updated: {'>'} 2025-01-01</code> (tag + date filter)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="inline-flex items-center gap-1">Sync Interval (minutes)<Tooltip text="How often the server automatically pulls new and updated articles from YouTrack. Lower values mean fresher data but more API calls to YouTrack." /></span>
          </label>
          <input
            type="number"
            value={intervalMinutes}
            onChange={(e) => setSettings((prev) => ({ ...prev, syncIntervalMs: Number(e.target.value) * 60000 }))}
            min={1}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            onClick={async () => {
              setTesting(true);
              setTestResult(null);
              try {
                const res = await testYouTrackConnection();
                setTestResult(res);
                if (res.connected) toast.success(res.message);
                else toast.error(res.message);
              } catch (e) {
                setTestResult({ connected: false, message: (e as Error).message });
                toast.error('Test failed: ' + (e as Error).message);
              } finally {
                setTesting(false);
              }
            }}
            disabled={testing}
            className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          {saved && <span className="text-sm text-green-600">Saved!</span>}
          {testResult && (
            <span className={`text-sm ${testResult.connected ? 'text-green-600' : 'text-red-600'}`}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Displays the current YouTrack sync status: last sync time, number of
 * articles synced in the last run, total article count, and any error from
 * the last attempt. Provides a "Sync Now" button that triggers an immediate
 * refresh and shows the result inline for 5 seconds before refreshing status.
 */
function SyncStatusSection() {
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    getKbSyncStatus()
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(fetchStatus, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await refreshKb();
      setSyncResult({ ok: true, message: `Synced ${res.article_count} articles` });
      toast.success(`Synced ${res.article_count} articles`);
      setTimeout(() => {
        setSyncResult(null);
        fetchStatus();
      }, 5000);
    } catch (e) {
      setSyncResult({ ok: false, message: `Failed: ${(e as Error).message}` });
      toast.error('Sync failed: ' + (e as Error).message);
      setTimeout(() => {
        setSyncResult(null);
        fetchStatus();
      }, 5000);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-xl">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Last Sync</p>
          <p className="text-sm text-gray-800">
            {status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never synced'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Articles Synced</p>
          <p className="text-sm text-gray-800">
            {status?.lastSyncArticleCount != null ? status.lastSyncArticleCount : '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Articles</p>
          <p className="text-sm text-gray-800">{status?.totalArticleCount ?? 0}</p>
        </div>
      </div>

      {status?.lastSyncError && (
        <div className="border border-red-200 rounded-md p-3 mb-4 bg-red-50">
          <p className="text-xs text-red-700">Last error: {status.lastSyncError}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSyncNow}
          disabled={syncing}
          className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
        {syncResult && (
          <span className={`text-sm ${syncResult.ok ? 'text-green-600' : 'text-red-600'}`}>
            {syncResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

/** POSibolt API endpoints used by each MCP tool. */
const TOOL_API_MAP: Record<string, { method: string; endpoint: string; note?: string }[]> = {
  list_products:       [{ method: 'GET', endpoint: '/productmaster/productlist', note: 'Paginated active product list' }],
  get_product:         [{ method: 'GET', endpoint: '/productmaster/search', note: 'Search by name, SKU, or barcode' }],
  list_stock_levels:   [{ method: 'GET', endpoint: '/warehousemaster/getWareHouseInventory', note: 'Stock per warehouse' }],
  get_stock_level:     [{ method: 'GET', endpoint: '/productmaster/search', note: 'Product stock lookup' }],
  list_low_stock:      [{ method: 'GET', endpoint: '/productmaster/productlist', note: 'Filtered client-side by threshold' }],
  list_suppliers:      [{ method: '-', endpoint: 'Delegates to search_contacts', note: 'Use search_contacts with type="vendor"' }],
  get_supplier:        [{ method: 'GET', endpoint: '/customermaster/{vendorId}', note: 'Single vendor by ID' }],
  list_orders:         [{ method: 'GET', endpoint: '/salesorder/saleshistory', note: 'Sales history with date range' }],
  get_order:           [{ method: 'GET', endpoint: '/salesorder/getsalesdetails', note: 'Single order by orderNo' }],
  list_invoices:       [{ method: 'GET', endpoint: '/salesinvoice/getPreviousInvoices', note: 'Invoice list with date range' }],
  get_invoice:         [{ method: 'GET', endpoint: '/salesorder/getsalesdetails', note: 'Single invoice by invoiceNo' }],
  list_overdue_invoices: [{ method: 'GET', endpoint: '/customermaster/getCustomerOpenInvoices', note: 'Open/unpaid invoices for customer' }],
  get_payment_summary: [{ method: 'GET', endpoint: '/salesorder/saleshistory', note: 'Aggregated payment totals' }],
  list_contacts:       [{ method: 'GET', endpoint: '/customermaster/allbplist', note: 'All business partners (paginated in JS)' }],
  get_contact:         [{ method: 'GET', endpoint: '/customermaster/{customerId}', note: 'Single contact detail' }],
  search_contacts:     [{ method: 'GET', endpoint: '/customermaster/allbplist', note: 'Filtered by name/email in JS' }],
  get_contact_orders:  [{ method: 'GET', endpoint: '/salesorder/pendingcustomerorders/{customerId}', note: 'Pending orders for customer' }],
  get_contact_invoices: [{ method: 'GET', endpoint: '/customermaster/getCustomerOpenInvoices', note: 'Open invoices + balance' }],
  create_stock_entry:  [{ method: 'POST', endpoint: '/stocktransferrequest', note: 'Create stock transfer request' }],
  update_stock_entry:  [{ method: 'POST', endpoint: '/stocktransfer/completestocktransfer', note: 'Finalize stock transfer' }],
  create_invoice:      [{ method: 'POST', endpoint: '/salesinvoice/createorderinvoice', note: 'Create sales order + invoice' }],
  update_invoice:      [{ method: 'POST', endpoint: '/salesorder/cancelorder', note: 'Cancel existing order' }],
  create_contact:      [{ method: 'POST', endpoint: '/customermaster', note: 'Create business partner' }],
  update_contact:      [{ method: 'POST', endpoint: '/customermaster/{id}', note: 'Update business partner' }],
  search_kb:           [{ method: 'SQL', endpoint: 'kb_articles', note: 'ILIKE search on summary + content' }],
  get_kb_article:      [{ method: 'SQL', endpoint: 'kb_articles', note: 'Full article by youtrack_id' }],
  get_kb_sync_status:  [{ method: 'SQL', endpoint: 'kb_articles', note: 'Article count + last sync time' }],
};

/**
 * Shows all registered MCP tools grouped by category with expandable
 * POSibolt API endpoint details. Allows inline editing of endpoint overrides.
 */
function ApiKnowledgeSection() {
  const toast = useToast();
  const [tools, setTools] = useState<ToolRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Inline edit state
  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [editEndpoint, setEditEndpoint] = useState('');
  const [editMethod, setEditMethod] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  // Track overrides loaded from the server
  const [overrides, setOverrides] = useState<Map<string, ToolApiConfig>>(new Map());

  useEffect(() => {
    listToolRegistry()
      .then(setTools)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (toolName: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const handleEditEndpoint = async (toolName: string) => {
    const defaultApi = TOOL_API_MAP[toolName]?.[0];
    // Load current override from server
    try {
      const res = await getToolConfig(toolName);
      if (res.config) {
        setEditEndpoint(res.config.endpoint);
        setEditMethod(res.config.method ?? defaultApi?.method ?? '');
        setEditNotes(res.config.notes ?? defaultApi?.note ?? '');
      } else {
        setEditEndpoint(defaultApi?.endpoint ?? '');
        setEditMethod(defaultApi?.method ?? '');
        setEditNotes(defaultApi?.note ?? '');
      }
    } catch {
      setEditEndpoint(defaultApi?.endpoint ?? '');
      setEditMethod(defaultApi?.method ?? '');
      setEditNotes(defaultApi?.note ?? '');
    }
    setEditingTool(toolName);
  };

  const handleSaveEndpoint = async () => {
    if (!editingTool || !editEndpoint.trim()) return;
    setSavingConfig(true);
    try {
      await updateToolConfig(editingTool, {
        endpoint: editEndpoint.trim(),
        method: editMethod.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(editingTool, {
          endpoint: editEndpoint.trim(),
          method: editMethod.trim() || undefined,
          notes: editNotes.trim() || undefined,
        });
        return next;
      });
      toast.success(`Endpoint updated for ${editingTool}`);
      setEditingTool(null);
    } catch (e) {
      toast.error('Save failed: ' + (e as Error).message);
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  const categories = new Map<string, ToolRegistryEntry[]>();
  for (const t of tools) {
    const list = categories.get(t.category) ?? [];
    list.push(t);
    categories.set(t.category, list);
  }

  const categoryLabels: Record<string, string> = {
    inventory: 'Inventory',
    orders: 'Orders & Billing',
    crm: 'CRM / Contacts',
    kb: 'Knowledge Base',
    write: 'Write Operations',
  };

  const activeCount = tools.filter((t) => t.isActive).length;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {activeCount} of {tools.length} tools active.
        Click a tool to see which POSibolt APIs it uses.
        Tools are enabled/disabled in <a href="/dashboard/setup" className="text-blue-600 hover:underline">Server Setup</a>.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from(categories.entries()).map(([cat, catTools]) => (
          <div key={cat} className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide mb-3">
              {categoryLabels[cat] ?? cat} ({catTools.filter((t) => t.isActive).length}/{catTools.length})
            </h3>
            <ul className="space-y-1">
              {catTools.map((t) => {
                const apis = TOOL_API_MAP[t.toolName];
                const isExpanded = expanded.has(t.toolName);
                return (
                  <li key={t.toolName} className={t.isActive ? '' : 'opacity-40'}>
                    <button
                      onClick={() => toggleExpand(t.toolName)}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${t.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-sm font-mono text-gray-700 flex-1 truncate">{t.toolName}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                    </button>
                    {isExpanded && (
                      <div className="ml-6 mt-1 mb-2 pl-3 border-l-2 border-gray-200 space-y-1.5">
                        {t.description && (
                          <p className="text-xs text-gray-500">{t.description}</p>
                        )}
                        {(() => {
                          const override = overrides.get(t.toolName);
                          const displayEndpoint = override?.endpoint ?? apis?.[0]?.endpoint;
                          const displayMethod = override?.method ?? apis?.[0]?.method;
                          const displayNote = override?.notes ?? apis?.[0]?.note;
                          const isOverridden = !!override;
                          return (
                            <>
                              {displayEndpoint && (
                                <div className="flex items-center gap-2">
                                  {displayMethod && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      displayMethod === 'GET' ? 'bg-blue-100 text-blue-700' :
                                      displayMethod === 'POST' ? 'bg-green-100 text-green-700' :
                                      displayMethod === 'SQL' ? 'bg-purple-100 text-purple-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>{displayMethod}</span>
                                  )}
                                  <code className="text-xs text-gray-600 font-mono">{displayEndpoint}</code>
                                  {isOverridden && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">custom</span>
                                  )}
                                </div>
                              )}
                              {displayNote && (
                                <p className="text-[11px] text-gray-400">{displayNote}</p>
                              )}
                              {!displayEndpoint && !apis && (
                                <p className="text-xs text-gray-400 italic">No API mapping available</p>
                              )}

                              {/* Edit inline form */}
                              {editingTool === t.toolName ? (
                                <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 space-y-2">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Endpoint</label>
                                    <input
                                      type="text"
                                      value={editEndpoint}
                                      onChange={(e) => setEditEndpoint(e.target.value)}
                                      placeholder="/productmaster/productdetailedlist"
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <div className="flex-1">
                                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Method</label>
                                      <select
                                        value={editMethod}
                                        onChange={(e) => setEditMethod(e.target.value)}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      >
                                        <option value="GET">GET</option>
                                        <option value="POST">POST</option>
                                        <option value="SQL">SQL</option>
                                      </select>
                                    </div>
                                    <div className="flex-[2]">
                                      <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Notes</label>
                                      <input
                                        type="text"
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        placeholder="Optional note"
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <button
                                      onClick={handleSaveEndpoint}
                                      disabled={savingConfig || !editEndpoint.trim()}
                                      className="bg-blue-600 text-white text-[11px] font-medium py-1 px-3 rounded hover:bg-blue-700 disabled:opacity-50"
                                    >
                                      {savingConfig ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      onClick={() => setEditingTool(null)}
                                      className="border border-gray-300 text-gray-600 text-[11px] font-medium py-1 px-3 rounded hover:bg-gray-50"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleEditEndpoint(t.toolName)}
                                  className="text-[11px] text-blue-600 hover:underline mt-1"
                                >
                                  Edit Endpoint
                                </button>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Paginated CRUD interface for manually-uploaded KB documents. Supports
 * uploading new Markdown documents with a title and optional comma-separated
 * tags, inline editing of existing documents, and deletion with confirmation.
 * Pagination is handled client-side in increments of 25 documents.
 */
interface ToolSuggestion {
  toolName: string;
  confidence: string;
  matchedPatterns: string[];
}

function UploadedDocsSection() {
  const toast = useToast();
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploading, setUploading] = useState(false);

  // Edit state
  const [editingDoc, setEditingDoc] = useState<KbDocFull | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Mapping state
  const [mappingDocId, setMappingDocId] = useState<string | null>(null);
  const [mappingDocTitle, setMappingDocTitle] = useState('');
  const [suggestions, setSuggestions] = useState<ToolSuggestion[]>([]);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [savingMappings, setSavingMappings] = useState(false);
  const [allToolNames, setAllToolNames] = useState<{ toolName: string; displayName: string; category: string }[]>([]);

  useEffect(() => {
    listToolRegistry()
      .then((tools) => setAllToolNames(tools.map((t) => ({ toolName: t.toolName, displayName: t.displayName, category: t.category }))))
      .catch(() => {});
  }, []);

  const fetchDocs = () => {
    setLoading(true);
    listDocs({ limit, offset })
      .then((res) => { setDocs(res.docs); setTotalCount(res.totalCount); })
      .finally(() => setLoading(false));
  };

  useEffect(fetchDocs, [offset]);

  const handleUpload = async () => {
    if (!uploadTitle.trim() || !uploadContent.trim()) return;
    setUploading(true);
    try {
      const tags = uploadTags.split(',').map((t) => t.trim()).filter(Boolean);
      const result = await uploadDoc({ title: uploadTitle.trim(), content: uploadContent, tags: tags.length > 0 ? tags : undefined });
      setUploadTitle('');
      setUploadContent('');
      setUploadTags('');
      setShowUpload(false);
      setOffset(0);
      fetchDocs();
      toast.success('Document uploaded — analyzing for tool mappings...');
      handleAnalyze(result.id, uploadTitle.trim());
    } catch (e) {
      toast.error('Upload failed: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (docId: string, docTitle: string) => {
    setMappingDocId(docId);
    setMappingDocTitle(docTitle);
    setAnalyzing(true);
    setSuggestions([]);
    setSelectedTools(new Set());
    try {
      const res = await analyzeDoc(docId);
      setSuggestions(res.suggestions);
      const initial = new Set<string>([
        ...res.currentMappings,
        ...res.suggestions.map((s) => s.toolName),
      ]);
      setSelectedTools(initial);
    } catch (e) {
      toast.error('Analysis failed: ' + (e as Error).message);
      setMappingDocId(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveMappings = async () => {
    if (!mappingDocId) return;
    setSavingMappings(true);
    try {
      await updateDocMappings(mappingDocId, Array.from(selectedTools));
      toast.success(`Mapped ${selectedTools.size} tools to document`);
      setMappingDocId(null);
    } catch (e) {
      toast.error('Save failed: ' + (e as Error).message);
    } finally {
      setSavingMappings(false);
    }
  };

  const toggleMapping = (toolName: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const handleEdit = async (docId: string) => {
    try {
      const full = await getDoc(docId);
      setEditingDoc(full);
      setEditTitle(full.title);
      setEditContent(full.content);
      setEditTags(full.tags.join(', '));
    } catch {
      // ignore
    }
  };

  const handleSaveEdit = async () => {
    if (!editingDoc) return;
    setSavingEdit(true);
    try {
      const tags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      await updateDoc(editingDoc.id, { title: editTitle.trim(), content: editContent, tags });
      setEditingDoc(null);
      fetchDocs();
      toast.success('Document updated');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document? This action cannot be undone.')) return;
    try {
      await deleteDoc(docId);
      fetchDocs();
      toast.success('Document deleted');
    } catch (e) {
      toast.error('Delete failed: ' + (e as Error).message);
    }
  };

  if (loading && docs.length === 0) return <p className="text-gray-500 text-sm">Loading...</p>;

  // Group all tools by category for the mapping panel
  const toolsByCategory = new Map<string, { toolName: string; displayName: string }[]>();
  for (const t of allToolNames) {
    const list = toolsByCategory.get(t.category) ?? [];
    list.push({ toolName: t.toolName, displayName: t.displayName });
    toolsByCategory.set(t.category, list);
  }

  const categoryLabels: Record<string, string> = {
    inventory: 'Inventory', orders: 'Orders & Billing', crm: 'CRM / Contacts',
    kb: 'Knowledge Base', write: 'Write Operations',
  };

  const suggestedToolNames = new Set(suggestions.map((s) => s.toolName));

  return (
    <div>
      {/* Upload button */}
      <div className="mb-4">
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-blue-700"
        >
          {showUpload ? 'Cancel' : 'Upload New Doc'}
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <div className="space-y-3">
            {/* File upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Upload File</label>
              <input
                type="file"
                accept=".md,.txt,.json,.yaml,.yml,.html,.csv,.docx"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const name = file.name.toLowerCase();
                  if (name.endsWith('.docx')) {
                    try {
                      const arrayBuffer = await file.arrayBuffer();
                      const result = await mammoth.extractRawText({ arrayBuffer });
                      setUploadContent(result.value);
                      if (!uploadTitle.trim()) {
                        setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
                      }
                    } catch {
                      toast.error('Failed to parse .docx file');
                    }
                  } else {
                    const reader = new FileReader();
                    reader.onload = () => {
                      setUploadContent(reader.result as string);
                      if (!uploadTitle.trim()) {
                        setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-xs text-gray-400 mt-1">
                Supports .docx, .md, .txt, .json, .yaml, .html, .csv — or paste content directly below.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Document title"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
              <textarea
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                placeholder="Paste API documentation, endpoint specs, or reference material..."
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="api, docs, v2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadTitle.trim() || !uploadContent.trim()}
                className="bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? 'Uploading & Analyzing...' : 'Upload & Analyze'}
              </button>
              <button
                onClick={() => setShowUpload(false)}
                className="border border-gray-300 text-gray-700 text-sm font-medium py-1.5 px-4 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Mapping Panel */}
      {mappingDocId && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-800">
              Tool Mapping: <span className="text-indigo-700">{mappingDocTitle}</span>
            </h3>
            <button
              onClick={() => setMappingDocId(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          {analyzing ? (
            <p className="text-sm text-gray-500">Analyzing document for API patterns...</p>
          ) : (
            <>
              {suggestions.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-600 mb-2">
                    Auto-detected {suggestions.length} tool{suggestions.length !== 1 ? 's' : ''} from API patterns in the document.
                    Review and adjust the selection below.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {suggestions.map((s) => (
                      <span
                        key={s.toolName}
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          s.confidence === 'high'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {s.toolName} ({s.confidence})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {suggestions.length === 0 && (
                <p className="text-xs text-gray-500 mb-3">
                  No API patterns auto-detected. Manually select which tools this document supports.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {Array.from(toolsByCategory.entries()).map(([cat, tools]) => (
                  <div key={cat} className="bg-white rounded border border-gray-200 p-3">
                    <h4 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide mb-2">
                      {categoryLabels[cat] ?? cat}
                    </h4>
                    <ul className="space-y-1">
                      {tools.map((t) => {
                        const isSuggested = suggestedToolNames.has(t.toolName);
                        const isChecked = selectedTools.has(t.toolName);
                        return (
                          <li key={t.toolName}>
                            <label className="flex items-center gap-2 cursor-pointer py-0.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleMapping(t.toolName)}
                                className="h-3.5 w-3.5 text-indigo-600 rounded border-gray-300"
                              />
                              <span className={`text-xs font-mono ${isSuggested ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>
                                {t.toolName}
                              </span>
                              {isSuggested && (
                                <span className="text-[9px] px-1 py-0.5 bg-indigo-100 text-indigo-600 rounded">auto</span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveMappings}
                  disabled={savingMappings}
                  className="bg-indigo-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingMappings ? 'Saving...' : `Save Mappings (${selectedTools.size} tools)`}
                </button>
                <button
                  onClick={() => setMappingDocId(null)}
                  className="border border-gray-300 text-gray-700 text-sm font-medium py-1.5 px-4 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit panel */}
      {editingDoc && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-800 mb-3">Editing: {editingDoc.youtrackId}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content (Markdown)</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditingDoc(null)}
                className="border border-gray-300 text-gray-700 text-sm font-medium py-1.5 px-4 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doc count */}
      <p className="text-sm text-gray-500 mb-4">{totalCount} uploaded document{totalCount !== 1 ? 's' : ''}</p>

      {/* Docs table */}
      {docs.length === 0 ? (
        <p className="text-gray-400 text-sm">No uploaded docs yet. Upload API documentation to map it to MCP tools and improve tool accuracy.</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tags</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-2.5 text-gray-700">{doc.title}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{doc.youtrackId}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{doc.tags.join(', ') || '-'}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(doc.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAnalyze(doc.id, doc.title)}
                        className="text-indigo-600 text-xs hover:underline"
                      >
                        Map Tools
                      </button>
                      <button
                        onClick={() => handleEdit(doc.id)}
                        className="text-blue-600 text-xs hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="text-red-600 text-xs hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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
