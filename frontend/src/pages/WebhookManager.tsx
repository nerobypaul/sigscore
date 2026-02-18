import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import WebhookTestPanel from '../components/WebhookTestPanel';

interface WebhookSubscription {
  id: string;
  targetUrl: string;
  event: string;
  hookId: string | null;
  secret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const EVENT_TYPES = [
  { value: 'signal.created', label: 'Signal Created', description: 'When a new signal is ingested' },
  { value: 'contact.created', label: 'Contact Created', description: 'When a new contact is added' },
  { value: 'contact.updated', label: 'Contact Updated', description: 'When contact fields change' },
  { value: 'company.created', label: 'Company Created', description: 'When a new company is discovered' },
  { value: 'deal.created', label: 'Deal Created', description: 'When a new deal is created' },
  { value: 'deal.stage_changed', label: 'Deal Stage Changed', description: 'When a deal moves pipeline stages' },
  { value: 'score.changed', label: 'Score Changed', description: 'When a PQA score changes' },
  { value: 'tier.changed', label: 'Tier Changed', description: 'When an account tier changes (HOT/WARM/COLD)' },
];

const EVENT_COLORS: Record<string, string> = {
  'signal.created': 'bg-blue-100 text-blue-800',
  'contact.created': 'bg-green-100 text-green-800',
  'contact.updated': 'bg-teal-100 text-teal-800',
  'company.created': 'bg-purple-100 text-purple-800',
  'deal.created': 'bg-orange-100 text-orange-800',
  'deal.stage_changed': 'bg-amber-100 text-amber-800',
  'score.changed': 'bg-indigo-100 text-indigo-800',
  'tier.changed': 'bg-rose-100 text-rose-800',
};

export default function WebhookManager() {
  useEffect(() => { document.title = 'Webhooks — DevSignal'; }, []);

  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formEvent, setFormEvent] = useState(EVENT_TYPES[0].value);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Newly created secret (shown once)
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Filter state
  const [eventFilter, setEventFilter] = useState<string>('all');

  // Expanded row for test panel
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/webhooks/subscribe');
      setSubscriptions(data.subscriptions);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load subscriptions';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    try {
      const { data } = await api.post('/webhooks/subscribe', {
        targetUrl: formUrl,
        event: formEvent,
      });
      setSubscriptions((prev) => [data, ...prev]);
      setNewSecret({ id: data.id, secret: data.secret });
      setFormUrl('');
      setShowForm(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; details?: { message: string }[] } } };
      const msg =
        axiosErr.response?.data?.details?.[0]?.message ||
        axiosErr.response?.data?.error ||
        'Failed to create subscription';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this webhook subscription? Zapier/Make will stop receiving events.')) return;
    try {
      await api.delete(`/webhooks/subscribe/${id}`);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      if (newSecret?.id === id) setNewSecret(null);
    } catch {
      // Ignore delete errors silently
    }
  };

  const handleToggle = async (id: string, active: boolean) => {
    try {
      const { data } = await api.patch(`/webhooks/subscribe/${id}`, { active: !active });
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? data : s)));
    } catch {
      // Ignore toggle errors silently
    }
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const filteredSubscriptions =
    eventFilter === 'all'
      ? subscriptions
      : subscriptions.filter((s) => s.event === eventFilter);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Subscribe external services like Zapier and Make to DevSignal events
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setCreateError(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Subscription
        </button>
      </div>

      {/* Secret reveal banner */}
      {newSecret && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Signing secret (shown once) -- save this for webhook signature verification:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded text-xs font-mono text-amber-900 break-all">
                  {newSecret.secret}
                </code>
                <button
                  onClick={() => handleCopySecret(newSecret.secret)}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-50 transition-colors"
                >
                  {copiedSecret ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewSecret(null)}
              className="text-amber-400 hover:text-amber-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Webhook Subscription</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target URL</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
                <select
                  value={formEvent}
                  onChange={(e) => setFormEvent(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {EVENT_TYPES.map((et) => (
                    <option key={et.value} value={et.value}>
                      {et.label} -- {et.description}
                    </option>
                  ))}
                </select>
              </div>

              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !formUrl}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event filter */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-gray-500">Filter:</span>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          <option value="all">All events ({subscriptions.length})</option>
          {EVENT_TYPES.map((et) => {
            const count = subscriptions.filter((s) => s.event === et.value).length;
            return (
              <option key={et.value} value={et.value}>
                {et.label} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="text-center py-12 text-gray-500">Loading subscriptions...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500">{error}</div>
      )}
      {!loading && !error && filteredSubscriptions.length === 0 && (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5" />
          </svg>
          <p className="text-gray-500 text-sm">
            {eventFilter === 'all'
              ? 'No webhook subscriptions yet. Connect Zapier or Make to start automating.'
              : 'No subscriptions for this event type.'}
          </p>
        </div>
      )}

      {/* Subscription table */}
      {!loading && !error && filteredSubscriptions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSubscriptions.map((sub) => (
                <tr key={sub.id} className="group">
                  <td colSpan={5} className="p-0">
                    {/* Subscription row */}
                    <div className="flex items-center hover:bg-gray-50 transition-colors">
                      <div className="flex-1 grid grid-cols-[1fr_auto_auto_auto_auto] items-center">
                        <button
                          onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                          className="flex items-center gap-2 px-4 py-3 text-left"
                        >
                          <svg
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${expandedId === sub.id ? 'rotate-90' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="text-sm text-gray-900 font-mono truncate max-w-xs" title={sub.targetUrl}>
                            {sub.targetUrl.length > 50
                              ? sub.targetUrl.slice(0, 50) + '...'
                              : sub.targetUrl}
                          </span>
                        </button>
                        <div className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              EVENT_COLORS[sub.event] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {sub.event}
                          </span>
                        </div>
                        <div className="px-4 py-3 text-sm text-gray-500">
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </div>
                        <div className="px-4 py-3">
                          <button
                            onClick={() => handleToggle(sub.id, sub.active)}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                              sub.active ? 'bg-indigo-600' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                sub.active ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                        <div className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                              className="px-2.5 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50 transition-colors"
                            >
                              {expandedId === sub.id ? 'Close' : 'Test'}
                            </button>
                            <button
                              onClick={() => handleDelete(sub.id)}
                              className="px-2.5 py-1 text-xs font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expandable test panel */}
                    {expandedId === sub.id && (
                      <WebhookTestPanel
                        subscription={sub}
                        onClose={() => setExpandedId(null)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Zapier Setup Guide */}
      <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Zapier / Make Setup</h2>
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Zapier (REST Hook)</h3>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>In Zapier, create a new Zap with "Webhooks by Zapier" as the trigger</li>
              <li>Choose "Catch Hook" as the event</li>
              <li>Copy the webhook URL Zapier provides</li>
              <li>Come back here and create a subscription with that URL and your desired event</li>
              <li>Click "Test" to send a sample payload to Zapier</li>
              <li>In Zapier, click "Test trigger" to confirm the payload was received</li>
              <li>Continue building your Zap with the data from DevSignal</li>
            </ol>
          </div>
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Make (Integromat)</h3>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>In Make, create a new scenario with "Webhooks" as the trigger module</li>
              <li>Choose "Custom webhook"</li>
              <li>Copy the webhook URL Make provides</li>
              <li>Create a subscription here with that URL</li>
              <li>Click "Test" to send sample data</li>
              <li>Make will auto-detect the data structure</li>
            </ol>
          </div>
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Programmatic (API)</h3>
            <p>
              Use the DevSignal API with your API key to manage subscriptions programmatically:
            </p>
            <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto">
{`# Subscribe
curl -X POST https://api.devsignal.com/api/v1/webhooks/subscribe \\
  -H "x-api-key: ds_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"targetUrl": "https://your-endpoint.com/hook", "event": "signal.created"}'

# Unsubscribe
curl -X DELETE https://api.devsignal.com/api/v1/webhooks/subscribe/SUB_ID \\
  -H "x-api-key: ds_live_YOUR_KEY"`}
            </pre>
          </div>
          <div>
            <h3 className="font-medium text-gray-800 mb-1">Verifying Signatures</h3>
            <p>
              Each delivery includes an <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">X-DevSignal-Signature</code> header
              with an HMAC-SHA256 signature. Verify it using your subscription's secret:
            </p>
            <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg text-xs overflow-x-auto">
{`const crypto = require('crypto');
const signature = req.headers['x-devsignal-signature'];
const expected = 'sha256=' + crypto
  .createHmac('sha256', YOUR_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
const valid = crypto.timingSafeEqual(
  Buffer.from(signature), Buffer.from(expected)
);`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
