import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';
import CustomFieldsManager from '../components/CustomFieldsManager';

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

interface SalesforceSyncStatus {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncResult: {
    contacts: { created: number; updated: number; failed: number };
    accounts: { created: number; updated: number; failed: number };
    opportunities: { created: number; updated: number; failed: number };
    tasks: { synced: number; failed: number };
    errors: string[];
  } | null;
  syncInProgress: boolean;
  instanceUrl: string | null;
  totalContactsSynced: number;
  totalAccountsSynced: number;
  totalOpportunitiesSynced: number;
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

interface StackOverflowStatus {
  connected: boolean;
  trackedTags: string[];
  hasApiKey: boolean;
  lastSyncAt: string | null;
  lastSyncResult: {
    questionsProcessed: number;
    answersProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
}

interface TwitterStatus {
  connected: boolean;
  keywords: string[];
  lastSyncAt: string | null;
  lastSyncResult: {
    tweetsProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    sentimentBreakdown: {
      positive: number;
      negative: number;
      neutral: number;
    };
    errors: string[];
  } | null;
  sourceId: string | null;
}

interface RedditStatus {
  connected: boolean;
  keywords: string[];
  subreddits: string[];
  lastSyncAt: string | null;
  lastSyncResult: {
    postsProcessed: number;
    commentsProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
}

interface PostHogStatus {
  connected: boolean;
  host: string | null;
  projectId: string | null;
  trackedEvents: string[];
  webhookUrl: string | null;
  lastSyncAt: string | null;
  lastSyncResult: {
    eventsProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
}

interface IntercomStatus {
  connected: boolean;
  webhookUrl: string | null;
  webhookSecret: string | null;
  trackedEvents: string[];
  lastSyncAt: string | null;
  lastSyncResult: {
    conversationsProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
  signalStats: {
    total: number;
    conversationOpened: number;
    conversationReplied: number;
    conversationClosed: number;
    conversationRated: number;
  };
}

interface ZendeskStatus {
  connected: boolean;
  subdomain: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  trackedEvents: string[];
  lastSyncAt: string | null;
  lastSyncResult: {
    ticketsProcessed: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
  signalStats: {
    total: number;
    ticketCreated: number;
    ticketUpdated: number;
    ticketSolved: number;
    satisfactionRated: number;
  };
}

type TabId = 'api-keys' | 'webhooks' | 'sources' | 'notifications' | 'custom-fields' | 'ai-config' | 'slack' | 'segment' | 'hubspot' | 'salesforce' | 'discord' | 'stackoverflow' | 'twitter' | 'reddit' | 'linkedin' | 'posthog' | 'clearbit' | 'intercom' | 'zendesk';

const TABS: { id: TabId; label: string }[] = [
  { id: 'api-keys', label: 'API Keys' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'sources', label: 'Signal Sources' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'custom-fields', label: 'Custom Fields' },
  { id: 'ai-config', label: 'AI Configuration' },
  { id: 'slack', label: 'Slack' },
  { id: 'segment', label: 'Segment' },
  { id: 'hubspot', label: 'HubSpot' },
  { id: 'salesforce', label: 'Salesforce' },
  { id: 'discord', label: 'Discord' },
  { id: 'stackoverflow', label: 'Stack Overflow' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'posthog', label: 'PostHog' },
  { id: 'clearbit', label: 'Clearbit' },
  { id: 'intercom', label: 'Intercom' },
  { id: 'zendesk', label: 'Zendesk' },
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
// Tab 7: Salesforce
// ---------------------------------------------------------------------------

function SalesforceTab() {
  const toast = useToast();
  const [status, setStatus] = useState<SalesforceSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/integrations/salesforce/status');
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
        instanceUrl: null,
        totalContactsSynced: 0,
        totalAccountsSynced: 0,
        totalOpportunitiesSynced: 0,
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
    if (!accessToken.trim() || !refreshToken.trim() || !instanceUrl.trim()) {
      toast.error('Please enter access token, refresh token, and instance URL.');
      return;
    }

    setConnecting(true);
    try {
      await api.post('/integrations/salesforce/connect', {
        accessToken: accessToken.trim(),
        refreshToken: refreshToken.trim(),
        instanceUrl: instanceUrl.trim(),
      });
      setAccessToken('');
      setRefreshToken('');
      setInstanceUrl('');
      await fetchStatus();
      toast.success('Salesforce connected successfully. Custom fields registered.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync(fullSync = false) {
    setSyncing(true);
    try {
      await api.post('/integrations/salesforce/sync', { fullSync });
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
        'Disconnect Salesforce? Synced data in Salesforce will remain, but automatic syncing will stop.',
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.delete('/integrations/salesforce/disconnect');
      await fetchStatus();
      toast.success('Salesforce disconnected.');
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
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <SalesforceIcon />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Connect Salesforce
                </h2>
                <p className="text-sm text-gray-500">
                  Push enriched developer signals, PQA scores, and opportunity data into
                  Salesforce so sales reps see them where they already work.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Salesforce Access Token
              </label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="00D..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Salesforce Refresh Token
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
                Instance URL
              </label>
              <input
                type="text"
                value={instanceUrl}
                onChange={(e) => setInstanceUrl(e.target.value)}
                placeholder="https://yourorg.my.salesforce.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting || !accessToken.trim() || !refreshToken.trim() || !instanceUrl.trim()}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {connecting ? 'Connecting...' : 'Connect Salesforce'}
            </button>

            {/* How it works */}
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">
                How to set up a Connected App
              </h3>
              <ol className="text-sm text-gray-600 space-y-1.5 list-decimal list-inside">
                <li>In Salesforce Setup, go to App Manager and create a new Connected App.</li>
                <li>Enable OAuth Settings and add scopes: api, refresh_token, offline_access.</li>
                <li>Set a callback URL (e.g. https://yourapp.com/oauth/callback).</li>
                <li>Complete the OAuth flow to obtain access and refresh tokens.</li>
                <li>Paste the tokens and your instance URL above.</li>
              </ol>
            </div>

            {/* What syncs */}
            <div className="rounded-lg bg-gray-50 border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">
                What gets synced to Salesforce
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                <div>
                  <p className="font-medium text-gray-700">Contacts</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>PQA Score (custom field)</li>
                    <li>Signal Count</li>
                    <li>Last Signal Date</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Accounts</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>PQA Score</li>
                    <li>Signal Count</li>
                    <li>Last Signal Date</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Opportunities</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>PLG Stage Mapping</li>
                    <li>Amount & Close Date</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Tasks</p>
                  <ul className="text-xs mt-1 space-y-0.5">
                    <li>Signal activity as Tasks</li>
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
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <SalesforceIcon />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Salesforce Sync
              </h2>
              <p className="text-sm text-gray-500">
                Bidirectional sync pushes DevSignal data into Salesforce.
              </p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Connected
              {status.instanceUrl && (
                <span className="text-green-500 ml-1 truncate max-w-[200px]">
                  ({status.instanceUrl.replace('https://', '')})
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
              <p className="text-xs text-gray-500 mb-1">Accounts Synced</p>
              <p className="text-sm font-semibold text-gray-900">
                {status.totalAccountsSynced.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Opps Synced</p>
              <p className="text-sm font-semibold text-gray-900">
                {status.totalOpportunitiesSynced.toLocaleString()}
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
                    <p className="text-xs text-gray-500">Accounts</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        +{lastResult.accounts.created}
                      </span>{' '}
                      /{' '}
                      <span className="text-blue-600">
                        ~{lastResult.accounts.updated}
                      </span>
                      {lastResult.accounts.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.accounts.failed} failed
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Opportunities</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        +{lastResult.opportunities.created}
                      </span>{' '}
                      /{' '}
                      <span className="text-blue-600">
                        ~{lastResult.opportunities.updated}
                      </span>
                      {lastResult.opportunities.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.opportunities.failed} failed
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Signal Tasks</p>
                    <p className="text-gray-900">
                      <span className="text-green-600">
                        {lastResult.tasks.synced} synced
                      </span>
                      {lastResult.tasks.failed > 0 && (
                        <>
                          {' / '}
                          <span className="text-red-600">
                            {lastResult.tasks.failed} failed
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
// Tab 8: Discord
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
// Tab: Twitter / X
// ---------------------------------------------------------------------------

function TwitterTab() {
  const toast = useToast();
  const [status, setStatus] = useState<TwitterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [bearerToken, setBearerToken] = useState('');
  const [keywordsInput, setKeywordsInput] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/twitter/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        keywords: [],
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
    if (!bearerToken.trim()) {
      toast.error('Please enter a Twitter Bearer token.');
      return;
    }
    const keywords = keywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      toast.error('Please enter at least one keyword to track.');
      return;
    }

    setConnecting(true);
    try {
      await api.post('/connectors/twitter/connect', {
        bearerToken: bearerToken.trim(),
        keywords,
      });
      setBearerToken('');
      toast.success('Twitter/X connected successfully.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/twitter/sync');
      toast.success('Twitter sync queued.');
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
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
    if (!window.confirm('Disconnect Twitter/X? Signal data will remain, but syncing will stop.')) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/twitter/disconnect');
      toast.success('Twitter/X disconnected.');
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
            <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <TwitterIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Twitter / X
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Monitor tweets mentioning your product. Track sentiment, questions,
                praise, and complaints from the developer community in real time.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bearer Token
                  </label>
                  <input
                    type="password"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="Enter your Twitter API v2 Bearer token"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Get your Bearer token from the{' '}
                    <a
                      href="https://developer.twitter.com/en/portal/dashboard"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-700"
                    >
                      Twitter Developer Portal
                    </a>
                    . Requires at least Basic tier API access.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords to Track
                  </label>
                  <input
                    type="text"
                    value={keywordsInput}
                    onChange={(e) => setKeywordsInput(e.target.value)}
                    placeholder="@vercel, vercel, nextjs, next.js"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated terms. Include your product name, @handle, and
                    related keywords.
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !bearerToken.trim() || !keywordsInput.trim()}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect Twitter/X'}
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
            <li>Go to the Twitter Developer Portal and create a project + app</li>
            <li>Subscribe to at least the Basic tier ($100/mo) for search access</li>
            <li>Generate a Bearer Token under &quot;Keys and Tokens&quot;</li>
            <li>Paste the Bearer token above and add keywords to track</li>
            <li>DevSignal will check for new mentions every 30 minutes</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  const sr = status.lastSyncResult;
  const totalSentiment = sr
    ? sr.sentimentBreakdown.positive + sr.sentimentBreakdown.negative + sr.sentimentBreakdown.neutral
    : 0;

  return (
    <div className="space-y-6">
      {/* Connection info */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center flex-shrink-0">
            <TwitterIcon />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Twitter / X
              </h3>
              <Badge color="green">Connected</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {status.keywords.map((kw) => (
                <Badge key={kw} color="blue">{kw}</Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sync status + sentiment */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Sync Status</h4>

        {sr && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Tweets Processed</p>
                <p className="text-lg font-semibold text-gray-900">
                  {sr.tweetsProcessed}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Signals Created</p>
                <p className="text-lg font-semibold text-gray-900">
                  {sr.signalsCreated}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Contacts Resolved</p>
                <p className="text-lg font-semibold text-gray-900">
                  {sr.contactsResolved}
                </p>
              </div>
            </div>

            {/* Sentiment breakdown */}
            {totalSentiment > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-700 mb-2">Sentiment Breakdown</p>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                    <span className="text-xs text-gray-600">
                      Positive: {sr.sentimentBreakdown.positive}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="text-xs text-gray-600">
                      Negative: {sr.sentimentBreakdown.negative}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                    <span className="text-xs text-gray-600">
                      Neutral: {sr.sentimentBreakdown.neutral}
                    </span>
                  </span>
                </div>
                {/* Sentiment bar */}
                <div className="flex h-2 rounded-full overflow-hidden mt-2 bg-gray-100">
                  {sr.sentimentBreakdown.positive > 0 && (
                    <div
                      className="bg-green-500"
                      style={{ width: `${(sr.sentimentBreakdown.positive / totalSentiment) * 100}%` }}
                    />
                  )}
                  {sr.sentimentBreakdown.neutral > 0 && (
                    <div
                      className="bg-gray-400"
                      style={{ width: `${(sr.sentimentBreakdown.neutral / totalSentiment) * 100}%` }}
                    />
                  )}
                  {sr.sentimentBreakdown.negative > 0 && (
                    <div
                      className="bg-red-500"
                      style={{ width: `${(sr.sentimentBreakdown.negative / totalSentiment) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            {sr.errors && sr.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-red-700 mb-1">Sync Errors</p>
                <ul className="text-xs text-red-600 space-y-0.5">
                  {sr.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-gray-400 mb-4">
          Last synced: {formatDateTime(status.lastSyncAt)}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            Automatic sync runs every 30 minutes. DevSignal searches for tweets
            mentioning your keywords, classifies sentiment (positive/negative/neutral),
            and creates signals for each mention. Signal types include: mentions,
            questions, complaints, and praise.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clearbit Enrichment Tab
// ---------------------------------------------------------------------------

interface ClearbitStatus {
  connected: boolean;
  connectedAt: string | null;
  lastEnrichmentAt: string | null;
  companies: {
    total: number;
    enriched: number;
    unenriched: number;
    coveragePercent: number;
  };
  contacts: {
    total: number;
    enriched: number;
    unenriched: number;
    coveragePercent: number;
  };
}

function ClearbitTab() {
  const toast = useToast();
  const [status, setStatus] = useState<ClearbitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [enrichingCompanies, setEnrichingCompanies] = useState(false);
  const [enrichingContacts, setEnrichingContacts] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/enrichment/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        connectedAt: null,
        lastEnrichmentAt: null,
        companies: { total: 0, enriched: 0, unenriched: 0, coveragePercent: 0 },
        contacts: { total: 0, enriched: 0, unenriched: 0, coveragePercent: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleConnect() {
    if (!apiKey.trim()) {
      toast.error('Please enter your Clearbit API key.');
      return;
    }
    setConnecting(true);
    try {
      await api.post('/enrichment/connect', { apiKey: apiKey.trim() });
      setApiKey('');
      await fetchStatus();
      toast.success('Clearbit connected successfully.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleBulkEnrichCompanies() {
    setEnrichingCompanies(true);
    try {
      await api.post('/enrichment/bulk/companies');
      toast.success('Bulk company enrichment queued. This may take a few minutes.');
      setTimeout(fetchStatus, 3000);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setEnrichingCompanies(false);
    }
  }

  async function handleBulkEnrichContacts() {
    setEnrichingContacts(true);
    try {
      await api.post('/enrichment/bulk/contacts');
      toast.success('Bulk contact enrichment queued. This may take a few minutes.');
      setTimeout(fetchStatus, 3000);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setEnrichingContacts(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Clearbit? Existing enrichment data will remain.')) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.delete('/enrichment/disconnect');
      await fetchStatus();
      toast.success('Clearbit disconnected.');
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

  if (!status?.connected) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Connect Clearbit
                </h2>
                <p className="text-sm text-gray-500">
                  Automatically enrich company and contact records with firmographic
                  data, tech stacks, funding info, and more.
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clearbit API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Get your API key at{' '}
                <a
                  href="https://dashboard.clearbit.com/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  dashboard.clearbit.com
                </a>
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting || !apiKey.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? 'Connecting...' : 'Connect Clearbit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Clearbit Connected
                </h2>
                <p className="text-sm text-gray-500">
                  Connected {status.connectedAt ? formatDate(status.connectedAt) : ''}
                  {status.lastEnrichmentAt && (
                    <span> &middot; Last enrichment: {formatDateTime(status.lastEnrichmentAt)}</span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Company Enrichment</h3>
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-gray-900">
              {status.companies.coveragePercent}%
            </span>
            <span className="text-xs text-gray-500">
              {status.companies.enriched} / {status.companies.total} companies
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 rounded-full h-2 transition-all duration-500"
              style={{ width: `${status.companies.coveragePercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {status.companies.unenriched} companies awaiting enrichment
          </p>
          <button
            onClick={handleBulkEnrichCompanies}
            disabled={enrichingCompanies || status.companies.unenriched === 0}
            className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enrichingCompanies ? 'Queuing...' : 'Enrich All Companies'}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Contact Enrichment</h3>
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-gray-900">
              {status.contacts.coveragePercent}%
            </span>
            <span className="text-xs text-gray-500">
              {status.contacts.enriched} / {status.contacts.total} contacts
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
            <div
              className="bg-indigo-600 rounded-full h-2 transition-all duration-500"
              style={{ width: `${status.contacts.coveragePercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {status.contacts.unenriched} contacts awaiting enrichment
          </p>
          <button
            onClick={handleBulkEnrichContacts}
            disabled={enrichingContacts || status.contacts.unenriched === 0}
            className="w-full px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enrichingContacts ? 'Queuing...' : 'Enrich All Contacts'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-1">What gets enriched?</h4>
        <div className="grid grid-cols-2 gap-4 text-xs text-blue-800">
          <div>
            <p className="font-medium mb-1">Companies:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Industry, sector, sub-industry</li>
              <li>Employee count & company size</li>
              <li>Annual revenue & total funding</li>
              <li>Tech stack (valuable for devtools!)</li>
              <li>Location, social handles</li>
              <li>Founded year, logo</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">Contacts:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>Name, title, avatar</li>
              <li>Seniority & role</li>
              <li>Company association</li>
              <li>Location</li>
              <li>Twitter & LinkedIn handles</li>
            </ul>
          </div>
        </div>
        <p className="text-xs text-blue-700 mt-2">
          New companies are automatically enriched daily at 3 AM.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Configuration Tab
// ---------------------------------------------------------------------------

interface AIConfigStatus {
  configured: boolean;
  keyPrefix: string | null;
}

function AIConfigTab() {
  const toast = useToast();
  const [status, setStatus] = useState<AIConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [apiKey, setApiKey] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/ai/config');
      setStatus(data);
    } catch {
      setStatus({
        configured: false,
        keyPrefix: null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleSaveKey() {
    if (!apiKey.trim()) {
      toast.error('Please enter your Anthropic API key.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put('/ai/config/api-key', { apiKey: apiKey.trim() });
      setApiKey('');
      setStatus({
        configured: true,
        keyPrefix: data.keyPrefix,
      });
      toast.success('API key saved successfully.');
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKey() {
    if (!window.confirm('Remove your Anthropic API key? AI features will be disabled.')) {
      return;
    }
    setRemoving(true);
    try {
      await api.put('/ai/config/api-key', { apiKey: '' });
      setStatus({
        configured: false,
        keyPrefix: null,
      });
      toast.success('API key removed.');
    } catch (err) {
      toast.error(extractApiError(err));
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                AI Configuration
              </h2>
              <p className="text-sm text-gray-500">
                DevSignal uses Claude AI to generate account briefs, next-best-actions, and contact enrichment. Add your Anthropic API key to enable these features. You can get one at{' '}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:underline"
                >
                  console.anthropic.com
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status indicator */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${status?.configured ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm font-medium text-gray-900">
                {status?.configured ? 'Configured' : 'Not configured'}
              </span>
            </div>
            {status?.configured && status.keyPrefix && (
              <span className="text-sm text-gray-500 font-mono">
                {status.keyPrefix}...
              </span>
            )}
          </div>

          {/* API Key input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anthropic API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              Your API key is encrypted and stored securely. We only use it to make requests to Anthropic on your behalf.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSaveKey}
              disabled={saving || !apiKey.trim()}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save API Key'}
            </button>
            {status?.configured && (
              <button
                onClick={handleRemoveKey}
                disabled={removing}
                className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {removing ? 'Removing...' : 'Remove Key'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI Features Info */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <h4 className="text-sm font-medium text-purple-900 mb-2">AI-Powered Features</h4>
        <ul className="space-y-1.5 text-xs text-purple-800">
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span><strong>Account Briefs:</strong> Automatically generate comprehensive summaries of account history, key contacts, and recent activity</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span><strong>Next-Best-Actions:</strong> Get AI-powered suggestions for outreach and engagement strategies</span>
          </li>
          <li className="flex items-start gap-2">
            <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span><strong>Contact Enrichment:</strong> Enhance contact profiles with intelligent insights and context</span>
          </li>
        </ul>
        <p className="text-xs text-purple-700 mt-3 pt-3 border-t border-purple-200">
          <strong>Note:</strong> You pay Anthropic directly for API usage. DevSignal does not charge for AI features.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notification Preferences types
// ---------------------------------------------------------------------------

type EmailDigestFrequency = 'DAILY' | 'WEEKLY' | 'NEVER';
type SignalAlertLevel = 'ALL' | 'HOT_ONLY' | 'NONE';

interface NotificationPreferences {
  emailDigest: EmailDigestFrequency;
  signalAlerts: SignalAlertLevel;
  workflowNotifications: boolean;
  teamMentions: boolean;
  usageLimitWarnings: boolean;
}

// ---------------------------------------------------------------------------
// NotificationsTab — per-user notification preference controls
// ---------------------------------------------------------------------------

function NotificationsTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    emailDigest: 'WEEKLY',
    signalAlerts: 'ALL',
    workflowNotifications: true,
    teamMentions: true,
    usageLimitWarnings: true,
  });

  // Load preferences on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/notifications/preferences');
        if (!cancelled) {
          setPrefs({
            emailDigest: data.emailDigest,
            signalAlerts: data.signalAlerts,
            workflowNotifications: data.workflowNotifications,
            teamMentions: data.teamMentions,
            usageLimitWarnings: data.usageLimitWarnings,
          });
        }
      } catch {
        if (!cancelled) toast.error('Failed to load notification preferences.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save a single field change
  const saveField = useCallback(
    async (field: keyof NotificationPreferences, value: NotificationPreferences[keyof NotificationPreferences]) => {
      setSaving(true);
      try {
        await api.put('/notifications/preferences', { [field]: value });
        toast.success('Preference saved.');
      } catch {
        toast.error('Failed to save preference.');
      } finally {
        setSaving(false);
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const updatePref = useCallback(
    <K extends keyof NotificationPreferences>(field: K, value: NotificationPreferences[K]) => {
      setPrefs((prev) => ({ ...prev, [field]: value }));
      saveField(field, value);
    },
    [saveField]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
        <p className="text-sm text-gray-500 mt-1">
          Control what notifications you receive and how often. Changes are saved automatically.
        </p>
      </div>

      {/* Email Digest */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Email Digest</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Receive a summary of activity and signals delivered to your inbox.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(['DAILY', 'WEEKLY', 'NEVER'] as EmailDigestFrequency[]).map((opt) => (
            <button
              key={opt}
              onClick={() => updatePref('emailDigest', opt)}
              disabled={saving}
              className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                prefs.emailDigest === opt
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt === 'DAILY' ? 'Daily' : opt === 'WEEKLY' ? 'Weekly' : 'Never'}
            </button>
          ))}
        </div>
      </div>

      {/* Signal Alerts */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Signal Alerts</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose which signal notifications you receive in real-time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(['ALL', 'HOT_ONLY', 'NONE'] as SignalAlertLevel[]).map((opt) => (
            <button
              key={opt}
              onClick={() => updatePref('signalAlerts', opt)}
              disabled={saving}
              className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                prefs.signalAlerts === opt
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt === 'ALL' ? 'All signals' : opt === 'HOT_ONLY' ? 'Hot signals only' : 'None'}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle switches */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
        {/* Workflow Notifications */}
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Workflow Notifications</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Get notified when workflows complete, fail, or require attention.
            </p>
          </div>
          <ToggleSwitch
            checked={prefs.workflowNotifications}
            onChange={(v) => updatePref('workflowNotifications', v)}
            disabled={saving}
          />
        </div>

        {/* Team Mentions */}
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Team Mentions</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Receive a notification when a teammate mentions you in a note or activity.
            </p>
          </div>
          <ToggleSwitch
            checked={prefs.teamMentions}
            onChange={(v) => updatePref('teamMentions', v)}
            disabled={saving}
          />
        </div>

        {/* Usage Limit Warnings */}
        <div className="flex items-center justify-between p-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Usage Limit Warnings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Get alerts when you approach or exceed your plan limits (contacts, signals, users).
            </p>
          </div>
          <ToggleSwitch
            checked={prefs.usageLimitWarnings}
            onChange={(v) => updatePref('usageLimitWarnings', v)}
            disabled={saving}
          />
        </div>
      </div>

      {saving && (
        <p className="text-xs text-gray-400 text-right">Saving...</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToggleSwitch — accessible toggle component for notification prefs
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
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
      {loadedTabsRef.current.has('notifications') && (
        <div className={activeTab === 'notifications' ? '' : 'hidden'}>
          <NotificationsTab />
        </div>
      )}
      {loadedTabsRef.current.has('custom-fields') && (
        <div className={activeTab === 'custom-fields' ? '' : 'hidden'}>
          <CustomFieldsManager />
        </div>
      )}
      {loadedTabsRef.current.has('ai-config') && (
        <div className={activeTab === 'ai-config' ? '' : 'hidden'}>
          <AIConfigTab />
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
      {loadedTabsRef.current.has('salesforce') && (
        <div className={activeTab === 'salesforce' ? '' : 'hidden'}>
          <SalesforceTab />
        </div>
      )}
      {loadedTabsRef.current.has('discord') && (
        <div className={activeTab === 'discord' ? '' : 'hidden'}>
          <DiscordTab />
        </div>
      )}
      {loadedTabsRef.current.has('stackoverflow') && (
        <div className={activeTab === 'stackoverflow' ? '' : 'hidden'}>
          <StackOverflowTab />
        </div>
      )}
      {loadedTabsRef.current.has('clearbit') && (
        <div className={activeTab === 'clearbit' ? '' : 'hidden'}>
          <ClearbitTab />
        </div>
      )}
      {loadedTabsRef.current.has('twitter') && (
        <div className={activeTab === 'twitter' ? '' : 'hidden'}>
          <TwitterTab />
        </div>
      )}
      {loadedTabsRef.current.has('reddit') && (
        <div className={activeTab === 'reddit' ? '' : 'hidden'}>
          <RedditTab />
        </div>
      )}
      {loadedTabsRef.current.has('linkedin') && (
        <div className={activeTab === 'linkedin' ? '' : 'hidden'}>
          <LinkedInTab />
        </div>
      )}
      {loadedTabsRef.current.has('posthog') && (
        <div className={activeTab === 'posthog' ? '' : 'hidden'}>
          <PostHogTab />
        </div>
      )}
      {loadedTabsRef.current.has('intercom') && (
        <div className={activeTab === 'intercom' ? '' : 'hidden'}>
          <IntercomTab />
        </div>
      )}
      {loadedTabsRef.current.has('zendesk') && (
        <div className={activeTab === 'zendesk' ? '' : 'hidden'}>
          <ZendeskTab />
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
// Salesforce icon (inline SVG)
// ---------------------------------------------------------------------------

function SalesforceIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.05 4.05c.82-.82 1.95-1.3 3.2-1.3 1.57 0 2.96.78 3.82 1.97a4.76 4.76 0 0 1 3.68 1.63c.97 1.03 1.5 2.38 1.5 3.8 0 1.44-.55 2.8-1.55 3.83a5.12 5.12 0 0 1-3.63 1.58h-.02l-.02-.01a4.5 4.5 0 0 1-2.63.84c-.7 0-1.37-.16-1.97-.45a4.06 4.06 0 0 1-3.58 2.14c-1.2 0-2.28-.52-3.03-1.35A4.27 4.27 0 0 1 2 13.52c0-1.12.42-2.14 1.1-2.92a4.27 4.27 0 0 1 2.55-4.8A4.6 4.6 0 0 1 10.05 4.05z"
        fill="#00A1E0"
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

// ---------------------------------------------------------------------------
// Stack Overflow icon (inline SVG)
// ---------------------------------------------------------------------------

function StackOverflowIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path d="M17.36 20.2V14.82h1.79V22H3.2v-7.18H5v5.38h12.36z" fill="#BCBBBB" />
      <path
        d="M6.77 14.44l.37-1.76 8.79 1.84-.37 1.76-8.79-1.84zm1.16-4.18l.74-1.63 8.14 3.69-.74 1.63-8.14-3.69zm2.26-3.97l1.1-1.39 6.9 5.57-1.1 1.39-6.9-5.57zM14.63 2l-1.4 1.04 5.36 7.21 1.4-1.04L14.63 2zM6.59 18.42h8.98v1.8H6.59v-1.8z"
        fill="#F48024"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tab: PostHog
// ---------------------------------------------------------------------------

function PostHogTab() {
  const toast = useToast();
  const [status, setStatus] = useState<PostHogStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [hostInput, setHostInput] = useState('app.posthog.com');
  const [projectIdInput, setProjectIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [eventsInput, setEventsInput] = useState('$pageview, signup, feature_used');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/posthog/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        host: null,
        projectId: null,
        trackedEvents: [],
        webhookUrl: null,
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
    if (!projectIdInput.trim()) {
      toast.error('Please enter your PostHog Project ID.');
      return;
    }
    if (!apiKeyInput.trim()) {
      toast.error('Please enter your PostHog Personal API Key.');
      return;
    }

    const trackedEvents = eventsInput
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);

    setConnecting(true);
    try {
      const { data } = await api.post('/connectors/posthog/connect', {
        host: hostInput.trim() || 'app.posthog.com',
        projectId: projectIdInput.trim(),
        personalApiKey: apiKeyInput.trim(),
        trackedEvents: trackedEvents.length > 0 ? trackedEvents : undefined,
        webhookSecret: webhookSecretInput.trim() || undefined,
      });
      setApiKeyInput('');
      setWebhookSecretInput('');
      toast.success('PostHog connected successfully.');
      if (data.webhookUrl) {
        setStatus((prev) => prev ? { ...prev, webhookUrl: data.webhookUrl, connected: true } : prev);
      }
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/posthog/sync');
      toast.success('PostHog sync queued.');
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
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
    if (!window.confirm('Disconnect PostHog? Signal data will remain, but syncing will stop.')) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/posthog/disconnect');
      toast.success('PostHog disconnected.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  function copyWebhookUrl() {
    if (status?.webhookUrl) {
      navigator.clipboard.writeText(status.webhookUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
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
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <PostHogIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect PostHog
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Import product analytics events from PostHog as signals. Track pageviews,
                signups, feature usage, and custom events to identify high-intent accounts.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PostHog Host
                  </label>
                  <input
                    type="text"
                    value={hostInput}
                    onChange={(e) => setHostInput(e.target.value)}
                    placeholder="app.posthog.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Use <code className="font-mono">app.posthog.com</code> for PostHog Cloud, or enter your self-hosted URL.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project ID
                  </label>
                  <input
                    type="text"
                    value={projectIdInput}
                    onChange={(e) => setProjectIdInput(e.target.value)}
                    placeholder="e.g. 12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Find this in PostHog under Project Settings &gt; Project ID.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Personal API Key
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="phx_..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Create one at{' '}
                    <a
                      href="https://app.posthog.com/settings/user-api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      PostHog &gt; Settings &gt; Personal API Keys
                    </a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tracked Events
                  </label>
                  <input
                    type="text"
                    value={eventsInput}
                    onChange={(e) => setEventsInput(e.target.value)}
                    placeholder="$pageview, signup, feature_used, api_call"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated list of PostHog event names to import as signals.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret (optional)
                  </label>
                  <input
                    type="password"
                    value={webhookSecretInput}
                    onChange={(e) => setWebhookSecretInput(e.target.value)}
                    placeholder="Optional HMAC secret for webhook verification"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !projectIdInput.trim() || !apiKeyInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect PostHog'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">How it works</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Enter your PostHog host, project ID, and API key</li>
            <li>Choose which event types to import (pageviews, signups, feature usage, etc.)</li>
            <li>DevSignal syncs events hourly via the PostHog API</li>
            <li>Each event creates a signal with user and session metadata</li>
            <li>Identity resolution links PostHog users to your existing contacts via email</li>
            <li>Optionally set up a PostHog webhook for real-time signal ingestion</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  const lastSync = status.lastSyncResult;

  return (
    <div className="space-y-6">
      {/* Connected header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <PostHogIcon />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                PostHog Connected
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              Host: <span className="font-mono text-gray-700">{status.host}</span>
              {' '}&middot; Project: <span className="font-mono text-gray-700">{status.projectId}</span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {status.trackedEvents.map((evt) => (
                <span
                  key={evt}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {evt}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-500">
              {status.lastSyncAt && (
                <>Last synced {new Date(status.lastSyncAt).toLocaleString()}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      {status.webhookUrl && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Webhook URL (for real-time events)</h4>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-mono text-gray-800 truncate">
              {status.webhookUrl}
            </code>
            <button
              onClick={copyWebhookUrl}
              className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Paste this URL in PostHog under Project Settings &gt; Webhooks to receive events in real-time.
          </p>
        </div>
      )}

      {/* Sync stats */}
      {lastSync && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.eventsProcessed}</p>
            <p className="text-xs text-gray-500">Events Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.signalsCreated}</p>
            <p className="text-xs text-gray-500">Signals Created</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.contactsResolved}</p>
            <p className="text-xs text-gray-500">Contacts Resolved</p>
          </div>
        </div>
      )}

      {lastSync?.errors && lastSync.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Sync Errors</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {lastSync.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
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
          className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-blue-700">
          PostHog events are synced automatically every hour via the API. For real-time ingestion,
          configure the webhook URL above in your PostHog project settings.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Stack Overflow
// ---------------------------------------------------------------------------

function StackOverflowTab() {
  const toast = useToast();
  const [status, setStatus] = useState<StackOverflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/stackoverflow/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        trackedTags: [],
        hasApiKey: false,
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
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (tags.length === 0) {
      toast.error('Please enter at least one Stack Overflow tag to track.');
      return;
    }

    setConnecting(true);
    try {
      await api.post('/connectors/stackoverflow/connect', {
        trackedTags: tags,
        apiKey: apiKeyInput.trim() || null,
      });
      setTagsInput('');
      setApiKeyInput('');
      toast.success(`Stack Overflow tracking configured for: ${tags.join(', ')}`);
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/stackoverflow/sync');
      toast.success('Stack Overflow sync queued.');
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
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
    if (!window.confirm('Disconnect Stack Overflow? Signal data will remain, but syncing will stop.')) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/stackoverflow/disconnect');
      toast.success('Stack Overflow disconnected.');
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
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <StackOverflowIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Stack Overflow
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Track developer questions and answers tagged with your product on Stack Overflow.
                Monitor community engagement, identify power users, and spot trends.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tags to Monitor
                  </label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g. reactjs, nextjs, vercel"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated list of Stack Overflow tags to track. Use the exact tag names from
                    stackoverflow.com.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Key (optional)
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Stack Exchange API key"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Register at{' '}
                    <a
                      href="https://stackapps.com/apps/oauth/register"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-orange-600 hover:text-orange-700"
                    >
                      stackapps.com
                    </a>
                    {' '}for 10,000 requests/day (vs 300 without).
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !tagsInput.trim()}
                  className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Start Tracking'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">How it works</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Enter the Stack Overflow tags associated with your product</li>
            <li>DevSignal syncs questions and answers matching those tags every 6 hours</li>
            <li>Each question and answer creates a signal with metadata (score, views, answers)</li>
            <li>Identity resolution links Stack Overflow users to your existing contacts</li>
            <li>Optionally register for a free API key to increase the daily request quota</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  const lastSync = status.lastSyncResult;

  return (
    <div className="space-y-6">
      {/* Connected header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <StackOverflowIcon />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Stack Overflow Connected
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {status.trackedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"
                >
                  {tag}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-500">
              {status.hasApiKey ? 'API key configured (10K requests/day)' : 'No API key (300 requests/day)'}
              {status.lastSyncAt && (
                <>
                  {' '}&middot; Last synced {new Date(status.lastSyncAt).toLocaleString()}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Sync stats */}
      {lastSync && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.questionsProcessed}</p>
            <p className="text-xs text-gray-500">Questions Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.answersProcessed}</p>
            <p className="text-xs text-gray-500">Answers Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.signalsCreated}</p>
            <p className="text-xs text-gray-500">Signals Created</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.contactsResolved}</p>
            <p className="text-xs text-gray-500">Contacts Resolved</p>
          </div>
        </div>
      )}

      {lastSync?.errors && lastSync.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Sync Errors</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {lastSync.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Update tags */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Update Tracked Tags</h4>
        <div className="flex gap-3">
          <input
            type="text"
            value={tagsInput || status.trackedTags.join(', ')}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. reactjs, nextjs, vercel"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {connecting ? 'Saving...' : 'Update'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
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
          className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Twitter / X icon (inline SVG)
// ---------------------------------------------------------------------------

function TwitterIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <path
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// PostHog icon (inline SVG — hedgehog logo simplified)
// ---------------------------------------------------------------------------

function PostHogIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 128 128" fill="none">
      <rect width="128" height="128" rx="16" fill="#1D4AFF" />
      <path
        d="M36 80L64 36L92 80H36Z"
        fill="#F9BD2B"
      />
      <circle cx="56" cy="64" r="6" fill="#1D4AFF" />
      <circle cx="72" cy="64" r="6" fill="#1D4AFF" />
      <rect x="48" y="74" width="32" height="6" rx="3" fill="#1D4AFF" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn icon (inline SVG)
// ---------------------------------------------------------------------------

function LinkedInIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        d="M7.5 9.5h2v7h-2v-7zm1-3.2a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm3.5 3.2h1.9v1h.03c.27-.5.92-1 1.87-1 2 0 2.37 1.32 2.37 3.03v3.47h-2v-3.07c0-.73-.01-1.67-1.02-1.67-1.02 0-1.18.8-1.18 1.62v3.12H12v-7h2z"
        fill="#FFF"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn Status interface
// ---------------------------------------------------------------------------

interface LinkedInStatus {
  connected: boolean;
  companyPageUrl: string | null;
  trackEmployees: boolean;
  webhookSecret: string | null;
  webhookUrl: string | null;
  lastSyncAt: string | null;
  lastSyncResult: {
    employeesImported: number;
    signalsCreated: number;
    contactsResolved: number;
    errors: string[];
  } | null;
  sourceId: string | null;
  signalStats: {
    total: number;
    pageViews: number;
    postEngagements: number;
    employeeActivity: number;
    companyFollows: number;
  };
}

// ---------------------------------------------------------------------------
// Tab: LinkedIn
// ---------------------------------------------------------------------------

function LinkedInTab() {
  const toast = useToast();
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [companyUrl, setCompanyUrl] = useState('');
  const [trackEmployees, setTrackEmployees] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualProfileUrl, setManualProfileUrl] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualEmployees, setManualEmployees] = useState<Array<{name: string; title: string; profileUrl: string; email?: string}>>([]);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/linkedin/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        companyPageUrl: null,
        trackEmployees: false,
        webhookSecret: null,
        webhookUrl: null,
        lastSyncAt: null,
        lastSyncResult: null,
        sourceId: null,
        signalStats: { total: 0, pageViews: 0, postEngagements: 0, employeeActivity: 0, companyFollows: 0 },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleConnect() {
    if (!companyUrl.trim()) {
      toast.error('Please enter a LinkedIn company page URL.');
      return;
    }
    if (!companyUrl.includes('linkedin.com/company/') && !companyUrl.includes('linkedin.com/showcase/')) {
      toast.error('Please enter a valid LinkedIn company or showcase page URL.');
      return;
    }
    setConnecting(true);
    try {
      await api.post('/connectors/linkedin/connect', {
        companyPageUrl: companyUrl.trim(),
        trackEmployees,
      });
      setCompanyUrl('');
      toast.success('LinkedIn connected successfully.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  function addManualEmployee() {
    if (!manualName.trim() || !manualTitle.trim() || !manualProfileUrl.trim()) {
      toast.error('Name, title, and profile URL are required.');
      return;
    }
    setManualEmployees([...manualEmployees, {
      name: manualName.trim(),
      title: manualTitle.trim(),
      profileUrl: manualProfileUrl.trim(),
      email: manualEmail.trim() || undefined,
    }]);
    setManualName('');
    setManualTitle('');
    setManualProfileUrl('');
    setManualEmail('');
  }

  function removeManualEmployee(index: number) {
    setManualEmployees(manualEmployees.filter((_, i) => i !== index));
  }

  function parseCsvEmployees(): Array<{name: string; title: string; profileUrl: string; email?: string}> {
    const lines = csvInput.trim().split('\n').filter(Boolean);
    const employees: Array<{name: string; title: string; profileUrl: string; email?: string}> = [];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length >= 3) {
        employees.push({
          name: parts[0],
          title: parts[1],
          profileUrl: parts[2],
          email: parts[3] || undefined,
        });
      }
    }
    return employees;
  }

  async function handleImport() {
    // Combine CSV and manual entries
    const csvEmployees = csvInput.trim() ? parseCsvEmployees() : [];
    const allEmployees = [...csvEmployees, ...manualEmployees];

    if (allEmployees.length === 0) {
      toast.error('Add at least one employee to import (via CSV or manual entry).');
      return;
    }

    setImporting(true);
    try {
      const { data } = await api.post('/connectors/linkedin/import', {
        employees: allEmployees,
      });
      toast.success(data.message || `Imported ${allEmployees.length} employees.`);
      setCsvInput('');
      setManualEmployees([]);
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect LinkedIn? Signal data will remain, but syncing and webhook ingestion will stop.')) {
      return;
    }
    setDisconnecting(true);
    try {
      await api.delete('/connectors/linkedin/disconnect');
      toast.success('LinkedIn disconnected.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  function copyToClipboard(text: string, type: 'webhook' | 'secret') {
    navigator.clipboard.writeText(text);
    if (type === 'webhook') {
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
    } else {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
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
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <LinkedInIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect LinkedIn
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Track LinkedIn company page activity, post engagement, and employee signals.
                Import contacts from your company page and receive webhook events for real-time tracking.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company Page URL
                  </label>
                  <input
                    type="text"
                    value={companyUrl}
                    onChange={(e) => setCompanyUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/company/your-company"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Your LinkedIn company or showcase page URL.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackEmployees}
                    onChange={(e) => setTrackEmployees(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Track employee activity signals
                  </span>
                </label>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-4 py-2 bg-[#0A66C2] text-white text-sm font-medium rounded-lg hover:bg-[#004182] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect LinkedIn'}
                </button>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className="mt-6 border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">How it works</h4>
            <ol className="list-decimal list-inside text-xs text-gray-500 space-y-1">
              <li>Enter your LinkedIn company page URL to connect</li>
              <li>Manually import employees or contacts who interact with your page</li>
              <li>Use the webhook URL to receive real-time events from LinkedIn integrations (Zapier, Make, etc.)</li>
              <li>DevSignal creates signals for page views, post engagement, follows, and employee activity</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // Connected state
  const sr = status.lastSyncResult;
  const stats = status.signalStats;
  const fullWebhookUrl = `${window.location.origin}${status.webhookUrl}`;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <LinkedInIcon />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">LinkedIn Connected</h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Tracking: <span className="font-medium text-gray-700">{status.companyPageUrl}</span>
            </p>
            {status.trackEmployees && (
              <p className="text-xs text-blue-600 mt-0.5">Employee tracking enabled</p>
            )}
          </div>
        </div>

        {/* Signal Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total Signals</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.pageViews}</p>
            <p className="text-xs text-gray-500">Page Views</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-indigo-600">{stats.postEngagements}</p>
            <p className="text-xs text-gray-500">Post Engagements</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-purple-600">{stats.employeeActivity}</p>
            <p className="text-xs text-gray-500">Employee Activity</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-green-600">{stats.companyFollows}</p>
            <p className="text-xs text-gray-500">Company Follows</p>
          </div>
        </div>

        {/* Last sync info */}
        {sr && (
          <>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
              <p className="text-xs font-medium text-blue-700 mb-1">Last Sync Results</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-blue-600">
                <span>Imported: {sr.employeesImported}</span>
                <span>Signals: {sr.signalsCreated}</span>
                <span>Resolved: {sr.contactsResolved}</span>
              </div>
            </div>
            {sr.errors && sr.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-xs font-medium text-red-700 mb-1">Sync Errors</p>
                <ul className="text-xs text-red-600 space-y-0.5">
                  {sr.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-gray-400 mb-4">
          Last synced: {formatDateTime(status.lastSyncAt)}
        </p>

        {/* Webhook URL section */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Webhook Endpoint</h4>
          <p className="text-xs text-gray-500 mb-2">
            Use this URL to send LinkedIn events from Zapier, Make, or custom integrations.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-700 truncate">
                {fullWebhookUrl}
              </code>
              <button
                onClick={() => copyToClipboard(fullWebhookUrl, 'webhook')}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                {webhookCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {status.webhookSecret && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 flex-shrink-0">Secret:</span>
                <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-700 truncate">
                  {status.webhookSecret}
                </code>
                <button
                  onClick={() => copyToClipboard(status.webhookSecret!, 'secret')}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors flex-shrink-0"
                >
                  {secretCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400">
              Sign payloads with HMAC-SHA256 using the secret. Send the signature in the <code className="bg-gray-100 px-1 rounded">X-LinkedIn-Signature</code> header.
            </p>
          </div>
        </div>

        {/* Webhook payload example */}
        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <summary className="text-sm font-medium text-gray-700 cursor-pointer">
            Webhook Payload Format
          </summary>
          <pre className="mt-2 text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
{`{
  "type": "linkedin_page_view | linkedin_post_engagement | linkedin_employee_activity | linkedin_company_follow",
  "actor": {
    "name": "Jane Smith",
    "email": "jane@company.com",
    "profileUrl": "https://linkedin.com/in/janesmith",
    "title": "VP Engineering",
    "company": "Acme Corp"
  },
  "metadata": { "postUrl": "...", "engagementType": "like" },
  "timestamp": "2026-02-15T12:00:00Z"
}`}
          </pre>
        </details>

        {/* Manual Import section */}
        <div className="border-t pt-4 mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Import Employees / Contacts</h4>

          {/* CSV paste area */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Paste CSV (name, title, profileUrl, email)
            </label>
            <textarea
              value={csvInput}
              onChange={(e) => setCsvInput(e.target.value)}
              placeholder={`Jane Smith, VP Engineering, https://linkedin.com/in/janesmith, jane@company.com\nJohn Doe, CTO, https://linkedin.com/in/johndoe`}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">One person per line. Email column is optional.</p>
          </div>

          {/* Manual add form */}
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Or add one-by-one:</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Full name"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Title"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={manualProfileUrl}
                onChange={(e) => setManualProfileUrl(e.target.value)}
                placeholder="LinkedIn URL"
                className="px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-1">
                <input
                  type="email"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={addManualEmployee}
                  className="px-2 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Queued manual employees */}
          {manualEmployees.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1">
                Queued for import ({manualEmployees.length}):
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {manualEmployees.map((emp, i) => (
                  <div key={i} className="flex items-center justify-between bg-blue-50 rounded px-2 py-1 text-xs">
                    <span className="text-gray-700">
                      {emp.name} - {emp.title} ({emp.profileUrl.substring(0, 40)}...)
                    </span>
                    <button
                      onClick={() => removeManualEmployee(i)}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={importing || (csvInput.trim() === '' && manualEmployees.length === 0)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importing ? 'Importing...' : 'Import Employees'}
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="px-4 py-2 text-red-600 text-sm font-medium hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ml-auto"
          >
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>

        {/* Info box */}
        <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 mt-4">
          <p className="text-xs text-gray-500">
            LinkedIn signals are captured via manual import and webhook ingestion.
            Signal types tracked: page views, post engagement (likes, comments, shares),
            employee activity, and company follows. Use Zapier or Make to connect
            LinkedIn&apos;s API to the webhook endpoint for automated signal capture.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reddit icon (inline SVG)
// ---------------------------------------------------------------------------

function RedditIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#FF4500" />
      <path
        d="M16.5 13.38c0-1.4-2.01-2.54-4.5-2.54s-4.5 1.14-4.5 2.54c0 .83.68 1.58 1.77 2.1.1.05.2.1.31.14A6.73 6.73 0 0 0 12 16.17c.85 0 1.65-.13 2.37-.35.11-.04.21-.09.31-.14 1.09-.52 1.77-1.27 1.77-2.1h.05z"
        fill="#FFF"
      />
      <circle cx="9.5" cy="13" r=".9" fill="#FF4500" />
      <circle cx="14.5" cy="13" r=".9" fill="#FF4500" />
      <path
        d="M10.5 15.5c.4.4 1 .6 1.5.6s1.1-.2 1.5-.6"
        stroke="#FF4500"
        strokeWidth=".6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="17.5" cy="8" r="1.2" fill="#FFF" />
      <path
        d="M18.5 10.5c.83 0 1.5-.45 1.5-1s-.67-1-1.5-1c-.38 0-.72.12-1 .32"
        fill="#FFF"
      />
      <path
        d="M5.5 10.5c-.83 0-1.5-.45-1.5-1s.67-1 1.5-1c.38 0 .72.12 1 .32"
        fill="#FFF"
      />
      <path d="M14.5 5l1.5-2" stroke="#FFF" strokeWidth=".8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tab: Reddit
// ---------------------------------------------------------------------------

const SUGGESTED_SUBREDDITS = [
  'programming',
  'webdev',
  'devops',
  'node',
  'reactjs',
  'golang',
  'rust',
  'python',
  'typescript',
  'javascript',
  'docker',
  'kubernetes',
  'aws',
  'selfhosted',
];

function RedditTab() {
  const toast = useToast();
  const [status, setStatus] = useState<RedditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [keywordsInput, setKeywordsInput] = useState('');
  const [subredditsInput, setSubredditsInput] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/reddit/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        keywords: [],
        subreddits: [],
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
    const keywords = keywordsInput
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (keywords.length === 0) {
      toast.error('Please enter at least one keyword (product name) to track.');
      return;
    }

    const subreddits = subredditsInput
      .split(',')
      .map((s) => s.trim().replace(/^r\//, ''))
      .filter(Boolean);

    setConnecting(true);
    try {
      await api.post('/connectors/reddit/connect', {
        keywords,
        subreddits,
      });
      setKeywordsInput('');
      setSubredditsInput('');
      toast.success(`Reddit tracking configured for: ${keywords.join(', ')}`);
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/reddit/sync');
      toast.success('Reddit sync queued.');
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
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
    if (!window.confirm('Disconnect Reddit? Signal data will remain, but syncing will stop.')) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/reddit/disconnect');
      toast.success('Reddit disconnected.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  function addSuggestedSubreddit(sub: string) {
    const current = subredditsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!current.includes(sub)) {
      setSubredditsInput([...current, sub].join(', '));
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
            <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <RedditIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Reddit
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Track developer discussions mentioning your product across Reddit. Monitor
                subreddits, identify questions, and discover community sentiment.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Keywords to Monitor
                  </label>
                  <input
                    type="text"
                    value={keywordsInput}
                    onChange={(e) => setKeywordsInput(e.target.value)}
                    placeholder="e.g. Resend, React Email, resend.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated product names or keywords to search across all of Reddit.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subreddits to Monitor (optional)
                  </label>
                  <input
                    type="text"
                    value={subredditsInput}
                    onChange={(e) => setSubredditsInput(e.target.value)}
                    placeholder="e.g. programming, webdev, devops, node"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Comma-separated subreddit names (without r/ prefix). Posts in these subreddits
                    matching your keywords will be tracked.
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SUGGESTED_SUBREDDITS.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => addSuggestedSubreddit(sub)}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-700 transition-colors cursor-pointer"
                      >
                        r/{sub}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || !keywordsInput.trim()}
                  className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Start Tracking'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">How it works</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Enter your product name(s) as keywords to search across Reddit</li>
            <li>Optionally add specific subreddits to monitor for keyword mentions</li>
            <li>DevSignal syncs matching posts every 2 hours using the Reddit public JSON API</li>
            <li>Each post creates a signal classified as question, showcase, or discussion</li>
            <li>Identity resolution links Reddit usernames to your existing contacts</li>
            <li>No Reddit account or API key required -- uses public data only</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  const lastSync = status.lastSyncResult;

  return (
    <div className="space-y-6">
      {/* Connected header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <RedditIcon />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Reddit Connected
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <div className="mb-2">
              <p className="text-xs font-medium text-gray-500 mb-1">Keywords</p>
              <div className="flex flex-wrap gap-1.5">
                {status.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
            {status.subreddits.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Subreddits</p>
                <div className="flex flex-wrap gap-1.5">
                  {status.subreddits.map((sub) => (
                    <span
                      key={sub}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                    >
                      r/{sub}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-gray-500">
              Public API (no auth required)
              {status.lastSyncAt && (
                <>
                  {' '}&middot; Last synced {new Date(status.lastSyncAt).toLocaleString()}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Sync stats */}
      {lastSync && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.postsProcessed}</p>
            <p className="text-xs text-gray-500">Posts Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.commentsProcessed}</p>
            <p className="text-xs text-gray-500">Comments Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.signalsCreated}</p>
            <p className="text-xs text-gray-500">Signals Created</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{lastSync.contactsResolved}</p>
            <p className="text-xs text-gray-500">Contacts Resolved</p>
          </div>
        </div>
      )}

      {lastSync?.errors && lastSync.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Sync Errors</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {lastSync.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Update config */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Update Configuration</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Keywords</label>
            <input
              type="text"
              value={keywordsInput || status.keywords.join(', ')}
              onChange={(e) => setKeywordsInput(e.target.value)}
              placeholder="e.g. Resend, React Email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Subreddits</label>
            <input
              type="text"
              value={subredditsInput || status.subreddits.join(', ')}
              onChange={(e) => setSubredditsInput(e.target.value)}
              placeholder="e.g. programming, webdev"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTED_SUBREDDITS.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => addSuggestedSubreddit(sub)}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-700 transition-colors cursor-pointer"
                >
                  r/{sub}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {connecting ? 'Saving...' : 'Update'}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
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
          className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intercom icon (inline SVG)
// ---------------------------------------------------------------------------

function IntercomIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#286EFA" />
      <path
        d="M17 14.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V9.5c0-.28.22-.5.5-.5s.5.22.5.5v5zM15 16c0 .28-.22.5-.5.5s-.5-.22-.5-.5V8c0-.28.22-.5.5-.5s.5.22.5.5v8zM13 16.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-9c0-.28.22-.5.5-.5s.5.22.5.5v9zM11 16.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-9c0-.28.22-.5.5-.5s.5.22.5.5v9zM9 16c0 .28-.22.5-.5.5S8 16.28 8 16V8c0-.28.22-.5.5-.5s.5.22.5.5v8zM7 14.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5V9.5c0-.28.22-.5.5-.5s.5.22.5.5v5z"
        fill="#FFF"
      />
      <path
        d="M17.5 18c0 0-1.5 1.5-5.5 1.5S6.5 18 6.5 18"
        stroke="#FFF"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Zendesk icon (inline SVG)
// ---------------------------------------------------------------------------

function ZendeskIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="4" fill="#03363D" />
      <path d="M12 7L6 15h6V7z" fill="#FFF" />
      <circle cx="15" cy="9" r="3" fill="#FFF" />
      <path d="M12 17l6-8h-6v8z" fill="#FFF" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Intercom tracked event options
// ---------------------------------------------------------------------------

const INTERCOM_EVENTS = [
  { id: 'conversation.opened', label: 'Conversation Opened' },
  { id: 'conversation.replied', label: 'Conversation Replied' },
  { id: 'conversation.closed', label: 'Conversation Closed' },
  { id: 'conversation.rated', label: 'Conversation Rated' },
] as const;

// ---------------------------------------------------------------------------
// Zendesk tracked event options
// ---------------------------------------------------------------------------

const ZENDESK_EVENTS = [
  { id: 'ticket.created', label: 'Ticket Created' },
  { id: 'ticket.updated', label: 'Ticket Updated' },
  { id: 'ticket.solved', label: 'Ticket Solved' },
  { id: 'ticket.satisfaction_rated', label: 'Satisfaction Rated' },
] as const;

// ---------------------------------------------------------------------------
// Tab: Intercom
// ---------------------------------------------------------------------------

function IntercomTab() {
  const toast = useToast();
  const [status, setStatus] = useState<IntercomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [accessTokenInput, setAccessTokenInput] = useState('');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    INTERCOM_EVENTS.map((e) => e.id)
  );
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/intercom/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        webhookUrl: null,
        webhookSecret: null,
        trackedEvents: [],
        lastSyncAt: null,
        lastSyncResult: null,
        sourceId: null,
        signalStats: {
          total: 0,
          conversationOpened: 0,
          conversationReplied: 0,
          conversationClosed: 0,
          conversationRated: 0,
        },
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

  function toggleEvent(eventId: string) {
    setSelectedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId]
    );
  }

  async function handleConnect() {
    if (selectedEvents.length === 0) {
      toast.error('Please select at least one event type to track.');
      return;
    }

    setConnecting(true);
    try {
      const { data } = await api.post('/connectors/intercom/connect', {
        accessToken: accessTokenInput.trim() || undefined,
        webhookSecret: webhookSecretInput.trim() || undefined,
        trackedEvents: selectedEvents,
      });
      setAccessTokenInput('');
      setWebhookSecretInput('');
      toast.success('Intercom connected successfully.');
      if (data.webhookUrl) {
        setStatus((prev) =>
          prev ? { ...prev, webhookUrl: data.webhookUrl, connected: true } : prev
        );
      }
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/intercom/sync');
      toast.success('Intercom sync queued.');
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
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
    if (
      !window.confirm(
        'Disconnect Intercom? Signal data will remain, but syncing will stop.'
      )
    ) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/intercom/disconnect');
      toast.success('Intercom disconnected.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  function copyWebhookUrl() {
    if (status?.webhookUrl) {
      navigator.clipboard.writeText(status.webhookUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
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
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <IntercomIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Intercom
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Import support conversations from Intercom as signals. Track when
                customers open, reply to, close, or rate conversations to identify
                support-driven churn risk and expansion opportunities.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Token (optional)
                  </label>
                  <input
                    type="password"
                    value={accessTokenInput}
                    onChange={(e) => setAccessTokenInput(e.target.value)}
                    placeholder="Optional — for API polling"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Provide an Intercom access token to enable API polling. Leave
                    blank if you only want webhook-based ingestion.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret (optional)
                  </label>
                  <input
                    type="password"
                    value={webhookSecretInput}
                    onChange={(e) => setWebhookSecretInput(e.target.value)}
                    placeholder="Optional HMAC secret for webhook verification"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tracked Events
                  </label>
                  <div className="space-y-2">
                    {INTERCOM_EVENTS.map((evt) => (
                      <label
                        key={evt.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(evt.id)}
                          onChange={() => toggleEvent(evt.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{evt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting || selectedEvents.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect Intercom'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">How it works</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Connect with an optional access token for API-based polling</li>
            <li>Choose which conversation events to track</li>
            <li>Copy the webhook URL and paste it in Intercom Developer Hub &gt; Webhooks</li>
            <li>Conversation events create signals with customer and conversation metadata</li>
            <li>Identity resolution links Intercom users to your existing contacts via email</li>
            <li>Use signals to detect churn risk, upsell moments, and support trends</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  const lastSync = status.lastSyncResult;
  const stats = status.signalStats;

  return (
    <div className="space-y-6">
      {/* Connected header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <IntercomIcon />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Intercom Connected
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {status.trackedEvents.map((evt) => (
                <span
                  key={evt}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {evt}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-500">
              {status.lastSyncAt && (
                <>Last synced {new Date(status.lastSyncAt).toLocaleString()}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      {status.webhookUrl && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">
            Webhook URL (paste into Intercom)
          </h4>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white border border-blue-200 rounded-lg text-xs font-mono text-gray-800 truncate">
              {status.webhookUrl}
            </code>
            <button
              onClick={copyWebhookUrl}
              className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Paste this URL in Intercom Developer Hub &gt; Webhooks to receive
            conversation events in real-time.
          </p>
        </div>
      )}

      {/* Signal stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total Signals</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.conversationOpened}</p>
          <p className="text-xs text-gray-500">Opened</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.conversationReplied}</p>
          <p className="text-xs text-gray-500">Replied</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.conversationClosed}</p>
          <p className="text-xs text-gray-500">Closed</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.conversationRated}</p>
          <p className="text-xs text-gray-500">Rated</p>
        </div>
      </div>

      {/* Last sync results */}
      {lastSync && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {lastSync.conversationsProcessed}
            </p>
            <p className="text-xs text-gray-500">Conversations Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {lastSync.signalsCreated}
            </p>
            <p className="text-xs text-gray-500">Signals Created</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {lastSync.contactsResolved}
            </p>
            <p className="text-xs text-gray-500">Contacts Resolved</p>
          </div>
        </div>
      )}

      {lastSync?.errors && lastSync.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Sync Errors</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {lastSync.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
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
          className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-blue-700">
          Intercom conversations are synced via webhooks in real-time. If you provided
          an access token, you can also trigger a manual sync to backfill historical data.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Zendesk
// ---------------------------------------------------------------------------

function ZendeskTab() {
  const toast = useToast();
  const [status, setStatus] = useState<ZendeskStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [subdomainInput, setSubdomainInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [apiTokenInput, setApiTokenInput] = useState('');
  const [webhookSecretInput, setWebhookSecretInput] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    ZENDESK_EVENTS.map((e) => e.id)
  );
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/connectors/zendesk/status');
      setStatus(data);
    } catch {
      setStatus({
        connected: false,
        subdomain: null,
        webhookUrl: null,
        webhookSecret: null,
        trackedEvents: [],
        lastSyncAt: null,
        lastSyncResult: null,
        sourceId: null,
        signalStats: {
          total: 0,
          ticketCreated: 0,
          ticketUpdated: 0,
          ticketSolved: 0,
          satisfactionRated: 0,
        },
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

  function toggleEvent(eventId: string) {
    setSelectedEvents((prev) =>
      prev.includes(eventId)
        ? prev.filter((e) => e !== eventId)
        : [...prev, eventId]
    );
  }

  async function handleConnect() {
    if (!subdomainInput.trim()) {
      toast.error('Please enter your Zendesk subdomain.');
      return;
    }
    if (!emailInput.trim()) {
      toast.error('Please enter your Zendesk admin email.');
      return;
    }
    if (!apiTokenInput.trim()) {
      toast.error('Please enter your Zendesk API token.');
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error('Please select at least one event type to track.');
      return;
    }

    setConnecting(true);
    try {
      const { data } = await api.post('/connectors/zendesk/connect', {
        subdomain: subdomainInput.trim(),
        email: emailInput.trim(),
        apiToken: apiTokenInput.trim(),
        webhookSecret: webhookSecretInput.trim() || undefined,
        trackedEvents: selectedEvents,
      });
      setApiTokenInput('');
      setWebhookSecretInput('');
      toast.success('Zendesk connected successfully.');
      if (data.webhookUrl) {
        setStatus((prev) =>
          prev
            ? { ...prev, webhookUrl: data.webhookUrl, connected: true }
            : prev
        );
      }
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.post('/connectors/zendesk/sync');
      toast.success('Zendesk sync queued.');
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          await fetchStatus();
        }, 5000);
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
    if (
      !window.confirm(
        'Disconnect Zendesk? Signal data will remain, but syncing will stop.'
      )
    ) {
      return;
    }

    setDisconnecting(true);
    try {
      await api.delete('/connectors/zendesk/disconnect');
      toast.success('Zendesk disconnected.');
      await fetchStatus();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDisconnecting(false);
    }
  }

  function copyWebhookUrl() {
    if (status?.webhookUrl) {
      navigator.clipboard.writeText(status.webhookUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
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
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <ZendeskIcon />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Zendesk
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Import support tickets from Zendesk as signals. Track ticket creation,
                updates, resolution, and customer satisfaction ratings to identify
                accounts that need attention.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zendesk Subdomain
                  </label>
                  <div className="flex items-center gap-0">
                    <input
                      type="text"
                      value={subdomainInput}
                      onChange={(e) => setSubdomainInput(e.target.value)}
                      placeholder="yourcompany"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <span className="px-3 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-sm text-gray-500">
                      .zendesk.com
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="admin@yourcompany.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    The email address of a Zendesk admin or agent with API access.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API Token
                  </label>
                  <input
                    type="password"
                    value={apiTokenInput}
                    onChange={(e) => setApiTokenInput(e.target.value)}
                    placeholder="Your Zendesk API token"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Generate one at{' '}
                    <a
                      href="https://support.zendesk.com/hc/en-us/articles/4408889192858"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-700"
                    >
                      Zendesk Admin &gt; Apps and Integrations &gt; API
                    </a>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Webhook Secret (optional)
                  </label>
                  <input
                    type="password"
                    value={webhookSecretInput}
                    onChange={(e) => setWebhookSecretInput(e.target.value)}
                    placeholder="Optional HMAC secret for webhook verification"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tracked Events
                  </label>
                  <div className="space-y-2">
                    {ZENDESK_EVENTS.map((evt) => (
                      <label
                        key={evt.id}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(evt.id)}
                          onChange={() => toggleEvent(evt.id)}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700">{evt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={
                    connecting ||
                    !subdomainInput.trim() ||
                    !emailInput.trim() ||
                    !apiTokenInput.trim() ||
                    selectedEvents.length === 0
                  }
                  className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect Zendesk'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">How it works</h4>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
            <li>Enter your Zendesk subdomain, admin email, and API token</li>
            <li>Choose which ticket events to track</li>
            <li>DevSignal polls Zendesk for ticket updates and creates signals</li>
            <li>Optionally, copy the webhook URL into Zendesk triggers for real-time events</li>
            <li>Identity resolution links ticket requesters to your existing contacts</li>
            <li>Use ticket signals to detect churn risk, support burden, and expansion opportunities</li>
          </ol>
        </div>
      </div>
    );
  }

  // Connected state
  const lastSync = status.lastSyncResult;
  const stats = status.signalStats;

  return (
    <div className="space-y-6">
      {/* Connected header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ZendeskIcon />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">
                Zendesk Connected
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-2">
              Subdomain:{' '}
              <span className="font-mono text-gray-700">
                {status.subdomain}.zendesk.com
              </span>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {status.trackedEvents.map((evt) => (
                <span
                  key={evt}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"
                >
                  {evt}
                </span>
              ))}
            </div>
            <p className="text-sm text-gray-500">
              {status.lastSyncAt && (
                <>Last synced {new Date(status.lastSyncAt).toLocaleString()}</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Webhook URL */}
      {status.webhookUrl && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <h4 className="text-sm font-medium text-emerald-800 mb-2">
            Webhook URL (paste into Zendesk triggers)
          </h4>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs font-mono text-gray-800 truncate">
              {status.webhookUrl}
            </code>
            <button
              onClick={copyWebhookUrl}
              className="px-3 py-2 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-emerald-700 mt-2">
            Paste this URL in Zendesk Admin &gt; Business Rules &gt; Triggers to
            receive ticket events in real-time.
          </p>
        </div>
      )}

      {/* Signal stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Total Signals</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.ticketCreated}</p>
          <p className="text-xs text-gray-500">Created</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.ticketUpdated}</p>
          <p className="text-xs text-gray-500">Updated</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.ticketSolved}</p>
          <p className="text-xs text-gray-500">Solved</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">
            {stats.satisfactionRated}
          </p>
          <p className="text-xs text-gray-500">Rated</p>
        </div>
      </div>

      {/* Last sync results */}
      {lastSync && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {lastSync.ticketsProcessed}
            </p>
            <p className="text-xs text-gray-500">Tickets Processed</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {lastSync.signalsCreated}
            </p>
            <p className="text-xs text-gray-500">Signals Created</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {lastSync.contactsResolved}
            </p>
            <p className="text-xs text-gray-500">Contacts Resolved</p>
          </div>
        </div>
      )}

      {lastSync?.errors && lastSync.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Sync Errors</h4>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {lastSync.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
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
          className="px-4 py-2 bg-white text-red-600 text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs text-emerald-700">
          Zendesk tickets are synced automatically every hour via the API. For real-time
          ingestion, configure the webhook URL above in a Zendesk trigger.
        </p>
      </div>
    </div>
  );
}
