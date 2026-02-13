import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import type {
  DealStage,
  Activity,
  ActivityType,
  ActivityStatus,
  ActivityPriority,
  TagRelation,
} from '../types';
import { DEAL_STAGES, STAGE_LABELS, STAGE_COLORS } from '../types';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';

// ---------- Extended Deal type for the detail endpoint ----------

interface DealContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
}

interface DealCompany {
  id: string;
  name: string;
  domain?: string | null;
}

interface DealOwner {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
}

interface DealActivity extends Activity {
  user?: { id: string; firstName: string; lastName: string } | null;
}

interface DealDetail {
  id: string;
  title: string;
  amount?: number | null;
  currency: string;
  stage: DealStage;
  probability?: number | null;
  contactId?: string | null;
  contact?: DealContact | null;
  companyId?: string | null;
  company?: DealCompany | null;
  ownerId?: string | null;
  owner?: DealOwner | null;
  expectedCloseDate?: string | null;
  closedAt?: string | null;
  description?: string | null;
  activities?: DealActivity[];
  tags?: TagRelation[];
  createdAt: string;
  updatedAt: string;
}

// ---------- Helpers ----------

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toInputDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------- Activity icons ----------

function ActivityTypeIcon({ type }: { type: ActivityType }) {
  const cls = 'w-4 h-4';
  switch (type) {
    case 'TASK':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'CALL':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
        </svg>
      );
    case 'MEETING':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
      );
    case 'EMAIL':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
      );
    case 'NOTE':
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    default:
      return null;
  }
}

const STATUS_COLORS: Record<ActivityStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const PRIORITY_COLORS: Record<ActivityPriority, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

// ---------- Inline editable text ----------

function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  type = 'text',
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  inputClassName?: string;
  type?: 'text' | 'number';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) {
      onSave(draft.trim());
    }
  };

  const cancel = () => {
    setEditing(false);
    setDraft(value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        className={`border border-indigo-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${inputClassName || ''}`}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors ${className || ''}`}
      title="Click to edit"
    >
      {value || <span className="text-gray-400 italic">Click to set</span>}
    </span>
  );
}

// ---------- Main component ----------

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Stage dropdown
  const [stageOpen, setStageOpen] = useState(false);
  const stageDropdownRef = useRef<HTMLDivElement>(null);

  // Editable detail fields
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingProbability, setEditingProbability] = useState(false);
  const [probabilityDraft, setProbabilityDraft] = useState('');
  const [editingExpectedClose, setEditingExpectedClose] = useState(false);
  const [expectedCloseDraft, setExpectedCloseDraft] = useState('');

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const probabilityRef = useRef<HTMLInputElement>(null);

  // ---------- Fetch ----------

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/deals/${id}`)
      .then(({ data }) => setDeal(data))
      .catch(() => setError('Deal not found'))
      .finally(() => setLoading(false));
  }, [id]);

  // ---------- Close stage dropdown on outside click ----------

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (stageDropdownRef.current && !stageDropdownRef.current.contains(e.target as Node)) {
        setStageOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---------- Update helper ----------

  const updateDeal = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!deal) return;
      try {
        const { data } = await api.put(`/deals/${deal.id}`, patch);
        setDeal((prev) => (prev ? { ...prev, ...data } : prev));
        toast.success('Deal updated');
      } catch {
        toast.error('Failed to update deal');
      }
    },
    [deal, toast],
  );

  // ---------- Stage change ----------

  const handleStageChange = useCallback(
    async (newStage: DealStage) => {
      if (!deal || newStage === deal.stage) {
        setStageOpen(false);
        return;
      }
      // Optimistic update
      const oldStage = deal.stage;
      setDeal((prev) => (prev ? { ...prev, stage: newStage } : prev));
      setStageOpen(false);
      try {
        const { data } = await api.put(`/deals/${deal.id}`, { stage: newStage });
        setDeal((prev) => (prev ? { ...prev, ...data } : prev));
        toast.success(`Stage changed to ${STAGE_LABELS[newStage]}`);
      } catch {
        setDeal((prev) => (prev ? { ...prev, stage: oldStage } : prev));
        toast.error('Failed to change stage');
      }
    },
    [deal, toast],
  );

  // ---------- Delete ----------

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this deal? This action cannot be undone.')) return;
    try {
      await api.delete(`/deals/${id}`);
      toast.success('Deal deleted successfully');
      navigate('/deals');
    } catch {
      toast.error('Failed to delete deal');
    }
  };

  // ---------- Detail field save handlers ----------

  const saveDescription = () => {
    setEditingDescription(false);
    if (descriptionDraft !== (deal?.description || '')) {
      updateDeal({ description: descriptionDraft || null });
    }
  };

  const saveProbability = () => {
    setEditingProbability(false);
    const val = parseInt(probabilityDraft, 10);
    if (isNaN(val)) return;
    const clamped = Math.max(0, Math.min(100, val));
    if (clamped !== (deal?.probability ?? 0)) {
      updateDeal({ probability: clamped });
    }
  };

  const saveExpectedClose = () => {
    setEditingExpectedClose(false);
    if (expectedCloseDraft !== (deal?.expectedCloseDate ? toInputDate(deal.expectedCloseDate) : '')) {
      updateDeal({ expectedCloseDate: expectedCloseDraft ? new Date(expectedCloseDraft).toISOString() : null });
    }
  };

  // ---------- Loading / error states ----------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error || 'Deal not found'}</p>
          <Link to="/deals" className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500">
            Back to deals
          </Link>
        </div>
      </div>
    );
  }

  const activities = deal.activities || [];
  const tags = deal.tags || [];
  const isClosed = deal.stage === 'CLOSED_WON' || deal.stage === 'CLOSED_LOST';

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/deals" className="hover:text-gray-700">
          Deals
        </Link>
        <span>/</span>
        <span className="text-gray-900 truncate">{deal.title}</span>
      </div>

      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center text-xl font-bold flex-shrink-0">
            $
          </div>
          <div className="min-w-0">
            {/* Editable title */}
            <h1 className="text-2xl font-bold text-gray-900">
              <InlineEdit
                value={deal.title}
                onSave={(val) => updateDeal({ title: val })}
                inputClassName="text-2xl font-bold w-full"
              />
            </h1>

            <div className="flex flex-wrap items-center gap-3 mt-1">
              {/* Stage badge + dropdown */}
              <div className="relative" ref={stageDropdownRef}>
                <button
                  onClick={() => setStageOpen(!stageOpen)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STAGE_COLORS[deal.stage]} cursor-pointer hover:opacity-80 transition-opacity`}
                >
                  {STAGE_LABELS[deal.stage]}
                  <svg className="w-3 h-3 inline-block ml-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {stageOpen && (
                  <div className="absolute z-20 top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg py-1 max-h-72 overflow-y-auto">
                    {DEAL_STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStageChange(s)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors ${
                          s === deal.stage ? 'font-semibold text-indigo-600' : 'text-gray-700'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STAGE_COLORS[s].split(' ')[0]}`} />
                        {STAGE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Editable amount */}
              <span className="text-lg font-semibold text-gray-700">
                <InlineEdit
                  value={deal.amount != null ? String(deal.amount) : ''}
                  onSave={(val) => {
                    const num = parseFloat(val);
                    if (!isNaN(num)) updateDeal({ amount: num });
                  }}
                  type="number"
                  className="text-lg font-semibold text-gray-700"
                  inputClassName="text-lg font-semibold w-32"
                />
                {deal.amount != null && (
                  <span className="text-sm font-normal text-gray-400 ml-1">{deal.currency || 'USD'}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={handleDelete}
          className="text-sm text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
        >
          Delete
        </button>
      </div>

      {/* ===== Two-column layout ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ---------- Left column (2/3) ---------- */}
        <div className="lg:col-span-2 space-y-6">
          {/* Details card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Details</h2>
            <div className="space-y-5">
              {/* Description */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Description</label>
                {editingDescription ? (
                  <textarea
                    ref={descriptionRef}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    onBlur={saveDescription}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setEditingDescription(false);
                        setDescriptionDraft(deal.description || '');
                      }
                    }}
                    rows={4}
                    className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                    autoFocus
                  />
                ) : (
                  <div
                    onClick={() => {
                      setDescriptionDraft(deal.description || '');
                      setEditingDescription(true);
                    }}
                    className="text-sm text-gray-700 whitespace-pre-wrap cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors min-h-[2.5rem]"
                    title="Click to edit"
                  >
                    {deal.description || <span className="text-gray-400 italic">No description. Click to add one.</span>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Probability */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Probability</label>
                  {editingProbability ? (
                    <div className="flex items-center gap-1">
                      <input
                        ref={probabilityRef}
                        type="number"
                        min={0}
                        max={100}
                        value={probabilityDraft}
                        onChange={(e) => setProbabilityDraft(e.target.value)}
                        onBlur={saveProbability}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveProbability();
                          if (e.key === 'Escape') {
                            setEditingProbability(false);
                            setProbabilityDraft(String(deal.probability ?? ''));
                          }
                        }}
                        className="w-20 border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        setProbabilityDraft(String(deal.probability ?? ''));
                        setEditingProbability(true);
                      }}
                      className="text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
                      title="Click to edit"
                    >
                      {deal.probability != null ? `${deal.probability}%` : <span className="text-gray-400 italic">Not set</span>}
                    </div>
                  )}
                </div>

                {/* Expected close date */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Expected Close Date</label>
                  {editingExpectedClose ? (
                    <input
                      type="date"
                      value={expectedCloseDraft}
                      onChange={(e) => setExpectedCloseDraft(e.target.value)}
                      onBlur={saveExpectedClose}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveExpectedClose();
                        if (e.key === 'Escape') {
                          setEditingExpectedClose(false);
                          setExpectedCloseDraft(deal.expectedCloseDate ? toInputDate(deal.expectedCloseDate) : '');
                        }
                      }}
                      className="border border-indigo-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      autoFocus
                    />
                  ) : (
                    <div
                      onClick={() => {
                        setExpectedCloseDraft(deal.expectedCloseDate ? toInputDate(deal.expectedCloseDate) : '');
                        setEditingExpectedClose(true);
                      }}
                      className="text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
                      title="Click to edit"
                    >
                      {deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : <span className="text-gray-400 italic">Not set</span>}
                    </div>
                  )}
                </div>

                {/* Closed date (read-only, shown only if closed) */}
                {isClosed && deal.closedAt && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Closed Date</label>
                    <p className="text-sm text-gray-700">{formatDate(deal.closedAt)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Activities list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Activities</h2>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No activities recorded for this deal</p>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0 mt-0.5 text-gray-500">
                      <ActivityTypeIcon type={activity.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[activity.status]}`}>
                          {activity.status.replace('_', ' ')}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[activity.priority]}`}>
                          {activity.priority}
                        </span>
                        {activity.user && (
                          <span className="text-xs text-gray-500">
                            {activity.user.firstName} {activity.user.lastName}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{formatDate(activity.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags section */}
          {tags.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {tags.map((tr) => (
                  <span
                    key={tr.tag.id}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border"
                    style={{
                      backgroundColor: tr.tag.color ? `${tr.tag.color}20` : undefined,
                      borderColor: tr.tag.color || '#d1d5db',
                      color: tr.tag.color || '#374151',
                    }}
                  >
                    {tr.tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------- Right column (1/3) ---------- */}
        <div className="space-y-6">
          {/* Contact card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Contact</h2>
            {deal.contact ? (
              <div>
                <Link
                  to={`/contacts/${deal.contact.id}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  {deal.contact.firstName} {deal.contact.lastName}
                </Link>
                {deal.contact.title && (
                  <p className="text-xs text-gray-500 mt-1">{deal.contact.title}</p>
                )}
                {deal.contact.email && (
                  <p className="text-xs text-gray-500 mt-0.5">{deal.contact.email}</p>
                )}
                {deal.contact.phone && (
                  <p className="text-xs text-gray-500 mt-0.5">{deal.contact.phone}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No contact linked</p>
            )}
          </div>

          {/* Company card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Company</h2>
            {deal.company ? (
              <div>
                <Link
                  to={`/companies/${deal.company.id}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  {deal.company.name}
                </Link>
                {deal.company.domain && (
                  <p className="text-xs text-gray-500 mt-1">{deal.company.domain}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No company linked</p>
            )}
          </div>

          {/* Owner card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Owner</h2>
            {deal.owner ? (
              <p className="text-sm text-gray-700">
                {deal.owner.firstName} {deal.owner.lastName}
              </p>
            ) : (
              <p className="text-sm text-gray-400">Unassigned</p>
            )}
          </div>

          {/* Metadata card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Metadata</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="text-sm text-gray-700">{formatDateTime(deal.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Updated</dt>
                <dd className="text-sm text-gray-700">{formatDateTime(deal.updatedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">ID</dt>
                <dd className="text-sm text-gray-700 font-mono truncate">{deal.id}</dd>
              </div>
              {deal.amount != null && (
                <div>
                  <dt className="text-xs text-gray-500">Amount</dt>
                  <dd className="text-sm font-semibold text-gray-700">{formatCurrency(deal.amount, deal.currency)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
