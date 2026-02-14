import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

type SsoProvider = 'SAML' | 'OIDC';

interface SsoConnection {
  id: string;
  provider: SsoProvider;
  name: string;
  entityId: string | null;
  ssoUrl: string | null;
  certificate: string | null;
  clientId: string | null;
  clientSecret: string | null;
  issuer: string | null;
  discoveryUrl: string | null;
  enabled: boolean;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

export default function SsoSettings() {
  const { user } = useAuth();
  const [connection, setConnection] = useState<SsoConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState<SsoProvider>('SAML');
  const [planBlocked, setPlanBlocked] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<OidcDiscovery | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [ssoUrl, setSsoUrl] = useState('');
  const [certificate, setCertificate] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [issuer, setIssuer] = useState('');
  const [discoveryUrl, setDiscoveryUrl] = useState('');
  const [enabled, setEnabled] = useState(true);

  const apiUrl = import.meta.env.VITE_API_URL || window.location.origin;
  const orgSlug = user?.organizations?.[0]?.organization?.slug || '';
  const acsUrl = `${apiUrl}/api/v1/sso/saml/callback`;
  const spEntityId = `${apiUrl}/api/v1/sso/saml/metadata`;
  const oidcRedirectUri = `${apiUrl}/api/v1/sso/oidc/callback`;
  const samlLoginUrl = orgSlug ? `${apiUrl}/api/v1/sso/saml/login/${orgSlug}` : '';
  const oidcLoginUrl = orgSlug ? `${apiUrl}/api/v1/sso/oidc/login/${orgSlug}` : '';

  const loadConnection = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/sso/connections');
      if (data) {
        setConnection(data);
        setTab(data.provider);
        setName(data.name || '');
        setEntityId(data.entityId || '');
        setSsoUrl(data.ssoUrl || '');
        setCertificate(data.certificate === '[configured]' ? '' : (data.certificate || ''));
        setClientId(data.clientId || '');
        setClientSecret(data.clientSecret === '********' ? '' : (data.clientSecret || ''));
        setIssuer(data.issuer || '');
        setDiscoveryUrl(data.discoveryUrl || '');
        setEnabled(data.enabled);
      }
      setPlanBlocked(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: { error?: string } } };
      if (axiosErr.response?.status === 403) {
        setPlanBlocked(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const payload = {
        provider: tab,
        name: name || `${tab} SSO`,
        ...(tab === 'SAML' && {
          entityId,
          ssoUrl,
          ...(certificate && { certificate }),
        }),
        ...(tab === 'OIDC' && {
          clientId,
          ...(clientSecret && { clientSecret }),
          issuer,
          discoveryUrl: discoveryUrl || undefined,
        }),
      };

      if (connection) {
        await api.put('/sso/connections', payload);
        setSuccess('SSO connection updated successfully.');
      } else {
        await api.post('/sso/connections', payload);
        setSuccess('SSO connection created successfully.');
      }
      await loadConnection();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to save SSO configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    setError(null);
    try {
      await api.put('/sso/connections', { enabled: !enabled });
      setEnabled(!enabled);
      setSuccess(`SSO ${!enabled ? 'enabled' : 'disabled'} successfully.`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to toggle SSO.');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to disable SSO? Users will need to log in with email/password.')) return;
    setError(null);
    try {
      await api.delete('/sso/connections');
      setSuccess('SSO connection disabled.');
      setConnection(null);
      setName('');
      setEntityId('');
      setSsoUrl('');
      setCertificate('');
      setClientId('');
      setClientSecret('');
      setIssuer('');
      setDiscoveryUrl('');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to delete SSO connection.');
    }
  };

  const handleDiscover = async () => {
    if (!discoveryUrl) return;
    setDiscovering(true);
    setError(null);
    setDiscoveryResult(null);
    try {
      const { data } = await api.post('/sso/oidc/discover', { discoveryUrl });
      setDiscoveryResult(data);
      if (data.issuer) setIssuer(data.issuer);
      setSuccess('OIDC discovery successful. Endpoints detected.');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'OIDC discovery failed. Check the URL.');
    } finally {
      setDiscovering(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard.');
    setTimeout(() => setSuccess(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (planBlocked) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Single Sign-On (SSO)</h1>
        <p className="text-gray-600 mb-8">Enterprise SAML and OIDC authentication for your organization.</p>
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">SSO requires the Scale plan</h2>
          <p className="text-gray-600 mb-6">
            Upgrade to Scale ($299/mo) to enable SAML and OIDC single sign-on for your team.
          </p>
          <a
            href="/billing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Upgrade to Scale
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Single Sign-On (SSO)</h1>
        <p className="text-gray-600 mt-1">
          Configure SAML or OIDC authentication for your organization.
        </p>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* Provider tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('SAML')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'SAML'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          SAML 2.0
        </button>
        <button
          onClick={() => setTab('OIDC')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'OIDC'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          OpenID Connect
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
        {/* Connection name */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Okta, Azure AD, Google Workspace"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* SAML configuration */}
        {tab === 'SAML' && (
          <>
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Identity Provider Settings</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IdP Entity ID</label>
                <input
                  type="text"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder="https://idp.example.com/metadata"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IdP SSO URL</label>
                <input
                  type="url"
                  value={ssoUrl}
                  onChange={(e) => setSsoUrl(e.target.value)}
                  placeholder="https://idp.example.com/sso/saml"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  X.509 Certificate
                  {connection?.certificate && <span className="ml-2 text-green-600 font-normal">(configured)</span>}
                </label>
                <textarea
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value)}
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIICmTCCAYECBgF...&#10;-----END CERTIFICATE-----"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Paste the IdP's public X.509 certificate in PEM format.</p>
              </div>
            </div>

            <div className="p-6 space-y-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Service Provider Details</h3>
              <p className="text-sm text-gray-600">Provide these values to your identity provider.</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SP Entity ID (Audience URI)</label>
                <CopyField value={spEntityId} onCopy={copyToClipboard} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ACS URL (Reply URL)</label>
                <CopyField value={acsUrl} onCopy={copyToClipboard} />
              </div>

              {samlLoginUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSO Login URL (share with team)</label>
                  <CopyField value={samlLoginUrl} onCopy={copyToClipboard} />
                </div>
              )}
            </div>
          </>
        )}

        {/* OIDC configuration */}
        {tab === 'OIDC' && (
          <>
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">OpenID Connect Settings</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discovery URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={discoveryUrl}
                    onChange={(e) => setDiscoveryUrl(e.target.value)}
                    placeholder="https://accounts.google.com/.well-known/openid-configuration"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    onClick={handleDiscover}
                    disabled={discovering || !discoveryUrl}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {discovering ? 'Discovering...' : 'Auto-discover'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Endpoints will be auto-discovered from the .well-known URL.
                </p>
              </div>

              {discoveryResult && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm space-y-1">
                  <p className="font-medium text-green-800">Discovered endpoints:</p>
                  <p className="text-green-700 text-xs font-mono truncate">Auth: {discoveryResult.authorization_endpoint}</p>
                  <p className="text-green-700 text-xs font-mono truncate">Token: {discoveryResult.token_endpoint}</p>
                  <p className="text-green-700 text-xs font-mono truncate">UserInfo: {discoveryResult.userinfo_endpoint}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="your-client-id"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                  {connection?.clientSecret === '********' && <span className="ml-2 text-green-600 font-normal">(configured)</span>}
                </label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Enter new client secret or leave blank to keep existing"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issuer</label>
                <input
                  type="text"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="https://accounts.google.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">Auto-populated from discovery URL if available.</p>
              </div>
            </div>

            <div className="p-6 space-y-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Application Details</h3>
              <p className="text-sm text-gray-600">Configure these in your identity provider.</p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URI (Callback URL)</label>
                <CopyField value={oidcRedirectUri} onCopy={copyToClipboard} />
              </div>

              {oidcLoginUrl && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSO Login URL (share with team)</label>
                  <CopyField value={oidcLoginUrl} onCopy={copyToClipboard} />
                </div>
              )}
            </div>
          </>
        )}

        {/* Enable/Disable toggle + actions */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {connection && (
              <>
                <button
                  onClick={handleToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    enabled ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">{enabled ? 'SSO Enabled' : 'SSO Disabled'}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {connection && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                Remove
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : connection ? 'Update Connection' : 'Create Connection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Copy field component
// ---------------------------------------------------------------------------

function CopyField({ value, onCopy }: { value: string; onCopy: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        readOnly
        value={value}
        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 font-mono"
      />
      <button
        onClick={() => onCopy(value)}
        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        title="Copy to clipboard"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      </button>
    </div>
  );
}
