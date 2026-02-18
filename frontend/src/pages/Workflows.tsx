import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Workflow {
  id: string;
  name: string;
  description?: string | null;
  trigger: { event: string; filters?: Record<string, unknown> };
  conditions?: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; params: Record<string, unknown> }>;
  enabled: boolean;
  runCount: number;
  lastTriggeredAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowRun {
  id: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  triggerData: Record<string, unknown>;
  results?: Record<string, unknown>;
  error?: string | null;
  duration?: number | null;
  createdAt: string;
}

type ActionType = 'create_deal' | 'update_deal_stage' | 'send_webhook' | 'send_slack' | 'add_tag' | 'log';

interface ActionEntry {
  type: ActionType;
  params: Record<string, string>;
}

interface WorkflowForm {
  name: string;
  description: string;
  triggerEvent: string;
  triggerFilters: Array<{ key: string; value: string }>;
  actions: ActionEntry[];
  enabled: boolean;
}

const TRIGGER_EVENTS = [
  { value: 'signal_received', label: 'Signal Received', description: 'When a new signal is ingested from any source', icon: 'signal' },
  { value: 'contact_created', label: 'Contact Created', description: 'When a new contact is added to the system', icon: 'user-plus' },
  { value: 'contact_updated', label: 'Contact Updated', description: 'When a contact profile is modified', icon: 'user-edit' },
  { value: 'company_created', label: 'Company Created', description: 'When a new company is added', icon: 'building' },
  { value: 'deal_created', label: 'Deal Created', description: 'When a new deal is opened', icon: 'deal' },
  { value: 'deal_stage_changed', label: 'Deal Stage Changed', description: 'When a deal moves to a different stage', icon: 'stage' },
  { value: 'score_changed', label: 'Score Changed', description: 'When a contact or company score is recalculated', icon: 'score' },
  { value: 'score_threshold', label: 'Score Threshold Crossed', description: 'When a score crosses a defined threshold', icon: 'threshold' },
  { value: 'tag_added', label: 'Tag Added', description: 'When a tag is applied to any entity', icon: 'tag' },
];

const ACTION_TYPES: { value: ActionType; label: string; description: string; color: string }[] = [
  { value: 'create_deal', label: 'Create Deal', description: 'Open a new deal in the pipeline', color: 'bg-green-100 text-green-700' },
  { value: 'update_deal_stage', label: 'Update Deal Stage', description: 'Move a deal to a different stage', color: 'bg-blue-100 text-blue-700' },
  { value: 'send_webhook', label: 'Send Webhook', description: 'POST data to an external URL', color: 'bg-orange-100 text-orange-700' },
  { value: 'send_slack', label: 'Send Slack Message', description: 'Notify a Slack channel', color: 'bg-purple-100 text-purple-700' },
  { value: 'add_tag', label: 'Add Tag', description: 'Tag the triggering entity', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'log', label: 'Log Event', description: 'Record an event in the activity log', color: 'bg-gray-100 text-gray-600' },
];

const ACTION_PARAM_HINTS: Record<ActionType, { key: string; label: string; placeholder: string }[]> = {
  create_deal: [
    { key: 'title', label: 'Deal title', placeholder: 'e.g. Enterprise upgrade' },
    { key: 'stage', label: 'Initial stage', placeholder: 'e.g. qualification' },
    { key: 'amount', label: 'Amount ($)', placeholder: 'e.g. 5000' },
  ],
  update_deal_stage: [
    { key: 'dealId', label: 'Deal ID', placeholder: 'Leave empty to use trigger context' },
    { key: 'stage', label: 'New stage', placeholder: 'e.g. negotiation' },
  ],
  send_webhook: [
    { key: 'url', label: 'Webhook URL', placeholder: 'https://hooks.example.com/...' },
    { key: 'method', label: 'HTTP method', placeholder: 'POST' },
  ],
  send_slack: [
    { key: 'channel', label: 'Channel', placeholder: '#sales-alerts' },
    { key: 'message', label: 'Message template', placeholder: 'New hot lead: {{contact.name}}' },
  ],
  add_tag: [
    { key: 'tagName', label: 'Tag name', placeholder: 'e.g. hot-lead' },
  ],
  log: [
    { key: 'message', label: 'Log message', placeholder: 'e.g. Workflow triggered for {{contact.email}}' },
    { key: 'level', label: 'Level', placeholder: 'info' },
  ],
};

const RUN_STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Workflows() {
  useEffect(() => { document.title = 'Workflows — DevSignal'; }, []);

  const toast = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, WorkflowRun[]>>({});
  const [runsLoading, setRunsLoading] = useState<string | null>(null);

  const [form, setForm] = useState<WorkflowForm>(emptyForm());

  const fetchWorkflows = useCallback(async () => {
    try {
      const { data } = await api.get('/workflows');
      setWorkflows(data.workflows || data || []);
    } catch {
      // Endpoint may not exist yet; show empty state
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // ---- CRUD ----

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(w: Workflow) {
    setForm({
      name: w.name,
      description: w.description || '',
      triggerEvent: w.trigger.event,
      triggerFilters: w.trigger.filters
        ? Object.entries(w.trigger.filters).map(([key, value]) => ({ key, value: String(value) }))
        : [],
      actions: w.actions.map((a) => ({
        type: a.type as ActionType,
        params: Object.fromEntries(
          Object.entries(a.params).map(([k, v]) => [k, String(v)])
        ),
      })),
      enabled: w.enabled,
    });
    setEditingId(w.id);
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('Workflow name is required.');
      return;
    }
    if (form.actions.length === 0) {
      toast.error('At least one action is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        trigger: {
          event: form.triggerEvent,
          filters: form.triggerFilters.length > 0
            ? Object.fromEntries(form.triggerFilters.filter((f) => f.key).map((f) => [f.key, f.value]))
            : undefined,
        },
        actions: form.actions.map((a) => ({
          type: a.type,
          params: Object.fromEntries(Object.entries(a.params).filter(([, v]) => v)),
        })),
        enabled: form.enabled,
      };

      if (editingId) {
        await api.put(`/workflows/${editingId}`, payload);
        toast.success('Workflow updated.');
      } else {
        await api.post('/workflows', payload);
        toast.success('Workflow created.');
      }

      setShowModal(false);
      fetchWorkflows();
    } catch {
      toast.error('Failed to save workflow.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(w: Workflow) {
    try {
      await api.put(`/workflows/${w.id}`, { enabled: !w.enabled });
      setWorkflows((prev) =>
        prev.map((wf) => (wf.id === w.id ? { ...wf, enabled: !wf.enabled } : wf))
      );
      toast.success(`Workflow ${!w.enabled ? 'enabled' : 'disabled'}.`);
    } catch {
      toast.error('Failed to update workflow.');
    }
  }

  async function deleteWorkflow(id: string) {
    if (!confirm('Delete this workflow? This cannot be undone.')) return;
    try {
      await api.delete(`/workflows/${id}`);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      toast.success('Workflow deleted.');
    } catch {
      toast.error('Failed to delete workflow.');
    }
  }

  async function fetchRuns(workflowId: string) {
    if (expandedId === workflowId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(workflowId);
    if (runs[workflowId]) return;

    setRunsLoading(workflowId);
    try {
      const { data } = await api.get(`/workflows/${workflowId}/runs`, { params: { limit: 10 } });
      setRuns((prev) => ({ ...prev, [workflowId]: data.runs || data || [] }));
    } catch {
      setRuns((prev) => ({ ...prev, [workflowId]: [] }));
    } finally {
      setRunsLoading(null);
    }
  }

  // ---- Form helpers ----

  function addAction() {
    setForm((prev) => ({
      ...prev,
      actions: [...prev.actions, { type: 'log', params: {} }],
    }));
  }

  function removeAction(index: number) {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }));
  }

  function updateAction(index: number, field: 'type' | string, value: string) {
    setForm((prev) => {
      const actions = [...prev.actions];
      if (field === 'type') {
        actions[index] = { type: value as ActionType, params: {} };
      } else {
        actions[index] = {
          ...actions[index],
          params: { ...actions[index].params, [field]: value },
        };
      }
      return { ...prev, actions };
    });
  }

  function addFilter() {
    setForm((prev) => ({
      ...prev,
      triggerFilters: [...prev.triggerFilters, { key: '', value: '' }],
    }));
  }

  function removeFilter(index: number) {
    setForm((prev) => ({
      ...prev,
      triggerFilters: prev.triggerFilters.filter((_, i) => i !== index),
    }));
  }

  function updateFilter(index: number, field: 'key' | 'value', value: string) {
    setForm((prev) => {
      const filters = [...prev.triggerFilters];
      filters[index] = { ...filters[index], [field]: value };
      return { ...prev, triggerFilters: filters };
    });
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
          <p className="mt-1 text-sm text-gray-500">
            Automate actions based on signals, contacts, and deal events.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Workflow
        </button>
      </div>

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <EmptyState
          icon={<ZapIcon className="w-6 h-6" />}
          title="No workflows yet"
          description="Create your first workflow to automate actions based on CRM events."
          actionLabel="Create Workflow"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-4">
          {workflows.map((w) => (
            <div key={w.id} className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <ZapIcon className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{w.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        Trigger: {w.trigger.event.replace(/_/g, ' ')} | {w.runCount} runs
                        {w.lastTriggeredAt && (
                          <> | Last: {new Date(w.lastTriggeredAt).toLocaleDateString()}</>
                        )}
                      </p>
                      {w.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{w.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        w.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {w.enabled ? 'Active' : 'Disabled'}
                    </span>
                    <button
                      onClick={() => toggleEnabled(w)}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                      title={w.enabled ? 'Disable' : 'Enable'}
                    >
                      {w.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => fetchRuns(w.id)}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Runs
                    </button>
                    <button
                      onClick={() => openEdit(w)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteWorkflow(w.id)}
                      className="text-xs text-red-600 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Visual flow summary: trigger → actions */}
                <div className="mt-3 flex items-center flex-wrap gap-1.5">
                  <span className="inline-flex items-center text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-medium">
                    {w.trigger.event.replace(/_/g, ' ')}
                  </span>
                  {w.actions.length > 0 && (
                    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  )}
                  {w.actions.map((a, i) => {
                    const meta = ACTION_TYPES.find((at) => at.value === a.type);
                    return (
                      <span key={i} className="inline-flex items-center gap-1">
                        {i > 0 && (
                          <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                          </svg>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded ${meta?.color || 'bg-gray-100 text-gray-600'}`}>
                          {a.type.replace(/_/g, ' ')}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Expanded runs */}
              {expandedId === w.id && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                  <h4 className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wider">
                    Recent Runs
                  </h4>
                  {runsLoading === w.id ? (
                    <div className="py-4 flex justify-center">
                      <Spinner size="sm" />
                    </div>
                  ) : !runs[w.id] || runs[w.id].length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">No runs recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {runs[w.id].map((run) => (
                        <div
                          key={run.id}
                          className="flex items-center justify-between bg-white rounded-lg border border-gray-100 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                RUN_STATUS_COLORS[run.status] || 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {run.status}
                            </span>
                            {run.duration != null && (
                              <span className="text-xs text-gray-400">{run.duration}ms</span>
                            )}
                            {run.error && (
                              <span className="text-xs text-red-500 truncate max-w-[200px]" title={run.error}>
                                {run.error}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowModal(false)}
          />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId ? 'Edit Workflow' : 'Create Workflow'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Auto-create deal on hot signal"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="What does this workflow do?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Trigger Event */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">When this happens...</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TRIGGER_EVENTS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, triggerEvent: t.value }))}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        form.triggerEvent === t.value
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`text-sm font-medium ${form.triggerEvent === t.value ? 'text-indigo-700' : 'text-gray-900'}`}>
                        {t.label}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trigger Filters */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">
                    Trigger Filters <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <button
                    type="button"
                    onClick={addFilter}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Add Filter
                  </button>
                </div>
                {form.triggerFilters.length === 0 && (
                  <p className="text-xs text-gray-400">No filters. Workflow triggers on all matching events.</p>
                )}
                <div className="space-y-2">
                  {form.triggerFilters.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={f.key}
                        onChange={(e) => updateFilter(i, 'key', e.target.value)}
                        placeholder="Key (e.g. type)"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                      <input
                        type="text"
                        value={f.value}
                        onChange={(e) => updateFilter(i, 'value', e.target.value)}
                        placeholder="Value"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeFilter(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-200" />

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">...then do this</label>
                  <button
                    type="button"
                    onClick={addAction}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Action
                  </button>
                </div>
                {form.actions.length === 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                    <p className="text-sm text-gray-400">No actions configured.</p>
                    <button
                      type="button"
                      onClick={addAction}
                      className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Add your first action
                    </button>
                  </div>
                )}
                <div className="space-y-3">
                  {form.actions.map((action, i) => {
                    const actionMeta = ACTION_TYPES.find((at) => at.value === action.type);
                    return (
                      <div key={i}>
                        {/* Visual flow connector */}
                        {i > 0 && (
                          <div className="flex justify-center py-1">
                            <svg className="w-4 h-6 text-gray-300" fill="none" viewBox="0 0 16 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" d="M8 0v24M4 18l4 6 4-6" />
                            </svg>
                          </div>
                        )}
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionMeta?.color || 'bg-gray-100 text-gray-600'}`}>
                                Step {i + 1}
                              </span>
                              <select
                                value={action.type}
                                onChange={(e) => updateAction(i, 'type', e.target.value)}
                                className="border-0 bg-transparent text-sm font-medium text-gray-900 focus:ring-0 outline-none cursor-pointer pr-6"
                              >
                                {ACTION_TYPES.map((at) => (
                                  <option key={at.value} value={at.value}>
                                    {at.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAction(i)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove action"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                          <div className="p-4 space-y-3">
                            {actionMeta && (
                              <p className="text-xs text-gray-400">{actionMeta.description}</p>
                            )}
                            {(ACTION_PARAM_HINTS[action.type] || []).map((param) => (
                              <div key={param.key}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{param.label}</label>
                                <input
                                  type="text"
                                  value={action.params[param.key] || ''}
                                  onChange={(e) => updateAction(i, param.key, e.target.value)}
                                  placeholder={param.placeholder}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, enabled: !p.enabled }))}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    form.enabled ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      form.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  {form.enabled ? 'Enabled' : 'Disabled'} -- workflow will{' '}
                  {form.enabled ? '' : 'not '}run when triggered
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving && <Spinner size="sm" />}
                {editingId ? 'Update Workflow' : 'Create Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyForm(): WorkflowForm {
  return {
    name: '',
    description: '',
    triggerEvent: 'signal_received',
    triggerFilters: [],
    actions: [{ type: 'log', params: {} }],
    enabled: true,
  };
}

function ZapIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
