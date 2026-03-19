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
  updateKeyAllowedTools,
  type TenantDetail,
  type ApiKey,
  type ToolPermission,
  type AuditEntry,
} from '../api';

type Tab = 'keys' | 'tools' | 'erp' | 'audit';

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
    { key: 'audit', label: 'Audit Log' },
  ];

  return (
    <div>
      <div className="mb-6">
        <Link to="/tenants" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">
          &larr; All tenants
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">{tenant.name}</h1>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${tenant.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {tenant.status}
          </span>
          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">{tenant.plan}</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Slug: <code className="text-xs bg-gray-100 px-1 rounded">{tenant.slug}</code>
          {' '}&middot;{' '}
          ID: <code className="text-xs bg-gray-100 px-1 rounded">{tenant.id}</code>
        </p>
      </div>

      <div className="border-b border-gray-200 mb-6">
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
      {tab === 'audit' && <AuditTab tenantId={tenant.id} />}
    </div>
  );
}

function KeysTab({ tenant, onRefresh }: { tenant: TenantDetail; onRefresh: () => void }) {
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [newKey, setNewKey] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedKeyId, setExpandedKeyId] = useState<string | null>(null);
  const [allTools, setAllTools] = useState<string[]>([]);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [savingScope, setSavingScope] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await createApiKey(tenant.id, newKeyLabel || undefined, expiresAt || null);
      setNewKey(res.apiKey);
      setNewKeyLabel('');
      setExpiresAt('');
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

  const handleExpand = async (key: ApiKey) => {
    if (expandedKeyId === key.id) {
      setExpandedKeyId(null);
      return;
    }

    // Load tools list on first expand
    if (!toolsLoaded) {
      try {
        const tools = await listAllTools();
        setAllTools(tools);
        setToolsLoaded(true);
      } catch {
        // ignore
      }
    }

    // Pre-populate selected tools from key's allowedTools
    if (key.allowedTools) {
      setSelectedTools(new Set(key.allowedTools));
    } else {
      // null = inherits tenant defaults, show all checked
      setSelectedTools(new Set(allTools));
    }

    setExpandedKeyId(key.id);
  };

  const handleSaveScope = async (keyId: string) => {
    setSavingScope(true);
    try {
      // If all tools are selected, send null (inherit tenant defaults)
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

  return (
    <div>
      {newKey && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-yellow-800 font-medium mb-2">New API key created. Save it now -- it will not be shown again.</p>
          <div className="bg-white border border-yellow-300 rounded px-3 py-2 font-mono text-xs break-all select-all">
            {newKey}
          </div>
          <button onClick={() => setNewKey('')} className="text-xs text-yellow-700 mt-2 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={newKeyLabel}
          onChange={(e) => setNewKeyLabel(e.target.value)}
          placeholder="Key label (optional)"
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          title="Expiry date (optional)"
        />
        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-blue-600 text-white text-sm font-medium py-1.5 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Issue New Key'}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Label</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Expires</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenant.apiKeys.map((k) => (
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
          </tbody>
        </table>
      </div>
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
  const toggleTool = (tool: string) => {
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
            <span className="ml-2 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">scoped</span>
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
              <h4 className="text-sm font-medium text-gray-700 mb-2">Per-Key Tool Scoping</h4>
              <p className="text-xs text-gray-500 mb-3">
                Select which tools this key can access. Uncheck all and save to use tenant defaults.
              </p>
              <div className="bg-white rounded border border-gray-200 divide-y divide-gray-100 max-h-60 overflow-y-auto mb-3">
                {allTools.map((tool) => (
                  <label key={tool} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50">
                    <span className="text-xs font-mono text-gray-700">{tool}</span>
                    <input
                      type="checkbox"
                      checked={selectedTools.has(tool)}
                      onChange={() => toggleTool(tool)}
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

function ToolsTab({ tenantId }: { tenantId: string }) {
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    getToolPermissions(tenantId)
      .then((p) => { setPermissions(p); setDirty(false); })
      .finally(() => setLoading(false));
  }, [tenantId]);

  const toggle = (toolName: string) => {
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
    setPermissions((prev) => prev.map((p) => ({ ...p, enabled: true })));
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

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.label}>
            <h3 className="text-sm font-medium text-gray-700 mb-2">{g.label}</h3>
            <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
              {g.tools.map((p) => (
                <label key={p.toolName} className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                  <span className="text-sm font-mono text-gray-700">{p.toolName}</span>
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => toggle(p.toolName)}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    { key: 'erpBaseUrl', label: 'Base URL', placeholder: 'https://bigblue.posibolt.com', type: 'url' },
    { key: 'erpClientId', label: 'Client ID', placeholder: 'OAuth client_id', type: 'text' },
    { key: 'erpAppSecret', label: 'App Secret', placeholder: 'OAuth app_secret', type: 'password' },
    { key: 'erpUsername', label: 'Username', placeholder: 'POSibolt username', type: 'text' },
    { key: 'erpPassword', label: 'Password', placeholder: 'POSibolt password', type: 'password' },
    { key: 'erpTerminal', label: 'Terminal', placeholder: 'Terminal 1', type: 'text' },
  ] as const;

  return (
    <div className="max-w-lg">
      <p className="text-sm text-gray-500 mb-4">
        Configure the POSibolt ERP connection for this tenant. All 6 fields are required for ERP tools to work.
        Leave fields blank to keep existing values.
      </p>

      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
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
