import { useEffect, useState } from 'react';
import {
  getKbSettings,
  updateKbSettings,
  getKbSyncStatus,
  refreshKb,
  uploadDoc,
  listDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  type KbSettings,
  type SyncStatus,
  type KbDoc,
  type KbDocFull,
} from '../api';

export function KnowledgeBasePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-8">Knowledge Base</h1>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">YouTrack Configuration</h2>
        <YouTrackConfigSection />
      </div>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">Sync Status</h2>
        <SyncStatusSection />
      </div>

      <div className="mb-10">
        <h2 className="text-lg font-medium text-gray-800 mb-4">Uploaded Documents</h2>
        <UploadedDocsSection />
      </div>
    </div>
  );
}

function YouTrackConfigSection() {
  const [settings, setSettings] = useState<KbSettings>({
    youtrackBaseUrl: '',
    youtrackToken: '',
    youtrackProject: '',
    syncIntervalMs: 3600000,
  });
  const [originalToken, setOriginalToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

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
          <label className="block text-sm font-medium text-gray-700 mb-1">API Token</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Sync Interval (minutes)</label>
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
          {saved && <span className="text-sm text-green-600">Saved!</span>}
        </div>
      </div>
    </div>
  );
}

function SyncStatusSection() {
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
      setTimeout(() => {
        setSyncResult(null);
        fetchStatus();
      }, 5000);
    } catch (e) {
      setSyncResult({ ok: false, message: `Failed: ${(e as Error).message}` });
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

function UploadedDocsSection() {
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
      await uploadDoc({ title: uploadTitle.trim(), content: uploadContent, tags: tags.length > 0 ? tags : undefined });
      setUploadTitle('');
      setUploadContent('');
      setUploadTags('');
      setShowUpload(false);
      setOffset(0);
      fetchDocs();
    } finally {
      setUploading(false);
    }
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
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document? This action cannot be undone.')) return;
    await deleteDoc(docId);
    fetchDocs();
  };

  if (loading && docs.length === 0) return <p className="text-gray-500 text-sm">Loading...</p>;

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
                placeholder="Markdown content..."
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
                {uploading ? 'Uploading...' : 'Upload'}
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
        <p className="text-gray-400 text-sm">No uploaded docs yet. Use the button above to upload markdown documentation.</p>
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
