import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

interface Sequence {
  id: string;
  name: string;
  status: 'active' | 'draft' | 'paused' | 'archived';
  triggerType: string;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  stepCount: number;
  enrolledCount: number;
  openRate: number;
  clickRate: number;
  createdAt: string;
  updatedAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type StatusFilter = 'all' | 'active' | 'draft' | 'paused';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-600',
  paused: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-red-100 text-red-700',
};

const TRIGGER_TYPES = [
  { value: 'manual', label: 'Manual' },
  { value: 'signal_threshold', label: 'Signal Threshold' },
  { value: 'deal_stage', label: 'Deal Stage Change' },
  { value: 'score_change', label: 'Score Change' },
];

export default function EmailSequences() {
  useEffect(() => { document.title = 'Email Sequences — Sigscore'; }, []);
  const navigate = useNavigate();
  const toast = useToast();
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    triggerType: 'manual',
    fromName: '',
    fromEmail: '',
    replyTo: '',
  });

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/sequences', { params });
      setSequences(data.sequences || []);
      setPagination(data.pagination || null);
    } catch {
      setSequences([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchSequences();
  }, [fetchSequences]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Sequence name is required.');
      return;
    }
    setCreating(true);
    try {
      await api.post('/sequences', {
        name: form.name.trim(),
        triggerType: form.triggerType,
        fromName: form.fromName.trim() || undefined,
        fromEmail: form.fromEmail.trim() || undefined,
        replyTo: form.replyTo.trim() || undefined,
      });
      toast.success('Sequence created.');
      setShowCreate(false);
      setForm({ name: '', triggerType: 'manual', fromName: '', fromEmail: '', replyTo: '' });
      fetchSequences();
    } catch {
      toast.error('Failed to create sequence.');
    } finally {
      setCreating(false);
    }
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'draft', label: 'Draft' },
    { key: 'paused', label: 'Paused' },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Sequences</h1>
          <p className="mt-1 text-sm text-gray-500">Automated outreach for your pipeline</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Sequence
        </button>
      </div>

      {/* Inline create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-900">Create Sequence</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. New User Onboarding"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
              <select
                value={form.triggerType}
                onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
              <input
                type="text"
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                placeholder="Jane Smith"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
              <input
                type="email"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                placeholder="jane@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To</label>
              <input
                type="email"
                value={form.replyTo}
                onChange={(e) => setForm({ ...form, replyTo: e.target.value })}
                placeholder="reply@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Spinner /></div>
        ) : sequences.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            }
            title="No sequences yet"
            description="Create your first email sequence to start automated outreach."
            actionLabel="New Sequence"
            onAction={() => setShowCreate(true)}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Status</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Steps</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Enrolled</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Open Rate</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Click Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sequences.map((seq) => (
                    <tr
                      key={seq.id}
                      onClick={() => navigate(`/sequences/${seq.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="font-medium text-gray-900">{seq.name}</span>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {TRIGGER_TYPES.find((t) => t.value === seq.triggerType)?.label || seq.triggerType}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[seq.status] || 'bg-gray-100 text-gray-600'}`}>
                          {seq.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">{seq.stepCount}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{seq.enrolledCount}</td>
                      <td className="py-3 px-4 text-right text-gray-600">{(seq.openRate * 100).toFixed(1)}%</td>
                      <td className="py-3 px-4 text-right text-gray-600">{(seq.clickRate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= (pagination?.totalPages ?? 1)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
