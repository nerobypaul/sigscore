import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { Deal, DealStage } from '../types';
import { DEAL_STAGES, STAGE_LABELS, STAGE_COLORS } from '../types';

type ViewMode = 'pipeline' | 'list';

export default function Deals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [showCreate, setShowCreate] = useState(false);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all deals (high limit) for pipeline view
      const { data } = await api.get('/deals', { params: { limit: 200 } });
      setDeals(data.deals || []);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  const dealsByStage = DEAL_STAGES.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage);
      return acc;
    },
    {} as Record<DealStage, Deal[]>
  );

  const handleStageChange = async (dealId: string, newStage: DealStage) => {
    try {
      await api.put(`/deals/${dealId}`, { stage: newStage });
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage: newStage } : d))
      );
    } catch {
      // Revert on failure by refetching
      fetchDeals();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
          <p className="mt-1 text-sm text-gray-500">{deals.length} total deals</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'pipeline'
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              List
            </button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Add Deal
          </button>
        </div>
      </div>

      {viewMode === 'pipeline' ? (
        <PipelineView dealsByStage={dealsByStage} onStageChange={handleStageChange} />
      ) : (
        <ListView deals={deals} />
      )}

      {showCreate && (
        <CreateDealModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchDeals();
          }}
        />
      )}
    </div>
  );
}

function PipelineView({
  dealsByStage,
  onStageChange,
}: {
  dealsByStage: Record<DealStage, Deal[]>;
  onStageChange: (dealId: string, newStage: DealStage) => void;
}) {
  // Only show active pipeline stages (exclude CLOSED_WON and CLOSED_LOST in main columns, show as summary)
  const activeStages = DEAL_STAGES.filter(
    (s) => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST'
  );

  const closedWonCount = dealsByStage['CLOSED_WON']?.length || 0;
  const closedLostCount = dealsByStage['CLOSED_LOST']?.length || 0;

  return (
    <div className="flex-1 overflow-hidden">
      {/* Closed deals summary */}
      <div className="flex gap-4 mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-medium">
            Closed Won: {closedWonCount}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-medium">
            Closed Lost: {closedLostCount}
          </span>
        </div>
      </div>

      {/* Pipeline columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 h-full">
        {activeStages.map((stage) => {
          const stageDeals = dealsByStage[stage] || [];
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

          return (
            <div
              key={stage}
              className="flex-shrink-0 w-72 bg-gray-100 rounded-xl flex flex-col max-h-full"
            >
              {/* Column header */}
              <div className="p-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_COLORS[stage]}`}
                  >
                    {STAGE_LABELS[stage]}
                  </span>
                  <span className="text-xs text-gray-500">{stageDeals.length}</span>
                </div>
                {stageValue > 0 && (
                  <p className="text-xs text-gray-500">${stageValue.toLocaleString()}</p>
                )}
              </div>

              {/* Deal cards */}
              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
                {stageDeals.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400">No deals</div>
                ) : (
                  stageDeals.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      onStageChange={onStageChange}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  onStageChange,
}: {
  deal: Deal;
  onStageChange: (dealId: string, newStage: DealStage) => void;
}) {
  const [showStageMenu, setShowStageMenu] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-md transition-shadow relative">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-medium text-gray-900 leading-tight">{deal.title}</h3>
        <button
          onClick={() => setShowStageMenu(!showStageMenu)}
          className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>

      {deal.amount != null && (
        <p className="text-sm font-semibold text-gray-700">
          ${deal.amount.toLocaleString()} {deal.currency}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        {deal.contact && (
          <span className="truncate">
            {deal.contact.firstName} {deal.contact.lastName}
          </span>
        )}
        {deal.company && (
          <span className="truncate text-indigo-600">{deal.company.name}</span>
        )}
      </div>

      {deal.expectedCloseDate && (
        <p className="text-xs text-gray-400 mt-1">
          Close: {new Date(deal.expectedCloseDate).toLocaleDateString()}
        </p>
      )}

      {/* Stage change dropdown */}
      {showStageMenu && (
        <div className="absolute right-0 top-8 z-10 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48">
          <p className="px-3 py-1 text-xs text-gray-400 font-medium">Move to:</p>
          {DEAL_STAGES.filter((s) => s !== deal.stage).map((stage) => (
            <button
              key={stage}
              onClick={() => {
                onStageChange(deal.id, stage);
                setShowStageMenu(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
            >
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[stage]}`}>
                {STAGE_LABELS[stage]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListView({ deals }: { deals: Deal[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Deal</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Amount</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Stage</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Contact</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Company</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Close Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {deals.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  No deals yet
                </td>
              </tr>
            ) : (
              deals.map((deal) => (
                <tr key={deal.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 font-medium text-gray-900">{deal.title}</td>
                  <td className="py-3 px-4 text-gray-700">
                    {deal.amount != null ? `$${deal.amount.toLocaleString()}` : '--'}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${STAGE_COLORS[deal.stage]}`}
                    >
                      {STAGE_LABELS[deal.stage]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {deal.contact
                      ? `${deal.contact.firstName} ${deal.contact.lastName}`
                      : '--'}
                  </td>
                  <td className="py-3 px-4 text-gray-600">
                    {deal.company?.name || '--'}
                  </td>
                  <td className="py-3 px-4 text-gray-500">
                    {deal.expectedCloseDate
                      ? new Date(deal.expectedCloseDate).toLocaleDateString()
                      : '--'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateDealModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    amount: '',
    stage: 'ANONYMOUS_USAGE' as DealStage,
    description: '',
    expectedCloseDate: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/deals', {
        title: form.title,
        amount: form.amount ? parseFloat(form.amount) : undefined,
        stage: form.stage,
        description: form.description || undefined,
        expectedCloseDate: form.expectedCloseDate
          ? new Date(form.expectedCloseDate).toISOString()
          : undefined,
      });
      onCreated();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Failed to create deal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New Deal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deal title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
              <select
                value={form.stage}
                onChange={(e) => setForm({ ...form, stage: e.target.value as DealStage })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected close date</label>
            <input
              type="date"
              value={form.expectedCloseDate}
              onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
