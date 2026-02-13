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
}

type TabId = 'api-keys' | 'webhooks' | 'sources' | 'slack';

const TABS: { id: TabId; label: string }[] = [
  { id: 'api-keys', label: 'API Keys' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'sources', label: 'Signal Sources' },
  { id: 'slack', label: 'Slack' },
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

  useEffect(() => {
    async function fetchSlackSettings() {
      try {
        const { data } = await api.get('/settings/slack');
        setSlackSettings(data);
      } catch {
        setSlackSettings({ configured: false, webhookUrl: null });
      } finally {
        setLoading(false);
      }
    }
    fetchSlackSettings();
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
      setSlackSettings(data);
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
      setSlackSettings(data);
      toast.success('Slack integration removed.');
    } catch {
      toast.error('Failed to remove Slack integration.');
    } finally {
      setRemoving(false);
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
              You will receive notifications for: PQA tier changes (COLD to WARM
              to HOT), new HOT accounts, and high-value signals (signups, app
              installs, PR merges, team adoption).
            </p>
          </div>
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
