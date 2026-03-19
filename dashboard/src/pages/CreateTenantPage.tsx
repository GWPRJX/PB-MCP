import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTenant, testErpCredentials } from '../api';
import { Tooltip } from '../components/Tooltip';

const wizardSteps = [
  { num: 1, label: 'Tenant Info' },
  { num: 2, label: 'ERP Credentials' },
  { num: 3, label: 'API Key' },
];

const erpFieldTooltips: Record<string, string> = {
  erpBaseUrl: 'The root URL of the POSibolt ERP server for this tenant.',
  erpClientId: 'The OAuth client identifier issued by POSibolt.',
  erpAppSecret: 'The OAuth client secret from POSibolt. Never share this value.',
  erpUsername: 'The POSibolt user account for ERP operations.',
  erpPassword: 'The password for the POSibolt user account.',
  erpTerminal: 'The POSibolt terminal identifier for transaction operations.',
};

const erpFields = [
  { key: 'erpBaseUrl' as const, label: 'Base URL', placeholder: 'https://bigblue.posibolt.com', type: 'url' },
  { key: 'erpClientId' as const, label: 'Client ID', placeholder: 'OAuth client_id', type: 'text' },
  { key: 'erpAppSecret' as const, label: 'App Secret', placeholder: 'OAuth app_secret', type: 'password' },
  { key: 'erpUsername' as const, label: 'Username', placeholder: 'POSibolt username', type: 'text' },
  { key: 'erpPassword' as const, label: 'Password', placeholder: 'POSibolt password', type: 'password' },
  { key: 'erpTerminal' as const, label: 'Terminal', placeholder: 'Terminal 1', type: 'text' },
];

type ErpKey = 'erpBaseUrl' | 'erpClientId' | 'erpAppSecret' | 'erpUsername' | 'erpPassword' | 'erpTerminal';

export function CreateTenantPage() {
  const navigate = useNavigate();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [plan, setPlan] = useState('standard');

  // Step 2 fields
  const [erpFields_state, setErpFields] = useState<Record<ErpKey, string>>({
    erpBaseUrl: '',
    erpClientId: '',
    erpAppSecret: '',
    erpUsername: '',
    erpPassword: '',
    erpTerminal: '',
  });

  // Step 2 test state
  const [connectionTested, setConnectionTested] = useState(false);
  const [testResult, setTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  // Step 3 state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tenantId: string; apiKey: string } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Slug auto-generation from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) {
      const autoSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(autoSlug);
    }
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(sanitized);
    setSlugEdited(true);
  };

  // ERP field change — resets connection test
  const handleErpFieldChange = (key: ErpKey, value: string) => {
    setErpFields((prev) => ({ ...prev, [key]: value }));
    setConnectionTested(false);
    setTestResult(null);
  };

  // Test ERP connection
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testErpCredentials({
        erpBaseUrl: erpFields_state.erpBaseUrl,
        erpClientId: erpFields_state.erpClientId,
        erpAppSecret: erpFields_state.erpAppSecret,
        erpUsername: erpFields_state.erpUsername,
        erpPassword: erpFields_state.erpPassword,
        erpTerminal: erpFields_state.erpTerminal,
      });
      setTestResult(res);
      if (res.connected) {
        setConnectionTested(true);
      }
    } catch (e) {
      setTestResult({ connected: false, message: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  // Create tenant
  const handleCreate = async () => {
    setError('');
    setSubmitting(true);
    try {
      const res = await createTenant({
        name,
        slug,
        plan,
        erpBaseUrl: erpFields_state.erpBaseUrl,
        erpClientId: erpFields_state.erpClientId,
        erpAppSecret: erpFields_state.erpAppSecret,
        erpUsername: erpFields_state.erpUsername,
        erpPassword: erpFields_state.erpPassword,
        erpTerminal: erpFields_state.erpTerminal,
      });
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Copy API key
  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset all state for "Create Another"
  const handleCreateAnother = () => {
    setStep(1);
    setName('');
    setSlug('');
    setSlugEdited(false);
    setPlan('standard');
    setErpFields({
      erpBaseUrl: '',
      erpClientId: '',
      erpAppSecret: '',
      erpUsername: '',
      erpPassword: '',
      erpTerminal: '',
    });
    setConnectionTested(false);
    setTestResult(null);
    setTesting(false);
    setSubmitting(false);
    setResult(null);
    setError('');
    setCopied(false);
  };

  // Derived
  const allErpFilled = Object.values(erpFields_state).every((v) => v.trim() !== '');
  const canTestConnect = allErpFilled && !testing;
  const canProceedStep1 = name.trim() !== '' && slug.trim() !== '';

  // Stepper component
  const Stepper = () => (
    <div className="flex items-center mb-8">
      {wizardSteps.map((s, i) => {
        const isCompleted = s.num < step;
        const isCurrent = s.num === step;
        return (
          <div key={s.num} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isCompleted
                    ? 'bg-blue-600 text-white'
                    : isCurrent
                    ? 'bg-blue-600 text-white'
                    : 'border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isCompleted ? '✓' : s.num}
              </div>
              <span
                className={`text-xs mt-1 whitespace-nowrap ${
                  isCompleted
                    ? 'text-blue-600'
                    : isCurrent
                    ? 'text-blue-600 font-semibold'
                    : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < wizardSteps.length - 1 && (
              <div className="flex-1 border-t border-gray-300 mx-2 mb-4" />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Create Tenant</h1>

      <Stepper />

      {/* Step 1 — Tenant Info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-flex items-center gap-1">Slug<Tooltip text="A short, URL-safe name for this tenant. Used in MCP configuration and cannot be changed later. Auto-generated from the name." /></span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
              pattern="^[a-z0-9-]+$"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers, and hyphens only</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="inline-flex items-center gap-1">Plan<Tooltip text="The subscription tier for this tenant. Determines feature access and rate limits. Can be changed later from the tenant detail page." /></span>
            </label>
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
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => navigate('/tenants')}
              className="text-sm text-gray-600 hover:text-gray-800 py-2 px-4"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — ERP Credentials */}
      {step === 2 && (
        <div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1">Base URL<Tooltip text="The root URL of the POSibolt ERP server for this tenant." /></span>
              </label>
              <input type="url" value={erpFields_state.erpBaseUrl} onChange={(e) => handleErpFieldChange('erpBaseUrl', e.target.value)} placeholder="https://bigblue.posibolt.com" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1">Client ID<Tooltip text="The OAuth client identifier issued by POSibolt." /></span>
              </label>
              <input type="text" value={erpFields_state.erpClientId} onChange={(e) => handleErpFieldChange('erpClientId', e.target.value)} placeholder="OAuth client_id" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1">App Secret<Tooltip text="The OAuth client secret from POSibolt. Never share this value." /></span>
              </label>
              <input type="password" value={erpFields_state.erpAppSecret} onChange={(e) => handleErpFieldChange('erpAppSecret', e.target.value)} placeholder="OAuth app_secret" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1">Username<Tooltip text="The POSibolt user account for ERP operations." /></span>
              </label>
              <input type="text" value={erpFields_state.erpUsername} onChange={(e) => handleErpFieldChange('erpUsername', e.target.value)} placeholder="POSibolt username" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1">Password<Tooltip text="The password for the POSibolt user account." /></span>
              </label>
              <input type="password" value={erpFields_state.erpPassword} onChange={(e) => handleErpFieldChange('erpPassword', e.target.value)} placeholder="POSibolt password" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="inline-flex items-center gap-1">Terminal<Tooltip text="The POSibolt terminal identifier for transaction operations." /></span>
              </label>
              <input type="text" value={erpFields_state.erpTerminal} onChange={(e) => handleErpFieldChange('erpTerminal', e.target.value)} placeholder="Terminal 1" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!canTestConnect}
              className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {testResult && (
            <div
              className={`mt-3 p-3 rounded-lg text-sm ${
                testResult.connected
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {testResult.connected ? '✓ Connection verified!' : testResult.message}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!connectionTested}
              className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Create & API Key */}
      {step === 3 && (
        <div>
          {!result ? (
            <>
              {/* Summary before creation */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4 space-y-1 text-sm text-gray-700">
                <p><span className="font-medium">Name:</span> {name}</p>
                <p><span className="font-medium">Slug:</span> <code className="text-xs bg-gray-100 px-1 rounded">{slug}</code></p>
                <p><span className="font-medium">Plan:</span> {plan}</p>
                <p className="text-green-700"><span className="font-medium">ERP:</span> ✓ Connected</p>
              </div>

              {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={submitting}
                  className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* After creation — show API key */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-green-800 font-medium">Tenant created successfully!</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800 font-medium">Save this API key now — it will not be shown again.</p>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 bg-white border border-gray-300 rounded px-3 py-2 font-mono text-xs break-all select-all">
                  {result.apiKey}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 border border-gray-300 text-gray-700 text-sm font-medium py-2 px-3 rounded-md hover:bg-gray-50"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <p className="text-xs text-gray-500 mb-6">
                Tenant ID: <code className="bg-gray-100 px-1 rounded">{result.tenantId}</code>
              </p>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/tenants/${result.tenantId}`)}
                  className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700"
                >
                  View Tenant
                </button>
                <button
                  type="button"
                  onClick={handleCreateAnother}
                  className="border border-gray-300 text-gray-700 text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-50"
                >
                  Create Another
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
