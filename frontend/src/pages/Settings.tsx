import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  active: boolean;
  createdAt: string;
}

interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface SignalSource {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'error';
  lastSyncAt: string | null;
}

interface SlackSettings {
  configured: boolean;
  webhookUrl: string | null;
  richAlerts: boolean;
  alertTypes: string[];
  slackUserMap: Record<string, string>;
  slackTeamId: string | null;
}

interface SegmentSource {
  id: string;
  name: string;
  type: string;
  status: string;
  webhookUrl: string;
  sharedSecret: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

interface HubSpotSyncStatus {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncResult: {
    contacts: { created: number; updated: number; failed: number };
    companies: { created: number; updated: number; failed: number };
    deals: { created: number; updated: number; failed: number };
    signals: { synced: number; failed: number };
    errors: string[];
  } | null;
  syncInProgress: boolean;
  portalId: string | null;
  totalContactsSynced: number;
  totalCompaniesSynced: number;
  totalDealsSynced: number;
}

interface DiscordStatus {
  connected: boolean;
  guildName: string | null;
  guildIcon: string | null;
  guildId: string | null;
  memberCount: number;
  monitoredChannels: number;
  lastSyncAt: string | null;
  lastSyncResult: {
    messagesProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  isSupportChannel: boolean;
  isShowcaseChannel: boolean;
  isBotChannel: boolean;
}

type TabId = 'api-keys' | 'webhooks' | 'sources' | 'slack' | 'segment' | 'hubspot' | 'discord';

const TABS: { id: TabId; label: string }[] = [
  { id: 'api-keys', label: 'API Keys' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'sources', label: 'Signal Sources' },
  { id: 'slack', label: 'Slack' },
  { id: 'segment', label: 'Segment' },
  { id: 'hubspot', label: 'HubSpot' },
  { id: 'discord', label: 'Discord' },
];

const ALL_SCOPES = [
  'signals:read',
  'signals:write',
  'accounts:read',
  'accounts:write',
  'contacts:read',
  'contacts:write',
  'deals:read',
  'deals:write',
] as const;

const ALL_EVENTS = [
  'signal.received',
  'contact.created',
  'contact.updated',
  'deal.created',
  'deal.updated',
  'score.changed',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function extractApiError(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data
      ?.error || 'An unexpected error occurred.'
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge component
// ---------------------------------------------------------------------------

function Badge({
  children,
  color = 'gray',
}: {
  children: React.ReactNode;
  color?: 'gray' | 'indigo' | 'green' | 'red' | 'yellow' | 'blue';
}) {
  const colors: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${colors[color]}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-300'}`}
      />
      <span
        className={`text-xs font-medium ${active ? 'text-green-700' : 'text-gray-500'}`}
      >
        {active ? 'Active' : 'Inactive'}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: API Keys
// ---------------------------------------------------------------------------

function ApiKeysTab() {
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchApiKeys = useCallback(async () => {
    try {
      const { data } = await api.get('/api-keys');
      setApiKeys(data.apiKeys);
    } catch {
      toast.error('Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for the API key.');
      return;
    }
    if (newKeyScopes.size === 0) {
      toast.error('Please select at least one scope.');
      return;
    }

    setCreating(true);
    try {
      const { data } = await api.post('/api-keys', {
        name: newKeyName.trim(),
        scopes: Array.from(newKeyScopes),
      });
      setRevealedKey(data.key);
      setCopied(false);
      setShowCreateModal(false);
      setNewKeyName('');
      setNewKeyScopes(new Set());
      await fetchApiKeys();
      toast.success('API key created successfully.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try {
      await api.put(`/api-keys/${id}/revoke`);
      await fetchApiKeys();
      toast.success('API key revoked.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setRevokingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to permanently delete this API key? This cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    try {
      await api.delete(`/api-keys/${id}`);
      await fetchApiKeys();
      toast.success('API key deleted.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDeletingId(null);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('API key copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Revealed key banner */}
      {revealedKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                Save this key now -- it will only be shown once
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white border border-amber-200 rounded-lg text-sm font-mono text-gray-900 truncate">
                  {revealedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(revealedKey)}
                  className="flex-shrink-0 px-3 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setRevealedKey(null)}
              className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Your API Keys</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage keys for programmatic access to the DevSignal API.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Create API Key
        </button>
      </div>

      {/* Keys list */}
      {apiKeys.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
              />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            No API keys yet
          </h4>
          <p className="text-sm text-gray-500 mb-4">
            Create an API key to start integrating with the DevSignal API.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create your first key
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {apiKeys.map((key) => (
            <div
              key={key.id}
              className="px-5 py-4 flex items-start gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {key.name}
                  </span>
                  <StatusDot active={key.active} />
                </div>
                <code className="text-xs font-mono text-gray-500">
                  {key.keyPrefix}...
                </code>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {key.scopes.map((scope) => (
                    <Badge key={scope} color="indigo">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>Created {formatDate(key.createdAt)}</span>
                  <span>Last used {formatDateTime(key.lastUsedAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {key.active && (
                  <button
                    onClick={() => handleRevoke(key.id)}
                    disabled={revokingId === key.id}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                    {revokingId === key.id ? 'Revoking...' : 'Revoke'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(key.id)}
                  disabled={deletingId === key.id}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {deletingId === key.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create API Key"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Key Name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production Backend"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scopes
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={newKeyScopes.has(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim() || newKeyScopes.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Webhooks
// ---------------------------------------------------------------------------

function WebhooksTab() {
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newEvents, setNewEvents] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const { data } = await api.get('/webhooks');
      setWebhooks(data.webhookEndpoints);
    } catch {
      toast.error('Failed to load webhook endpoints.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  function toggleEvent(event: string) {
    setNewEvents((prev) => {
      const next = new Set(prev);
      if (next.has(event)) {
        next.delete(event);
      } else {
        next.add(event);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!newUrl.trim()) {
      toast.error('Please enter a webhook URL.');
      return;
    }
    try {
      new URL(newUrl);
    } catch {
      toast.error('Please enter a valid URL.');
      return;
    }
    if (newEvents.size === 0) {
      toast.error('Please select at least one event.');
      return;
    }

    setCreating(true);
    try {
      await api.post('/webhooks', {
        url: newUrl.trim(),
        events: Array.from(newEvents),
      });
      setShowCreateModal(false);
      setNewUrl('');
      setNewEvents(new Set());
      await fetchWebhooks();
      toast.success('Webhook endpoint created.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(webhook: WebhookEndpoint) {
    setTogglingId(webhook.id);
    try {
      await api.put(`/webhooks/${webhook.id}`, {
        active: !webhook.active,
      });
      await fetchWebhooks();
      toast.success(
        `Webhook ${webhook.active ? 'deactivated' : 'activated'}.`
      );
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this webhook endpoint? This cannot be undone.')) {
      return;
    }
    setDeletingId(id);
    try {
      await api.delete(`/webhooks/${id}`);
      await fetchWebhooks();
      toast.success('Webhook endpoint deleted.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">
            Webhook Endpoints
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Receive real-time event notifications via HTTP POST.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Endpoint
        </button>
      </div>

      {/* Webhooks list */}
      {webhooks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
              />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            No webhook endpoints
          </h4>
          <p className="text-sm text-gray-500 mb-4">
            Add an endpoint to receive real-time notifications when events occur
            in your CRM.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add your first endpoint
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {webhooks.map((wh) => (
            <div key={wh.id} className="px-5 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono text-gray-900 truncate">
                    {wh.url}
                  </code>
                  <StatusDot active={wh.active} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {wh.events.map((event) => (
                    <Badge key={event} color="blue">
                      {event}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Created {formatDate(wh.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleToggle(wh)}
                  disabled={togglingId === wh.id}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {togglingId === wh.id
                    ? '...'
                    : wh.active
                      ? 'Deactivate'
                      : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(wh.id)}
                  disabled={deletingId === wh.id}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {deletingId === wh.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Webhook Endpoint"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Endpoint URL
            </label>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/webhooks/devsignal"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Events
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={newEvents.has(event)}
                    onChange={() => toggleEvent(event)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{event}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newUrl.trim() || newEvents.size === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Add Endpoint'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Signal Sources
// ---------------------------------------------------------------------------

function SignalSourcesTab() {
  const toast = useToast();
  const [sources, setSources] = useState<SignalSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSources() {
      try {
        const { data } = await api.get('/sources');
        setSources(data.sources);
      } catch {
        toast.error('Failed to load signal sources.');
      } finally {
        setLoading(false);
      }
    }
    fetchSources();
  }, [toast]);

  function sourceStatusColor(status: SignalSource['status']): 'green' | 'yellow' | 'red' {
    if (status === 'active') return 'green';
    if (status === 'paused') return 'yellow';
    return 'red';
  }

  function sourceStatusDotColor(status: SignalSource['status']): string {
    if (status === 'active') return 'bg-green-500';
    if (status === 'paused') return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function sourceStatusLabel(status: SignalSource['status']): string {
    if (status === 'active') return 'Active';
    if (status === 'paused') return 'Paused';
    return 'Error';
  }

  function sourceStatusTextColor(status: SignalSource['status']): string {
    if (status === 'active') return 'text-green-700';
    if (status === 'paused') return 'text-yellow-700';
    return 'text-red-700';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-gray-900">Signal Sources</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          View configured signal sources and their sync status.
        </p>
      </div>

      {sources.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
              />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            No signal sources configured
          </h4>
          <p className="text-sm text-gray-500 mb-4 max-w-sm mx-auto">
            Signal sources are configured through the API or SDK. Use the
            DevSignal SDK to start sending signals from your application.
          </p>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-left max-w-sm mx-auto">
            <p className="text-xs font-medium text-gray-700 mb-2">
              Quick start with the SDK:
            </p>
            <pre className="text-xs text-gray-600 font-mono whitespace-pre overflow-x-auto">
{`npm install @devsignal/node

import { DevSignal } from '@devsignal/node';
const ds = new DevSignal({ apiKey: '...' });

await ds.signal({
  type: 'app.signup',
  accountId: 'acct_123',
  properties: { plan: 'pro' }
});`}
            </pre>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {sources.map((source) => (
            <div
              key={source.id}
              className="px-5 py-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900">
                    {source.name}
                  </span>
                  <Badge color={sourceStatusColor(source.status)}>
                    {source.type}
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">
                  Last synced {formatDateTime(source.lastSyncAt)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 flex-shrink-0">
                <span
                  className={`w-2 h-2 rounded-full ${sourceStatusDotColor(source.status)}`}
                />
                <span
                  className={`text-xs font-medium ${sourceStatusTextColor(source.status)}`}
                >
                  {sourceStatusLabel(source.status)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Slack
// ---------------------------------------------------------------------------

function SlackTab() {
  const toast = useToast();
  const [slackSettings, setSlackSettings] = useState<SlackSettings | null>(
    null
  );
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [richAlerts, setRichAlerts] = useState(false);
  const [alertTypes, setAlertTypes] = useState<Set<string>>(new Set());

  const ALL_ALERT_TYPES = [
    { id: 'hot_accounts', label: 'Hot Accounts', desc: 'When a company reaches HOT tier' },
    { id: 'new_signups', label: 'New Signups', desc: 'When a new contact is created' },
    { id: 'deal_changes', label: 'Deal Changes', desc: 'When a deal moves stages' },
    { id: 'workflow_failures', label: 'Workflow Failures', desc: 'When a workflow action fails' },
  ];

  useEffect(() => {
    async function fetchSlackSettings() {
      try {
        const { data } = await api.get('/settings/slack');
        setSlackSettings(data);
        setRichAlerts(data.richAlerts || false);
        setAlertTypes(new Set(data.alertTypes || ALL_ALERT_TYPES.map((t) => t.id)));
      } catch {
        setSlackSettings({
          configured: false,
          webhookUrl: null,
          richAlerts: false,
          alertTypes: [],
          slackUserMap: {},
          slackTeamId: null,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchSlackSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!webhookUrl.trim()) {
      toast.error('Please enter a Slack webhook URL.');
      return;
    }
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      toast.error('URL must start with https://hooks.slack.com/');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.put('/settings/slack', { webhookUrl });
      setSlackSettings((prev) => prev ? { ...prev, ...data } : data);
      setWebhookUrl('');
      toast.success('Slack webhook URL saved successfully.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await api.post('/settings/slack/test');
      toast.success('Test message sent! Check your Slack channel.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const { data } = await api.delete('/settings/slack');
      setSlackSettings({ ...data, richAlerts: false, alertTypes: [], slackUserMap: {}, slackTeamId: null });
      setRichAlerts(false);
      setAlertTypes(new Set(ALL_ALERT_TYPES.map((t) => t.id)));
      toast.success('Slack integration removed.');
    } catch {
      toast.error('Failed to remove Slack integration.');
    } finally {
      setRemoving(false);
    }
  }

  async function handleSaveAlerts() {
    setSavingAlerts(true);
    try {
      await api.put('/settings/slack/alerts', {
        richAlerts,
        alertTypes: Array.from(alertTypes),
      });
      setSlackSettings((prev) =>
        prev ? { ...prev, richAlerts, alertTypes: Array.from(alertTypes) } : prev
      );
      toast.success('Alert preferences saved.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSavingAlerts(false);
    }
  }

  function toggleAlertType(typeId: string) {
    setAlertTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) {
        next.delete(typeId);
      } else {
        next.add(typeId);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Slack card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <SlackIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Slack Notifications
              </h2>
              <p className="text-sm text-gray-500">
                Receive alerts when accounts change PQA tier or high-value
                signals arrive.
              </p>
            </div>
            {slackSettings?.configured && (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {slackSettings?.configured ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Webhook
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono">
                    {slackSettings.webhookUrl}
                  </code>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Webhook URL is masked for security. Enter a new URL below to
                  update it.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Update Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || !webhookUrl.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Update'}
                </button>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testing ? 'Sending...' : 'Send Test Message'}
                </button>
                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="px-4 py-2 text-red-600 text-sm font-medium hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
                >
                  {removing ? 'Removing...' : 'Disconnect'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T.../B.../..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <button
                onClick={handleSave}
                disabled={saving || !webhookUrl.trim()}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Connect Slack'}
              </button>
            </>
          )}

          {/* Help text */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
            <h3 className="text-sm font-medium text-gray-800 mb-2">
              How to set up a Slack Incoming Webhook
            </h3>
            <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
              <li>
                Go to{' '}
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-700 underline"
                >
                  api.slack.com/apps
                </a>{' '}
                and create a new app (or select an existing one).
              </li>
              <li>
                Under <strong>Incoming Webhooks</strong>, toggle it on.
              </li>
              <li>
                Click <strong>Add New Webhook to Workspace</strong> and choose a
                channel.
              </li>
              <li>Copy the webhook URL and paste it above.</li>
            </ol>
            <p className="text-xs text-gray-400 mt-3">
              For interactive buttons (Claim, Snooze), also enable{' '}
              <strong>Interactivity</strong> in your Slack app and set the Request
              URL to your DevSignal backend:{' '}
              <code className="text-xs">
                https://your-domain.com/api/v1/webhooks/slack/interactions
              </code>
            </p>
          </div>
        </div>
      </div>

      {/* Rich Alerts configuration -- only show when connected */}
      {slackSettings?.configured && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">
              Rich Alerts
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Send interactive Slack messages with action buttons (Claim Account,
              Snooze, View).
            </p>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Enable Rich Alerts
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  When enabled, alerts include Block Kit formatting and
                  interactive buttons.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={richAlerts}
                onClick={() => setRichAlerts(!richAlerts)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  richAlerts ? 'bg-indigo-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    richAlerts ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Alert type checkboxes */}
            {richAlerts && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alert Types
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ALERT_TYPES.map((type) => (
                    <label
                      key={type.id}
                      className="flex items-start gap-2 px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={alertTypes.has(type.id)}
                        onChange={() => toggleAlertType(type.id)}
                        className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700 block">
                          {type.label}
                        </span>
                        <span className="text-xs text-gray-400">{type.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleSaveAlerts}
              disabled={savingAlerts}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {savingAlerts ? 'Saving...' : 'Save Alert Preferences'}
            </button>

            {/* Message preview */}
            {richAlerts && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Message Preview
                  </p>
                </div>
                <div className="bg-white p-4 space-y-3">
                  {/* Faux Slack message */}
                  <div className="border-l-4 border-indigo-500 pl-3">
                    <p className="text-sm font-bold text-gray-900">
                      Account Alert: Acme Corp
                    </p>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-gray-600">
                      <div>
                        <span className="font-medium text-gray-500">Tier</span>
                        <br />
                        HOT
                      </div>
                      <div>
                        <span className="font-medium text-gray-500">PQA Score</span>
                        <br />
                        87/100
                      </div>
                      <div>
                        <span className="font-medium text-gray-500">Trend</span>
                        <br />
                        Rising
                      </div>
                      <div>
                        <span className="font-medium text-gray-500">Signals</span>
                        <br />
                        24
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Top signal: app.signup
                    </p>
                    <div className="flex gap-2 mt-3">
                      <span className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        View Account
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-indigo-600 text-white">
                        Claim Account
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        Snooze 7d
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400">
                    DevSignal &bull; 2024-01-15
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 5: Segment
// ---------------------------------------------------------------------------

function SegmentTab() {
  const toast = useToast();
  const [segmentSource, setSegmentSource] = useState<SegmentSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sourceName, setSourceName] = useState('Segment');
  const [showSecret, setShowSecret] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchSegmentSource = useCallback(async () => {
    try {
      const { data } = await api.get('/sources');
      const sources = data.sources as SignalSource[];
      const seg = sources.find((s) => s.type === 'SEGMENT');
      if (seg) {
        // Fetch full config with secret
        const { data: detail } = await api.get(`/connectors/segment/${seg.id}`);
        setSegmentSource(detail.source);
      } else {
        setSegmentSource(null);
      }
    } catch {
      // If 403 or sources not found, no segment source
      setSegmentSource(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSegmentSource();
  }, [fetchSegmentSource]);

  async function handleConnect() {
    if (!sourceName.trim()) {
      toast.error('Please enter a source name.');
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/connectors/segment', {
        name: sourceName.trim(),
      });
      setSegmentSource(data.source);
      toast.success('Segment connector created.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRotateSecret() {
    if (
      !window.confirm(
        'Rotate the shared secret? The old secret will immediately stop working. You will need to update it in your Segment workspace.'
      )
    ) {
      return;
    }
    setRotating(true);
    try {
      const { data } = await api.post(
        `/connectors/segment/${segmentSource!.id}/rotate-secret`
      );
      setSegmentSource((prev) =>
        prev ? { ...prev, sharedSecret: data.sharedSecret } : null
      );
      toast.success('Shared secret rotated.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setRotating(false);
    }
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        'Disconnect Segment? This will delete the source and all incoming data will stop. Existing signals are preserved.'
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.delete(`/connectors/segment/${segmentSource!.id}`);
      setSegmentSource(null);
      toast.success('Segment connector disconnected.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      toast.success(`${label} copied to clipboard.`);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Failed to copy to clipboard.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  // No source configured -- show setup card
  if (!segmentSource) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <SegmentIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Connect Segment
                </h2>
                <p className="text-sm text-gray-500">
                  Stream identify, track, group, and page events from Segment
                  into DevSignal.
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Name
              </label>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. Production Segment"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <button
              onClick={handleConnect}
              disabled={creating || !sourceName.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating...' : 'Connect Segment'}
            </button>

            {/* How it works */}
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">
                How it works
              </h3>
              <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                <li>Click "Connect Segment" to generate a webhook URL and shared secret.</li>
                <li>In your Segment workspace, add a new Webhook destination.</li>
                <li>Paste the webhook URL and shared secret from DevSignal.</li>
                <li>
                  Segment will start streaming events -- identify calls create
                  contacts, track calls create signals, group calls create
                  companies.
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Source exists -- show configuration
  const baseUrl = window.location.origin;
  const fullWebhookUrl = `${baseUrl}${segmentSource.webhookUrl}`;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <SegmentIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {segmentSource.name}
              </h2>
              <p className="text-sm text-gray-500">
                Segment inbound connector
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  segmentSource.status === 'ACTIVE'
                    ? 'bg-green-500'
                    : segmentSource.status === 'PAUSED'
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
              />
              <span
                className={`text-xs font-medium ${
                  segmentSource.status === 'ACTIVE'
                    ? 'text-green-700'
                    : segmentSource.status === 'PAUSED'
                      ? 'text-yellow-700'
                      : 'text-red-700'
                }`}
              >
                {segmentSource.status === 'ACTIVE'
                  ? 'Active'
                  : segmentSource.status === 'PAUSED'
                    ? 'Paused'
                    : 'Error'}
              </span>
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Webhook URL
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 font-mono truncate">
                {fullWebhookUrl}
              </code>
              <button
                onClick={() => copyToClipboard(fullWebhookUrl, 'Webhook URL')}
                className="flex-shrink-0 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copied === 'Webhook URL' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Shared Secret */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shared Secret
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 font-mono truncate">
                {showSecret
                  ? segmentSource.sharedSecret || '(not available)'
                  : '••••••••••••••••••••••••••••••••'}
              </code>
              <button
                onClick={() => setShowSecret(!showSecret)}
                className="flex-shrink-0 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
              {segmentSource.sharedSecret && (
                <button
                  onClick={() =>
                    copyToClipboard(segmentSource.sharedSecret!, 'Secret')
                  }
                  className="flex-shrink-0 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {copied === 'Secret' ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>

          {/* Last sync */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>Last event received: {formatDateTime(segmentSource.lastSyncAt)}</span>
            <span>Created: {formatDate(segmentSource.createdAt)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleRotateSecret}
              disabled={rotating}
              className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {rotating ? 'Rotating...' : 'Rotate Secret'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors ml-auto"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>

          {/* Setup instructions */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
            <h3 className="text-sm font-medium text-gray-800 mb-2">
              Quick setup in Segment
            </h3>
            <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
              <li>
                In your{' '}
                <a
                  href="https://app.segment.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-700 underline"
                >
                  Segment workspace
                </a>
                , go to Connections and add a new Destination.
              </li>
              <li>
                Search for <strong>Webhooks (Actions)</strong> and select it.
              </li>
              <li>Paste the Webhook URL above as the endpoint.</li>
              <li>Set the Shared Secret for HMAC signature verification.</li>
              <li>Enable the destination and choose which sources to connect.</li>
              <li>
                DevSignal will automatically create contacts from identify calls,
                signals from track calls, and companies from group calls.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 6: HubSpot
// ---------------------------------------------------------------------------

function HubSpotTab() {
  const toast = useToast();
  const [status, setStatus] = useState<HubSpotSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [portalId, setPortalId] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/integrations/hubspot/status');
      setStatus(data);
      // Stop polling if sync is no longer in progress
      if (!data.syncInProgress && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      setStatus({
        connected: false,
        lastSyncAt: null,
        lastSyncResult: null,
        syncInProgress: false,
        portalId: null,
        totalContactsSynced: 0,
        totalCompaniesSynced: 0,
        totalDealsSynced: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchStatus]);

  async function handleConnect() {
    if (!accessToken.trim() || !refreshToken.trim()) {
      toast.error('Please enter both access token and refresh token.');
      return;
    }

    setConnecting(true);
    try {
      await api.post('/integrations/hubspot/connect', {
        accessToken: accessToken.trim(),
        refreshToken: refreshToken.trim(),
        portalId: portalId.trim() || undefined,
      });
      setAccessToken('');
      setRefreshToken('');
      setPortalId('');
      await fetchStatus();
      toast.success('HubSpot connected successfully. Custom properties registered.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync(fullSync = false) {
    setSyncing(true);
    try {
      await api.post('/integrations/hubspot/sync', { fullSync });
      toast.success(
        fullSync
          ? 'Full sync queued. This may take a few minutes.'
          : 'Incremental sync queued.',
      );
      // Start polling for status updates
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchStatus, 5000);
      }
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        'Disconnect HubSpot? Synced data in HubSpot will remain, but automatic syncing will stop.',
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.delete('/integrations/hubspot/disconnect');
      await fetchStatus();
      toast.success('HubSpot disconnected.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not connected -- show setup
  if (!status?.connected) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
                <HubSpotIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Connect HubSpot
                </h2>
                <p className="text-sm text-gray-500">
                  Push enriched developer signals, PQA scores, and deal data into
                  HubSpot so sales reps see them where they already work.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HubSpot Access Token
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="pat-na1-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                HubSpot Refresh Token
              </label>
              <input
                type="password"
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="Refresh token from OAuth flow"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Portal ID
                <span className="text-gray-400 font-normal ml-1">(optional)</span>
              </label>
              <input
                type="text"
                value={portalId}
                onChange={(e) => setPortalId(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting || !accessToken.trim() || !refreshToken.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {connecting ? 'Connecting...' : 'Connect HubSpot'}
            </button>

            {/* How it works */}
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">
                How it works
              </h3>
              <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                <li>Connect using your HubSpot OAuth tokens (Private App or OAuth flow).</li>
                <li>DevSignal auto-creates custom properties (PQA Score, Signal Count, etc.) in HubSpot.</li>
                <li>Contacts, companies, deals, and signals sync to HubSpot every 15 minutes.</li>
                <li>Sales reps see enriched developer data directly in HubSpot records.</li>
              </ol>
            </div>

            {/* What syncs */}
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">
                What gets synced to HubSpot
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <p className="font-medium text-gray-700">Contacts</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>PQA Score & Tier</li>
                    <li>Signal Count</li>
                    <li>Last Signal Date</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Companies</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>PQA Score</li>
                    <li>Developer Count</li>
                    <li>Top Signal Type</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Deals</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>PLG Stage</li>
                    <li>Amount & Close Date</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Signals</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>Activity Notes on Contacts</li>
                    <li>e.g. "npm install detected"</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Connected -- show status and sync controls
  const lastResult = status.lastSyncResult;

  return (
    <div className="space-y-4">
      {/* Connection card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center">
              <HubSpotIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                HubSpot Sync
              </h2>
              <p className="text-sm text-gray-500">
                Bidirectional sync pushes DevSignal data into HubSpot.
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Connected
              {status.portalId && (
                <span className="text-green-500 ml-1">
                  (Portal {status.portalId})
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Sync status banner */}
          {status.syncInProgress && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-center gap-3">
              <Spinner size="sm" />
              <span className="text-sm text-indigo-700 font-medium">
                Sync in progress...
              </span>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Last Sync</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatDateTime(status.lastSyncAt)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Contacts Synced</p>
              <p className="text-sm font-semibold text-gray-900">
                {status.totalContactsSynced.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Companies Synced</p>
              <p className="text-sm font-semibold text-gray-900">
                {status.totalCompaniesSynced.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Deals Synced</p>
              <p className="text-sm font-semibold text-gray-900">
                {status.totalDealsSynced.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Last sync result */}
          {lastResult && (
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">
                  Last Sync Result
                </h3>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Contacts</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        +{lastResult.contacts.created}
                      </span>{' '}
                      /{' '}
                      <span className="text-blue-600">
                        ~{lastResult.contacts.updated}
                      </span>
                      {lastResult.contacts.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.contacts.failed} failed
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Companies</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        +{lastResult.companies.created}
                      </span>{' '}
                      /{' '}
                      <span className="text-blue-600">
                        ~{lastResult.companies.updated}
                      </span>
                      {lastResult.companies.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.companies.failed} failed
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Deals</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        +{lastResult.deals.created}
                      </span>{' '}
                      /{' '}
                      <span className="text-blue-600">
                        ~{lastResult.deals.updated}
                      </span>
                      {lastResult.deals.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.deals.failed} failed
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Signal Notes</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        {lastResult.signals.synced} synced
                      </span>
                      {lastResult.signals.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.signals.failed} failed
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* Errors */}
                {lastResult.errors.length > 0 && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-red-700 mb-1">
                      Errors ({lastResult.errors.length})
                    </p>
                    <ul className="text-xs text-red-600 space-y-0.5">
                      {lastResult.errors.slice(0, 5).map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                      {lastResult.errors.length > 5 && (
                        <li className="text-red-400">
                          ...and {lastResult.errors.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={() => handleSync(false)}
              disabled={syncing || status.syncInProgress}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {syncing || status.syncInProgress ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => handleSync(true)}
              disabled={syncing || status.syncInProgress}
              className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Full Re-sync
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-red-600 text-sm font-medium hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>

          {/* Info */}
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
            <p className="text-xs text-gray-500">
              Automatic sync runs every 15 minutes and only pushes records
              modified since the last sync. Use "Full Re-sync" to push all
              records regardless of last sync time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 7: Discord
// ---------------------------------------------------------------------------

function DiscordTab() {
  const toast = useToast();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [monitoredChannels, setMonitoredChannels] = useState<Set<string>>(new Set());
  const [savingChannels, setSavingChannels] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/discord/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        guildName: null,
        guildIcon: null,
        guildId: null,
        memberCount: 0,
        monitoredChannels: 0,
        lastSyncAt: null,
        lastSyncResult: null,
        sourceId: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [fetchStatus]);

  async function handleConnect() {
    if (!botToken.trim()) {
      toast.error('Please enter a Discord bot token.');
      return;
    }

    setConnecting(true);
    try {
      const { data } = await api.post('/connectors/discord/connect', {
        botToken: botToken.trim(),
      });
      setBotToken('');
      toast.success(`Connected to Discord server: ${data.server.name}`);
      // Show channels for selection
      setChannels(data.channels);
      setMonitoredChannels(new Set());
      setShowChannels(true);
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function fetchChannels() {
    try {
      const { data } = await api.get('/connectors/discord/channels');
      setChannels(data.channels);
      setMonitoredChannels(new Set(data.monitoredChannels));
      setShowChannels(true);
    } catch (err) {
      toast.error(extractApiError(err));
    }
  }

  function toggleChannel(channelId: string) {
    setMonitoredChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  }

  async function handleSaveChannels() {
    setSavingChannels(true);
    try {
      await api.put('/connectors/discord/channels', {
        channelIds: Array.from(monitoredChannels),
      });
      toast.success(`Monitoring ${monitoredChannels.size} channels.`);
      setShowChannels(false);
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSavingChannels(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/discord/sync');
      toast.success('Discord sync queued.');
      // Start polling for status updates
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
        // Stop polling after 2 minutes
        setTimeout(() => {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 120_000);
      }
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Discord? Signal data will remain, but syncing will stop.')) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/discord/disconnect');
      toast.success('Discord disconnected.');
      setShowChannels(false);
      setChannels([]);
      setMonitoredChannels(new Set());
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Spinner size="lg" />
      </div>
    );
  }

  // Not connected state
  if (!status?.connected) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <DiscordIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Discord
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Track developer activity in your community Discord server. Monitor messages,
                support questions, feature requests, and community engagement.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bot Token
                  </label>
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="Enter your Discord bot token"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Create a bot at{' '}
                    <a
                      href="https://discord.com/developers/applications"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-700"
                    >
                      discord.com/developers
                    </a>
                    . Required permissions: Read Messages/View Channels, Read Message History, View Server Members.
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !botToken.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect Bot'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Setup instructions */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Setup instructions
          </h4>
          <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
            <li>Go to the Discord Developer Portal and create a new application</li>
            <li>Navigate to the Bot section and create a bot</li>
            <li>Enable the "Server Members" and "Message Content" privileged intents</li>
            <li>Copy the bot token and paste it above</li>
            <li>Use the OAuth2 URL Generator to invite the bot to your server with the required permissions</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div className="space-y-6">
      {/* Server info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          {status.guildIcon ? (
            <img
              src={status.guildIcon}
              alt={status.guildName || 'Discord server'}
              className="w-12 h-12 rounded-xl flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <DiscordIcon />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {status.guildName}
              </h3>
              <Badge color="green">Connected</Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span>{status.memberCount.toLocaleString()} members</span>
              <span>{status.monitoredChannels} channels monitored</span>
            </div>
          </div>
        </div>
      </div>

      {/* Channel selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-medium text-gray-900">Monitored Channels</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Select which channels to track for developer signals.
            </p>
          </div>
          <button
            onClick={fetchChannels}
            className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            {showChannels ? 'Refresh Channels' : 'Configure Channels'}
          </button>
        </div>

        {showChannels && channels.length > 0 && (
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {channels.map((channel) => (
                <label
                  key={channel.id}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${
                    channel.isBotChannel ? 'opacity-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={monitoredChannels.has(channel.id)}
                    onChange={() => toggleChannel(channel.id)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700 flex-1">
                    # {channel.name}
                  </span>
                  <div className="flex gap-1">
                    {channel.isSupportChannel && (
                      <Badge color="blue">support</Badge>
                    )}
                    {channel.isShowcaseChannel && (
                      <Badge color="green">showcase</Badge>
                    )}
                    {channel.isBotChannel && (
                      <Badge color="yellow">bot</Badge>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveChannels}
                disabled={savingChannels}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingChannels ? 'Saving...' : `Save (${monitoredChannels.size} selected)`}
              </button>
              <button
                onClick={() => {
                  // Auto-select non-bot channels
                  const suggested = channels
                    .filter((c) => !c.isBotChannel)
                    .map((c) => c.id);
                  setMonitoredChannels(new Set(suggested));
                }}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Auto-select all (exclude bots)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sync status */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Sync Status</h4>

        {status.lastSyncResult && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Messages Processed</p>
              <p className="text-lg font-semibold text-gray-900">
                {status.lastSyncResult.messagesProcessed}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Signals Created</p>
              <p className="text-lg font-semibold text-gray-900">
                {status.lastSyncResult.signalsCreated}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-500">Contacts Resolved</p>
              <p className="text-lg font-semibold text-gray-900">
                {status.lastSyncResult.contactsResolved}
              </p>
            </div>
          </div>
        )}

        {status.lastSyncResult?.errors && status.lastSyncResult.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-xs font-medium text-red-700 mb-1">Sync Errors</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              {status.lastSyncResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-gray-400 mb-4">
          Last synced: {formatDateTime(status.lastSyncAt)}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-4 py-2 text-red-600 text-sm font-medium hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>

        {/* Info */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mt-4">
          <p className="text-xs text-gray-500">
            Automatic sync runs every 30 minutes. It fetches new messages from
            monitored channels and creates signals for developer activity.
            Signal types include: messages, thread creation, support questions,
            and community engagement.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Settings page
// ---------------------------------------------------------------------------

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('api-keys');
  const loadedTabsRef = useRef<Set<TabId>>(new Set(['api-keys']));

  function handleTabChange(tabId: TabId) {
    loadedTabsRef.current.add(tabId);
    setActiveTab(tabId);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage API keys, webhooks, integrations, and signal sources.
      </p>

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6" aria-label="Settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content -- lazy mount: only render once the tab has been visited */}
      {loadedTabsRef.current.has('api-keys') && (
        <div className={activeTab === 'api-keys' ? '' : 'hidden'}>
          <ApiKeysTab />
        </div>
      )}
      {loadedTabsRef.current.has('webhooks') && (
        <div className={activeTab === 'webhooks' ? '' : 'hidden'}>
          <WebhooksTab />
        </div>
      )}
      {loadedTabsRef.current.has('sources') && (
        <div className={activeTab === 'sources' ? '' : 'hidden'}>
          <SignalSourcesTab />
        </div>
      )}
      {loadedTabsRef.current.has('slack') && (
        <div className={activeTab === 'slack' ? '' : 'hidden'}>
          <SlackTab />
        </div>
      )}
      {loadedTabsRef.current.has('segment') && (
        <div className={activeTab === 'segment' ? '' : 'hidden'}>
          <SegmentTab />
        </div>
      )}
      {loadedTabsRef.current.has('hubspot') && (
        <div className={activeTab === 'hubspot' ? '' : 'hidden'}>
          <HubSpotTab />
        </div>
      )}
      {loadedTabsRef.current.has('discord') && (
        <div className={activeTab === 'discord' ? '' : 'hidden'}>
          <DiscordTab />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slack icon (inline SVG)
// ---------------------------------------------------------------------------

function SlackIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
        fill="#E01E5A"
      />
      <path
        d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
        fill="#36C5F0"
      />
      <path
        d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
        fill="#2EB67D"
      />
      <path
        d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
        fill="#ECB22E"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Segment icon (inline SVG)
// ---------------------------------------------------------------------------

function SegmentIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 64 64" fill="none">
      <path
        d="M34.6 53.3H13.1c-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8h21.5c10.6 0 19.3-8.7 19.3-19.3 0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8c0 12.6-10.3 22.9-22.9 22.9z"
        fill="#52BD94"
      />
      <path
        d="M56.3 18H22.5c-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8h33.8c1 0 1.8.8 1.8 1.8S57.3 18 56.3 18z"
        fill="#52BD94"
      />
      <path
        d="M9.5 37.8c-5 0-9-4-9-9s4-9 9-9 9 4 9 9-4.1 9-9 9zm0-14.3c-3 0-5.4 2.4-5.4 5.4s2.4 5.4 5.4 5.4 5.4-2.4 5.4-5.4-2.5-5.4-5.4-5.4z"
        fill="#52BD94"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HubSpot icon (inline SVG)
// ---------------------------------------------------------------------------

function HubSpotIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path
        d="M17.63 9.22V6.85a1.73 1.73 0 0 0 1-1.56v-.05a1.73 1.73 0 0 0-1.73-1.73h-.05a1.73 1.73 0 0 0-1.73 1.73v.05a1.73 1.73 0 0 0 1 1.56v2.37a5.11 5.11 0 0 0-2.32 1.13L7.4 5.82a2.1 2.1 0 0 0 .08-.52 2.07 2.07 0 1 0-2.07 2.07 2.04 2.04 0 0 0 1.08-.31l6.34 4.69a5.08 5.08 0 0 0-.06 6.42l-1.93 1.93a1.55 1.55 0 0 0-.46-.07 1.59 1.59 0 1 0 1.59 1.59 1.55 1.55 0 0 0-.07-.46l1.89-1.89a5.12 5.12 0 1 0 3.84-10.05zm-.75 7.94a2.82 2.82 0 1 1 0-5.64 2.82 2.82 0 0 1 0 5.64z"
        fill="#FF7A59"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Discord icon (inline SVG)
// ---------------------------------------------------------------------------

function DiscordIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
        fill="#5865F2"
      />
    </svg>
  );
}
