import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTenant } from '../api';

export function CreateTenantPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('standard');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ tenantId: string; apiKey: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await createTenant({ name, slug, plan });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">Tenant Created</h1>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-green-800 font-medium mb-2">Save this API key now — it will not be shown again.</p>
          <div className="bg-white border border-green-300 rounded px-3 py-2 font-mono text-xs break-all select-all">
            {result.apiKey}
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">Tenant ID: <code className="text-xs bg-gray-100 px-1 rounded">{result.tenantId}</code></p>
        <button
          onClick={() => navigate(`/tenants/${result.tenantId}`)}
          className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700"
        >
          View Tenant
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Create Tenant</h1>
      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            required
            pattern="^[a-z0-9-]+$"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="standard">Standard</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Tenant'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/tenants')}
            className="text-sm text-gray-600 hover:text-gray-800 py-2 px-4"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
