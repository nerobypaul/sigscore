import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

interface Step {
  id: string;
  order: number;
  subject: string;
  body: string;
  delayDays: number;
  delayHours: number;
}

interface Enrollment {
  id: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  status: 'active' | 'paused' | 'completed' | 'unenrolled' | 'bounced';
  currentStep: number;
  enrolledAt: string;
}

interface SequenceStats {
  totalSent: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  activeEnrollments: number;
  completed: number;
}

interface Sequence {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused' | 'archived';
  triggerType: string;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}

type TabKey = 'steps' | 'enrollments' | 'stats';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-600',
  paused: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  unenrolled: 'bg-gray-100 text-gray-500',
  bounced: 'bg-red-100 text-red-600',
};

const TEMPLATE_VARS = [
  '{{firstName}}', '{{lastName}}', '{{email}}',
  '{{company}}', '{{title}}', '{{signalCount}}', '{{pqaScore}}',
];

export default function EmailSequenceDetail() {
  useEffect(() => { document.title = 'Email Sequence — Sigscore'; }, []);
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('steps');

  // Steps state
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepForm, setStepForm] = useState({ subject: '', body: '', delayDays: 0, delayHours: 0 });
  const [showAddStep, setShowAddStep] = useState(false);
  const [savingStep, setSavingStep] = useState(false);

  // Enrollments state
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [enrollPage, setEnrollPage] = useState(1);
  const [enrollTotal, setEnrollTotal] = useState(0);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollInput, setEnrollInput] = useState('');
  const [showEnrollForm, setShowEnrollForm] = useState(false);

  // Stats
  const [stats, setStats] = useState<SequenceStats | null>(null);

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const fetchSequence = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/sequences/${id}`);
      setSequence(data.sequence || data);
    } catch {
      toast.error('Failed to load sequence.');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { fetchSequence(); }, [fetchSequence]);

  const fetchEnrollments = useCallback(async () => {
    if (!id) return;
    setEnrollLoading(true);
    try {
      const { data } = await api.get(`/sequences/${id}/enrollments`, { params: { page: enrollPage, limit: 20 } });
      setEnrollments(data.enrollments || []);
      setEnrollTotal(data.pagination?.totalPages ?? 1);
    } catch {
      setEnrollments([]);
    } finally {
      setEnrollLoading(false);
    }
  }, [id, enrollPage]);

  const fetchStats = useCallback(async () => {
    if (!id) return;
    try {
      const { data } = await api.get(`/sequences/${id}/stats`);
      setStats(data.stats || data);
    } catch {
      setStats(null);
    }
  }, [id]);

  useEffect(() => {
    if (tab === 'enrollments') fetchEnrollments();
    if (tab === 'stats') fetchStats();
  }, [tab, fetchEnrollments, fetchStats]);

  // --- Actions ---

  const updateStatus = async (status: string) => {
    if (!id) return;
    try {
      await api.put(`/sequences/${id}`, { status });
      setSequence((prev) => prev ? { ...prev, status: status as Sequence['status'] } : prev);
      toast.success(`Sequence ${status}.`);
    } catch {
      toast.error('Failed to update status.');
    }
  };

  const saveName = async () => {
    if (!id || !nameValue.trim()) return;
    try {
      await api.put(`/sequences/${id}`, { name: nameValue.trim() });
      setSequence((prev) => prev ? { ...prev, name: nameValue.trim() } : prev);
      setEditingName(false);
      toast.success('Name updated.');
    } catch {
      toast.error('Failed to update name.');
    }
  };

  // --- Step CRUD ---

  const addStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !stepForm.subject.trim()) return;
    setSavingStep(true);
    try {
      await api.post(`/sequences/${id}/steps`, {
        subject: stepForm.subject,
        body: stepForm.body,
        delayDays: stepForm.delayDays,
        delayHours: stepForm.delayHours,
      });
      setShowAddStep(false);
      setStepForm({ subject: '', body: '', delayDays: 0, delayHours: 0 });
      fetchSequence();
      toast.success('Step added.');
    } catch {
      toast.error('Failed to add step.');
    } finally {
      setSavingStep(false);
    }
  };

  const updateStep = async (stepId: string) => {
    if (!id) return;
    setSavingStep(true);
    try {
      await api.put(`/sequences/${id}/steps/${stepId}`, {
        subject: stepForm.subject,
        body: stepForm.body,
        delayDays: stepForm.delayDays,
        delayHours: stepForm.delayHours,
      });
      setEditingStepId(null);
      fetchSequence();
      toast.success('Step updated.');
    } catch {
      toast.error('Failed to update step.');
    } finally {
      setSavingStep(false);
    }
  };

  const deleteStep = async (stepId: string) => {
    if (!id || !confirm('Delete this step?')) return;
    try {
      await api.delete(`/sequences/${id}/steps/${stepId}`);
      fetchSequence();
      toast.success('Step deleted.');
    } catch {
      toast.error('Failed to delete step.');
    }
  };

  const startEditStep = (step: Step) => {
    setEditingStepId(step.id);
    setStepForm({ subject: step.subject, body: step.body, delayDays: step.delayDays, delayHours: step.delayHours });
  };

  const insertVar = (v: string) => {
    setStepForm((prev) => ({ ...prev, body: prev.body + v }));
  };

  // --- Enrollment actions ---

  const enrollContacts = async () => {
    if (!id || !enrollInput.trim()) return;
    const contactIds = enrollInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (contactIds.length === 0) return;
    try {
      await api.post(`/sequences/${id}/enroll`, { contactIds });
      toast.success(`Enrolled ${contactIds.length} contact(s).`);
      setEnrollInput('');
      setShowEnrollForm(false);
      fetchEnrollments();
    } catch {
      toast.error('Failed to enroll contacts.');
    }
  };

  const pauseEnrollment = async (enrollmentId: string) => {
    if (!id) return;
    try {
      await api.put(`/sequences/${id}/enrollments/${enrollmentId}/pause`);
      fetchEnrollments();
    } catch {
      toast.error('Failed to pause enrollment.');
    }
  };

  const resumeEnrollment = async (enrollmentId: string) => {
    if (!id) return;
    try {
      await api.put(`/sequences/${id}/enrollments/${enrollmentId}/resume`);
      fetchEnrollments();
    } catch {
      toast.error('Failed to resume enrollment.');
    }
  };

  const unenroll = async (enrollmentId: string) => {
    if (!id) return;
    try {
      await api.delete(`/sequences/${id}/enrollments/${enrollmentId}`);
      fetchEnrollments();
      toast.success('Contact unenrolled.');
    } catch {
      toast.error('Failed to unenroll.');
    }
  };

  // --- Render ---

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;
  }

  if (!sequence) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <p className="text-gray-500">Sequence not found.</p>
        <Link to="/sequences" className="text-indigo-600 text-sm mt-2 inline-block">Back to sequences</Link>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'steps', label: 'Steps' },
    { key: 'enrollments', label: 'Enrollments' },
    { key: 'stats', label: 'Stats' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Back link */}
      <Link to="/sequences" className="text-sm text-indigo-600 hover:text-indigo-500 mb-4 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Sequences
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 mt-2">
        <div className="flex items-center gap-3 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-2xl font-bold text-gray-900 border-b-2 border-indigo-500 outline-none bg-transparent"
              />
              <button onClick={saveName} className="text-sm text-indigo-600 hover:text-indigo-700">Save</button>
            </div>
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
              onClick={() => { setEditingName(true); setNameValue(sequence.name); }}
              title="Click to edit"
            >
              {sequence.name}
            </h1>
          )}
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[sequence.status] || 'bg-gray-100 text-gray-600'}`}>
            {sequence.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {sequence.status === 'active' ? (
            <button onClick={() => updateStatus('paused')} className="text-sm font-medium text-yellow-700 border border-yellow-300 px-3 py-1.5 rounded-lg hover:bg-yellow-50">
              Pause
            </button>
          ) : sequence.status !== 'archived' ? (
            <button onClick={() => updateStatus('active')} className="text-sm font-medium text-green-700 border border-green-300 px-3 py-1.5 rounded-lg hover:bg-green-50">
              Activate
            </button>
          ) : null}
          {sequence.status !== 'archived' && (
            <button onClick={() => updateStatus('archived')} className="text-sm font-medium text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-50">
              Archive
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Steps tab */}
      {tab === 'steps' && (
        <div>
          {sequence.steps.length === 0 && !showAddStep && (
            <p className="text-sm text-gray-500 mb-4">No steps yet. Add your first step to build the sequence.</p>
          )}

          {/* Timeline */}
          <div className="space-y-0">
            {sequence.steps
              .sort((a, b) => a.order - b.order)
              .map((step, idx) => (
                <div key={step.id}>
                  {/* Delay indicator between steps */}
                  {idx > 0 && (
                    <div className="flex items-center gap-2 py-2 pl-5">
                      <div className="w-px h-4 bg-gray-300" />
                      <span className="text-xs text-gray-400">
                        Wait {step.delayDays > 0 ? `${step.delayDays}d` : ''}{step.delayHours > 0 ? ` ${step.delayHours}h` : ''}{step.delayDays === 0 && step.delayHours === 0 ? 'immediate' : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-4">
                    {/* Step number circle */}
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {idx + 1}
                      </div>
                      {idx < sequence.steps.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                    </div>

                    {/* Step content */}
                    <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 mb-3 group">
                      {editingStepId === step.id ? (
                        <StepForm
                          form={stepForm}
                          setForm={setStepForm}
                          onSave={() => updateStep(step.id)}
                          onCancel={() => setEditingStepId(null)}
                          saving={savingStep}
                          onInsertVar={insertVar}
                        />
                      ) : (
                        <>
                          <div className="flex items-start justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{step.subject}</p>
                              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{step.body.slice(0, 100)}{step.body.length > 100 ? '...' : ''}</p>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-3">
                              <button onClick={() => startEditStep(step)} className="text-xs text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50">Edit</button>
                              <button onClick={() => deleteStep(step.id)} className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Delete</button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>

          {/* Add step */}
          {showAddStep ? (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mt-3 ml-12">
              <StepForm
                form={stepForm}
                setForm={setStepForm}
                onSave={addStep}
                onCancel={() => { setShowAddStep(false); setStepForm({ subject: '', body: '', delayDays: 0, delayHours: 0 }); }}
                saving={savingStep}
                onInsertVar={insertVar}
                isNew
              />
            </div>
          ) : (
            <button
              onClick={() => { setShowAddStep(true); setStepForm({ subject: '', body: '', delayDays: 0, delayHours: 0 }); }}
              className="mt-3 ml-12 inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Step
            </button>
          )}
        </div>
      )}

      {/* Enrollments tab */}
      {tab === 'enrollments' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Enrolled Contacts</h3>
            <button
              onClick={() => setShowEnrollForm(!showEnrollForm)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Enroll Contacts
            </button>
          </div>

          {showEnrollForm && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact IDs (comma-separated)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={enrollInput}
                  onChange={(e) => setEnrollInput(e.target.value)}
                  placeholder="id1, id2, id3"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <button onClick={enrollContacts} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                  Enroll
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {enrollLoading ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : enrollments.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No contacts enrolled.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Contact</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600">Step</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Enrolled</th>
                        <th className="text-right py-3 px-4 font-semibold text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {enrollments.map((en) => (
                        <tr key={en.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-900">{en.contactName}</td>
                          <td className="py-3 px-4 text-gray-600">{en.contactEmail}</td>
                          <td className="py-3 px-4">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[en.status] || 'bg-gray-100 text-gray-600'}`}>
                              {en.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-gray-600">{en.currentStep}</td>
                          <td className="py-3 px-4 text-gray-500 text-xs">{new Date(en.enrolledAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-2">
                              {en.status === 'active' ? (
                                <button onClick={() => pauseEnrollment(en.id)} className="text-xs text-yellow-600 hover:text-yellow-700">Pause</button>
                              ) : en.status === 'paused' ? (
                                <button onClick={() => resumeEnrollment(en.id)} className="text-xs text-green-600 hover:text-green-700">Resume</button>
                              ) : null}
                              {(en.status === 'active' || en.status === 'paused') && (
                                <button onClick={() => unenroll(en.id)} className="text-xs text-red-600 hover:text-red-700">Unenroll</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {enrollTotal > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <p className="text-sm text-gray-600">Page {enrollPage} of {enrollTotal}</p>
                    <div className="flex gap-2">
                      <button onClick={() => setEnrollPage((p) => Math.max(1, p - 1))} disabled={enrollPage <= 1} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50">Previous</button>
                      <button onClick={() => setEnrollPage((p) => p + 1)} disabled={enrollPage >= enrollTotal} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Stats tab */}
      {tab === 'stats' && (
        <div>
          {!stats ? (
            <p className="text-sm text-gray-400 py-8 text-center">No stats available yet.</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {([
                { label: 'Total Sent', value: stats.totalSent.toLocaleString(), color: 'bg-blue-500' },
                { label: 'Open Rate', value: `${(stats.openRate * 100).toFixed(1)}%`, color: 'bg-green-500' },
                { label: 'Click Rate', value: `${(stats.clickRate * 100).toFixed(1)}%`, color: 'bg-indigo-500' },
                { label: 'Bounce Rate', value: `${(stats.bounceRate * 100).toFixed(1)}%`, color: 'bg-red-500' },
                { label: 'Active Enrollments', value: stats.activeEnrollments.toLocaleString(), color: 'bg-purple-500' },
                { label: 'Completed', value: stats.completed.toLocaleString(), color: 'bg-emerald-500' },
              ] as const).map((card) => (
                <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}>
                      <span className="text-white text-lg font-bold">#</span>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{card.label}</p>
                      <p className="text-xl font-bold text-gray-900">{card.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Step form component ---

function StepForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  onInsertVar,
  isNew,
}: {
  form: { subject: string; body: string; delayDays: number; delayHours: number };
  setForm: React.Dispatch<React.SetStateAction<{ subject: string; body: string; delayDays: number; delayHours: number }>>;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  onInsertVar: (v: string) => void;
  isNew?: boolean;
}) {
  return (
    <form onSubmit={onSave} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
        <input
          type="text"
          required
          value={form.subject}
          onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
          placeholder="e.g. Quick question about {{company}}"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
        <textarea
          value={form.body}
          onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
          rows={5}
          placeholder="Write your email content..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
        />
        <div className="flex flex-wrap gap-1 mt-1">
          {TEMPLATE_VARS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onInsertVar(v)}
              className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded hover:bg-gray-200 transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Delay Days</label>
          <input
            type="number"
            min={0}
            value={form.delayDays}
            onChange={(e) => setForm((p) => ({ ...p, delayDays: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Delay Hours</label>
          <input
            type="number"
            min={0}
            max={23}
            value={form.delayHours}
            onChange={(e) => setForm((p) => ({ ...p, delayHours: parseInt(e.target.value) || 0 }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving...' : isNew ? 'Add Step' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}
