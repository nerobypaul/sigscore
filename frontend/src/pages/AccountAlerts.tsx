import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertRuleCreator {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AlertRule {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  triggerType: string;
  conditions: Record<string, unknown>;
  channels: {
    inApp: boolean;
    email: boolean;
    slack: boolean;
    slackChannel: string;
  };
  enabled: boolean;
  createdBy: AlertRuleCreator;
  createdAt: string;
  updatedAt: string;
}

interface AlertHistoryItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIGGER_TYPES = [
  { value: 'score_drop', label: 'Score Drop', description: 'Score drops by a percentage within a time window', color: 'bg-red-100 text-red-800' },
  { value: 'score_rise', label: 'Score Rise', description: 'Score rises by a percentage within a time window', color: 'bg-green-100 text-green-800' },
  { value: 'score_threshold', label: 'Score Threshold', description: 'Score crosses above or below a value', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'engagement_drop', label: 'Engagement Drop', description: 'No signals received for a number of days', color: 'bg-amber-100 text-amber-800' },
  { value: 'new_hot_signal', label: 'New Hot Signal', description: 'Signal from specific source types', color: 'bg-purple-100 text-purple-800' },
  { value: 'account_inactive', label: 'Account Inactive', description: 'Account has been inactive for a period', color: 'bg-gray-100 text-gray-800' },
] as const;

const SOURCE_TYPES = [
  'GITHUB', 'NPM', 'PYPI', 'WEBSITE', 'DOCS', 'PRODUCT_API',
  'SEGMENT', 'DISCORD', 'TWITTER', 'STACKOVERFLOW', 'REDDIT', 'POSTHOG',
];

type TriggerType = typeof TRIGGER_TYPES[number]['value'];

function getTriggerMeta(type: string) {
  return TRIGGER_TYPES.find((t) => t.value === type) ?? TRIGGER_TYPES[0];
}

// ---------------------------------------------------------------------------
// Default conditions per trigger type
// ---------------------------------------------------------------------------

function defaultConditions(triggerType: TriggerType): Record<string, unknown> {
  switch (triggerType) {
    case 'score_drop':
      return { dropPercent: 20, withinDays: 7 };
    case 'score_rise':
      return { risePercent: 20, withinDays: 7 };
    case 'score_threshold':
      return { threshold: 70, direction: 'below' };
    case 'engagement_drop':
      return { inactiveDays: 14 };
    case 'new_hot_signal':
      return { sourceTypes: ['GITHUB'] };
    case 'account_inactive':
      return { inactiveDays: 30 };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Human-readable condition summary
// ---------------------------------------------------------------------------

function conditionSummary(triggerType: string, conditions: Record<string, unknown>): string {
  switch (triggerType) {
    case 'score_drop':
      return `Drop by ${conditions.dropPercent ?? 20}% within ${conditions.withinDays ?? 7} days`;
    case 'score_rise':
      return `Rise by ${conditions.risePercent ?? 20}% within ${conditions.withinDays ?? 7} days`;
    case 'score_threshold':
      return `Score crosses ${conditions.direction ?? 'below'} ${conditions.threshold ?? 70}`;
    case 'engagement_drop':
      return `No signals for ${conditions.inactiveDays ?? 14} days`;
    case 'new_hot_signal': {
      const types = (conditions.sourceTypes as string[]) ?? [];
      return types.length > 0 ? `From: ${types.join(', ')}` : 'Any source';
    }
    case 'account_inactive':
      return `Inactive for ${conditions.inactiveDays ?? 30} days`;
    default:
      return 'Custom conditions';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AccountAlerts() {
  const toast = useToast();
  const [tab, setTab] = useState<'rules' | 'history'>('rules');

  // Rules state
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTriggerType, setFormTriggerType] = useState<TriggerType>('score_drop');
  const [formConditions, setFormConditions] = useState<Record<string, unknown>>(defaultConditions('score_drop'));
  const [formChannels, setFormChannels] = useState({ inApp: true, email: false, slack: false, slackChannel: '' });
  const [formEnabled, setFormEnabled] = useState(true);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ---- Data fetching ----

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/account-alerts');
      setRules(data.rules);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load alert rules';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const { data } = await api.get('/account-alerts/history?limit=100');
      setHistory(data.history);
    } catch {
      // silently fail for history
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    if (tab === 'history') {
      fetchHistory();
    }
  }, [tab, fetchHistory]);

  // ---- Modal helpers ----

  const openCreate = () => {
    setEditingRule(null);
    setFormName('');
    setFormDescription('');
    setFormTriggerType('score_drop');
    setFormConditions(defaultConditions('score_drop'));
    setFormChannels({ inApp: true, email: false, slack: false, slackChannel: '' });
    setFormEnabled(true);
    setShowModal(true);
  };

  const openEdit = (rule: AlertRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormDescription(rule.description ?? '');
    setFormTriggerType(rule.triggerType as TriggerType);
    setFormConditions(rule.conditions);
    setFormChannels(rule.channels);
    setFormEnabled(rule.enabled);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRule(null);
  };

  // ---- CRUD ----

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: formName,
        description: formDescription || undefined,
        triggerType: formTriggerType,
        conditions: formConditions,
        channels: formChannels,
        enabled: formEnabled,
      };

      if (editingRule) {
        await api.put(`/account-alerts/${editingRule.id}`, payload);
        toast.success('Alert rule updated');
      } else {
        await api.post('/account-alerts', payload);
        toast.success('Alert rule created');
      }

      closeModal();
      fetchRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save alert rule';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/account-alerts/${id}`);
      toast.success('Alert rule deleted');
      setDeleteId(null);
      fetchRules();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete alert rule';
      toast.error(msg);
    }
  };

  const handleToggle = async (rule: AlertRule) => {
    try {
      await api.put(`/account-alerts/${rule.id}`, { enabled: !rule.enabled });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
      );
      toast.success(rule.enabled ? 'Alert rule disabled' : 'Alert rule enabled');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle alert rule';
      toast.error(msg);
    }
  };

  const handleTest = async (rule: AlertRule) => {
    try {
      await api.post(`/account-alerts/${rule.id}/test`);
      toast.success('Test alert sent — check your notifications');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send test alert';
      toast.error(msg);
    }
  };

  // ---- Trigger type change ----

  const handleTriggerTypeChange = (type: TriggerType) => {
    setFormTriggerType(type);
    setFormConditions(defaultConditions(type));
  };

  // ---- Condition update helper ----

  const updateCondition = (key: string, value: unknown) => {
    setFormConditions((prev) => ({ ...prev, [key]: value }));
  };

  // ---- Render ----

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Set up rules to get notified when important account events happen
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Alert Rule
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setTab('rules')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'rules'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Alert Rules ({rules.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'history'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Alert History
          </button>
        </nav>
      </div>

      {/* Rules Tab */}
      {tab === 'rules' && (
        <>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading alert rules...</div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">{error}</div>
          ) : rules.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onEdit={() => openEdit(rule)}
                  onDelete={() => setDeleteId(rule.id)}
                  onToggle={() => handleToggle(rule)}
                  onTest={() => handleTest(rule)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <>
          {historyLoading ? (
            <div className="text-center py-12 text-gray-500">Loading alert history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-3 text-sm text-gray-500">No alert history yet</p>
              <p className="text-xs text-gray-400 mt-1">Alerts will appear here once your rules trigger</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alert</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {history.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.title}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.body ?? '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.read ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {item.read ? 'Read' : 'Unread'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal onClose={closeModal}>
          <form onSubmit={handleSave}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}
              </h2>
            </div>

            <div className="px-6 py-4 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g. Hot account score drop"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Brief description of what this alert does"
                />
              </div>

              {/* Trigger Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Trigger Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {TRIGGER_TYPES.map((tt) => (
                    <button
                      key={tt.value}
                      type="button"
                      onClick={() => handleTriggerTypeChange(tt.value)}
                      className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        formTriggerType === tt.value
                          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="font-medium text-gray-900">{tt.label}</span>
                      <p className="text-xs text-gray-500 mt-0.5">{tt.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Conditions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Conditions</label>
                <ConditionsForm
                  triggerType={formTriggerType}
                  conditions={formConditions}
                  onChange={updateCondition}
                />
              </div>

              {/* Channels */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Notification Channels</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={formChannels.inApp}
                      onChange={(e) => setFormChannels((c) => ({ ...c, inApp: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <InAppIcon />
                    <span className="text-gray-700">In-app notification</span>
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={formChannels.email}
                      onChange={(e) => setFormChannels((c) => ({ ...c, email: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <EmailIcon />
                    <span className="text-gray-700">Email</span>
                  </label>
                  <div>
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={formChannels.slack}
                        onChange={(e) => setFormChannels((c) => ({ ...c, slack: e.target.checked }))}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <SlackIcon />
                      <span className="text-gray-700">Slack</span>
                    </label>
                    {formChannels.slack && (
                      <input
                        type="text"
                        value={formChannels.slackChannel}
                        onChange={(e) => setFormChannels((c) => ({ ...c, slackChannel: e.target.value }))}
                        className="mt-2 ml-8 w-64 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="#channel-name"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-medium text-gray-700">Enabled</span>
                <button
                  type="button"
                  onClick={() => setFormEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !formName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <Modal onClose={() => setDeleteId(null)}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Alert Rule</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this alert rule? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-16">
      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">No alert rules</h3>
      <p className="mt-1 text-sm text-gray-500">
        Create your first alert rule to get notified when important account events happen.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Create Alert Rule
      </button>
    </div>
  );
}

function RuleCard({
  rule,
  onEdit,
  onDelete,
  onToggle,
  onTest,
}: {
  rule: AlertRule;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onTest: () => void;
}) {
  const meta = getTriggerMeta(rule.triggerType);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 transition-opacity ${!rule.enabled ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{rule.name}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
              {meta.label}
            </span>
          </div>
          {rule.description && (
            <p className="text-sm text-gray-500 mb-2">{rule.description}</p>
          )}
          <p className="text-xs text-gray-400">
            {conditionSummary(rule.triggerType, rule.conditions)}
          </p>

          {/* Channel icons */}
          <div className="flex items-center gap-3 mt-3">
            {rule.channels.inApp && (
              <span className="flex items-center gap-1 text-xs text-gray-500" title="In-app notification">
                <InAppIcon /> In-app
              </span>
            )}
            {rule.channels.email && (
              <span className="flex items-center gap-1 text-xs text-gray-500" title="Email">
                <EmailIcon /> Email
              </span>
            )}
            {rule.channels.slack && (
              <span className="flex items-center gap-1 text-xs text-gray-500" title="Slack">
                <SlackIcon /> Slack
                {rule.channels.slackChannel && (
                  <span className="text-gray-400">({rule.channels.slackChannel})</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onTest}
            className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            title="Test this rule"
          >
            Test
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
          {/* Toggle */}
          <button
            onClick={onToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              rule.enabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
            title={rule.enabled ? 'Disable' : 'Enable'}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                rule.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conditions form (dynamic based on trigger type)
// ---------------------------------------------------------------------------

function ConditionsForm({
  triggerType,
  conditions,
  onChange,
}: {
  triggerType: TriggerType;
  conditions: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (triggerType) {
    case 'score_drop':
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">Drop by</span>
          <input
            type="number"
            min={1}
            max={100}
            value={(conditions.dropPercent as number) ?? 20}
            onChange={(e) => onChange('dropPercent', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">% within</span>
          <input
            type="number"
            min={1}
            max={365}
            value={(conditions.withinDays as number) ?? 7}
            onChange={(e) => onChange('withinDays', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">days</span>
        </div>
      );

    case 'score_rise':
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">Rise by</span>
          <input
            type="number"
            min={1}
            max={100}
            value={(conditions.risePercent as number) ?? 20}
            onChange={(e) => onChange('risePercent', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">% within</span>
          <input
            type="number"
            min={1}
            max={365}
            value={(conditions.withinDays as number) ?? 7}
            onChange={(e) => onChange('withinDays', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">days</span>
        </div>
      );

    case 'score_threshold':
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">Score crosses</span>
          <select
            value={(conditions.direction as string) ?? 'below'}
            onChange={(e) => onChange('direction', e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <input
            type="number"
            min={0}
            max={100}
            value={(conditions.threshold as number) ?? 70}
            onChange={(e) => onChange('threshold', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      );

    case 'engagement_drop':
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">No signals for</span>
          <input
            type="number"
            min={1}
            max={365}
            value={(conditions.inactiveDays as number) ?? 14}
            onChange={(e) => onChange('inactiveDays', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">days</span>
        </div>
      );

    case 'new_hot_signal': {
      const selected = (conditions.sourceTypes as string[]) ?? [];
      const toggleSource = (source: string) => {
        if (selected.includes(source)) {
          onChange('sourceTypes', selected.filter((s) => s !== source));
        } else {
          onChange('sourceTypes', [...selected, source]);
        }
      };
      return (
        <div>
          <p className="text-sm text-gray-600 mb-2">Signal from source types:</p>
          <div className="flex flex-wrap gap-2">
            {SOURCE_TYPES.map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selected.includes(source)
                    ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {source}
              </button>
            ))}
          </div>
        </div>
      );
    }

    case 'account_inactive':
      return (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600">Account inactive for</span>
          <input
            type="number"
            min={1}
            max={365}
            value={(conditions.inactiveDays as number) ?? 30}
            onChange={(e) => onChange('inactiveDays', Number(e.target.value))}
            className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-center focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-600">days</span>
        </div>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Modal wrapper
// ---------------------------------------------------------------------------

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel icons
// ---------------------------------------------------------------------------

function InAppIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" />
    </svg>
  );
}
