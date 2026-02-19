import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import type { IntegrationMeta, SignalSource, SyncHistoryEntry, IntegrationCategory } from '../types';

// Integrations that have dedicated setup flows in Settings (source type → Settings tab id)
const SETTINGS_TAB_MAP: Record<string, string> = {
  HUBSPOT: 'hubspot',
  SALESFORCE: 'salesforce',
  SLACK: 'slack',
  DISCORD: 'discord',
  STACKOVERFLOW: 'stackoverflow',
  TWITTER: 'twitter',
  REDDIT: 'reddit',
  LINKEDIN: 'linkedin',
  POSTHOG: 'posthog',
  CLEARBIT: 'clearbit',
  INTERCOM: 'intercom',
  ZENDESK: 'zendesk',
};

const CATEGORY_COLORS: Record<IntegrationCategory, { bg: string; text: string }> = {
  'Developer Activity': { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  'Package Registry': { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  'Analytics': { bg: 'bg-purple-50', text: 'text-purple-700' },
  'CRM': { bg: 'bg-blue-50', text: 'text-blue-700' },
  'Communication': { bg: 'bg-amber-50', text: 'text-amber-700' },
  'Community': { bg: 'bg-rose-50', text: 'text-rose-700' },
  'Custom': { bg: 'bg-gray-50', text: 'text-gray-600' },
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ACTIVE: { color: 'text-green-700', bg: 'bg-green-50', label: 'Active' },
  PAUSED: { color: 'text-yellow-700', bg: 'bg-yellow-50', label: 'Paused' },
  ERROR: { color: 'text-red-700', bg: 'bg-red-50', label: 'Error' },
};

const SYNC_STATUS_CONFIG: Record<string, { color: string; icon: string; dotColor: string }> = {
  COMPLETED: { color: 'text-green-600', icon: 'check', dotColor: 'bg-green-500' },
  PARTIAL: { color: 'text-yellow-600', icon: 'warning', dotColor: 'bg-yellow-500' },
  FAILED: { color: 'text-red-600', icon: 'x', dotColor: 'bg-red-500' },
  RUNNING: { color: 'text-blue-600', icon: 'running', dotColor: 'bg-blue-500' },
};

const SETUP_INSTRUCTIONS: Record<string, { title: string; steps: string[] }> = {
  webhook: {
    title: 'Webhook Setup',
    steps: [
      'Copy the webhook URL provided below',
      'Go to your service settings and add a new webhook',
      'Paste the webhook URL and select the events to listen for',
      'Save and send a test event to verify the connection',
    ],
  },
  api_key: {
    title: 'API Key Setup',
    steps: [
      'Generate an API key in your service dashboard',
      'Enter the API key in the configuration form below',
      'Click "Connect" to establish the integration',
      'Verify the connection by running a test sync',
    ],
  },
  oauth: {
    title: 'OAuth Setup',
    steps: [
      'Click the "Connect" button below to start the OAuth flow',
      'You will be redirected to authorize DevSignal',
      'Grant the requested permissions',
      'You will be redirected back once connected',
    ],
  },
  manual: {
    title: 'Manual Setup',
    steps: [
      'Follow the integration guide in our documentation',
      'Configure the required fields below',
      'Submit the configuration to activate the integration',
      'Verify by checking the sync history for incoming data',
    ],
  },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  return `${seconds}s`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString();
}

export default function IntegrationDetail() {
  const { type } = useParams<{ type: string }>();
  const sourceType = type?.toUpperCase() || '';
  const toast = useToast();

  const [meta, setMeta] = useState<IntegrationMeta | null>(null);
  const [source, setSource] = useState<SignalSource | null>(null);
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    document.title = meta ? `${meta.name} Integration | DevSignal` : 'Integration | DevSignal';
  }, [meta]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catalogRes, sourcesRes] = await Promise.all([
        api.get<{ integrations: IntegrationMeta[] }>('/sources/catalog'),
        api.get<{ sources: SignalSource[] }>('/sources'),
      ]);

      const integration = catalogRes.data.integrations.find(
        (i) => i.type === sourceType
      );
      setMeta(integration || null);

      const connected = sourcesRes.data.sources.find(
        (s) => s.type === sourceType
      );
      setSource(connected || null);

      if (connected) {
        try {
          const historyRes = await api.get<{ history: SyncHistoryEntry[] }>(
            `/sources/${connected.id}/history`
          );
          setHistory(historyRes.data.history);
        } catch {
          // History endpoint may not exist yet
        }
      }
    } catch {
      // Handle gracefully
    } finally {
      setLoading(false);
    }
  }, [sourceType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTestConnection = async () => {
    if (!source) return;
    setTesting(true);
    try {
      await api.post(`/sources/${source.id}/test`);
      toast.success('Connection test passed');
    } catch {
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    if (!source) return;
    try {
      await api.post(`/sources/${source.id}/sync`);
      toast.success('Sync triggered');
      // Reload after a brief delay to capture the new sync entry
      setTimeout(loadData, 1500);
    } catch {
      toast.error('Failed to trigger sync');
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-gray-200 rounded w-24" />
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="h-4 bg-gray-200 rounded w-96" />
          <div className="h-48 bg-gray-200 rounded-xl" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <Link
          to="/integrations"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Integrations
        </Link>
        <div className="text-center py-16">
          <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-gray-500">Integration not found</p>
          <Link
            to="/integrations"
            className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            View all integrations
          </Link>
        </div>
      </div>
    );
  }

  const catColors = CATEGORY_COLORS[meta.category];
  const statusConfig = source ? STATUS_CONFIG[source.status] : null;
  const setupInfo = SETUP_INSTRUCTIONS[meta.setupType] || SETUP_INSTRUCTIONS.manual;

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        to="/integrations"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        Back to Integrations
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className={`w-14 h-14 rounded-xl ${catColors.bg} flex items-center justify-center flex-shrink-0`}>
          <span className={`text-2xl font-bold ${catColors.text}`}>{meta.name[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{meta.name}</h1>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${catColors.bg} ${catColors.text}`}>
              {meta.category}
            </span>
            {statusConfig && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${source?.status === 'ACTIVE' ? 'bg-green-500' : source?.status === 'PAUSED' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                {statusConfig.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
          <p className="mt-1 text-xs text-gray-400">
            Setup type: <span className="capitalize">{meta.setupType.replace('_', ' ')}</span>
          </p>
        </div>
      </div>

      {/* Connected: Status card */}
      {source ? (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Connection Status</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-1">Total Signals</p>
                <p className="text-xl font-semibold text-gray-900">{formatNumber(source._count.signals)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Recent (7 days)</p>
                <p className="text-xl font-semibold text-gray-900">{formatNumber(source.recentSignals)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Last Synced</p>
                <p className="text-xl font-semibold text-gray-900">
                  {source.lastSyncAt ? formatRelativeTime(source.lastSyncAt) : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Connected Since</p>
                <p className="text-xl font-semibold text-gray-900">
                  {new Date(source.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Error message */}
            {source.errorMessage && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-700 font-medium">Error</p>
                <p className="text-sm text-red-600 mt-0.5">{source.errorMessage}</p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {testing ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                Test Connection
              </button>
              <button
                onClick={handleSyncNow}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                Sync Now
              </button>
            </div>
          </div>

          {/* Sync History */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Sync History</h2>
            {history.length === 0 ? (
              <div className="text-center py-8">
                <svg className="mx-auto w-10 h-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-gray-500">No sync history yet</p>
              </div>
            ) : (
              <div className="space-y-0">
                {history.map((entry, index) => {
                  const syncConfig = SYNC_STATUS_CONFIG[entry.status] || SYNC_STATUS_CONFIG.COMPLETED;
                  const isLast = index === history.length - 1;
                  return (
                    <div key={entry.id} className="flex gap-4">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${syncConfig.dotColor} flex-shrink-0 ${entry.status === 'RUNNING' ? 'animate-pulse' : ''}`} />
                        {!isLast && <div className="w-px flex-1 bg-gray-200 my-1" />}
                      </div>

                      {/* Content */}
                      <div className={`flex-1 pb-5 ${isLast ? '' : ''}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold ${syncConfig.color}`}>
                            {entry.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatRelativeTime(entry.startedAt)}
                          </span>
                          {entry.durationMs !== null && (
                            <span className="text-xs text-gray-400">
                              ({formatDuration(entry.durationMs)})
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                          {entry.signalsCreated > 0 && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                              {entry.signalsCreated} created
                            </span>
                          )}
                          {entry.signalsUpdated > 0 && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                              </svg>
                              {entry.signalsUpdated} updated
                            </span>
                          )}
                          {entry.errors > 0 && (
                            <span className="flex items-center gap-1 text-red-500">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                              </svg>
                              {entry.errors} errors
                            </span>
                          )}
                          {entry.signalsCreated === 0 && entry.signalsUpdated === 0 && entry.errors === 0 && (
                            <span className="text-gray-400">No changes</span>
                          )}
                        </div>
                        {entry.errorDetails && (
                          <p className="mt-1 text-xs text-red-500 bg-red-50 rounded px-2 py-1">
                            {entry.errorDetails}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Not connected: Setup instructions */
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">{setupInfo.title}</h2>
          <p className="text-xs text-gray-500 mb-6">
            Follow these steps to connect {meta.name} with DevSignal
          </p>

          <div className="space-y-4">
            {setupInfo.steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-600">{i + 1}</span>
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm text-gray-700">{step}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Configuration CTA — link to Settings for integrations with setup flows */}
          {SETTINGS_TAB_MAP[sourceType] ? (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-900 mb-2">Ready to connect?</h3>
              <p className="text-sm text-gray-500 mb-4">
                {meta.name} has a dedicated setup flow. Configure your credentials and connection settings from the Settings page.
              </p>
              <Link
                to={`/settings?tab=${SETTINGS_TAB_MAP[sourceType]}`}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configure {meta.name} in Settings
              </Link>
            </div>
          ) : meta.configFields.length > 0 ? (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-900 mb-3">Required Configuration</h3>
              <div className="space-y-3">
                {meta.configFields.map((field) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                      {field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                    </label>
                    <input
                      type="text"
                      disabled
                      placeholder={`Enter ${field}`}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 placeholder:text-gray-300"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-gray-400">
                Configuration support coming soon. Use the DevSignal API to set up this integration in the meantime.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
