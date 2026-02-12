import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

interface SlackSettings {
  configured: boolean;
  webhookUrl: string | null;
}

export default function Settings() {
  const toast = useToast();
  const [slackSettings, setSlackSettings] = useState<SlackSettings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetchSlackSettings();
  }, []);

  async function fetchSlackSettings() {
    try {
      const { data } = await api.get('/settings/slack');
      setSlackSettings(data);
    } catch {
      // Settings endpoint may not exist yet or org not configured
      setSlackSettings({ configured: false, webhookUrl: null });
    } finally {
      setLoading(false);
    }
  }

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
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to save webhook URL.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await api.post('/settings/slack/test');
      toast.success('Test message sent! Check your Slack channel.');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to send test message.';
      toast.error(message);
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
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-sm text-gray-500 mb-8">
        Configure integrations and notification preferences.
      </p>

      {/* Slack Integration Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <SlackIcon />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Slack Notifications</h2>
              <p className="text-sm text-gray-500">
                Receive alerts when accounts change PQA tier or high-value signals arrive.
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
                  Webhook URL is masked for security. Enter a new URL below to update it.
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
                Click <strong>Add New Webhook to Workspace</strong> and choose a channel.
              </li>
              <li>
                Copy the webhook URL and paste it above.
              </li>
            </ol>
            <p className="text-xs text-gray-400 mt-3">
              You will receive notifications for: PQA tier changes (COLD to WARM to HOT), new HOT
              accounts, and high-value signals (signups, app installs, PR merges, team adoption).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
