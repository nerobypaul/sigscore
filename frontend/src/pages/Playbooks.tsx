import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlaybookCategory = 'acquisition' | 'expansion' | 'retention' | 'engagement';

interface Playbook {
  id: string;
  name: string;
  description: string;
  category: PlaybookCategory;
  trigger: { event: string; filters?: Record<string, unknown> };
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; params: Record<string, unknown> }>;
  tags: string[];
  active: boolean;
  workflowId: string | null;
  enabled: boolean;
  runCount: number;
  lastTriggeredAt: string | null;
  activatedAt: string | null;
}

type FilterTab = 'all' | PlaybookCategory;

const CATEGORY_CONFIG: Record<PlaybookCategory, { label: string; color: string; bg: string }> = {
  acquisition: { label: 'Acquisition', color: 'text-blue-700', bg: 'bg-blue-100' },
  expansion: { label: 'Expansion', color: 'text-purple-700', bg: 'bg-purple-100' },
  retention: { label: 'Retention', color: 'text-amber-700', bg: 'bg-amber-100' },
  engagement: { label: 'Engagement', color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

const CATEGORY_ICON_BG: Record<PlaybookCategory, string> = {
  acquisition: 'bg-blue-100',
  expansion: 'bg-purple-100',
  retention: 'bg-amber-100',
  engagement: 'bg-emerald-100',
};

const CATEGORY_ICON_TEXT: Record<PlaybookCategory, string> = {
  acquisition: 'text-blue-600',
  expansion: 'text-purple-600',
  retention: 'text-amber-600',
  engagement: 'text-emerald-600',
};

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'acquisition', label: 'Acquisition' },
  { value: 'expansion', label: 'Expansion' },
  { value: 'retention', label: 'Retention' },
  { value: 'engagement', label: 'Engagement' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Playbooks() {
  const toast = useToast();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPlaybooks = useCallback(async () => {
    try {
      const { data } = await api.get('/playbooks');
      setPlaybooks(data.playbooks || []);
    } catch {
      setPlaybooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaybooks();
  }, [fetchPlaybooks]);

  const handleToggle = async (playbook: Playbook) => {
    setTogglingId(playbook.id);
    try {
      if (playbook.active && playbook.enabled) {
        await api.delete(`/playbooks/${playbook.id}`);
        toast.success(`"${playbook.name}" deactivated.`);
      } else {
        await api.post(`/playbooks/${playbook.id}/activate`);
        toast.success(`"${playbook.name}" activated!`);
      }
      await fetchPlaybooks();
    } catch {
      toast.error(`Failed to toggle "${playbook.name}".`);
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = activeFilter === 'all'
    ? playbooks
    : playbooks.filter((p) => p.category === activeFilter);

  const activeCount = playbooks.filter((p) => p.active && p.enabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <PlaybookIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Playbooks</h1>
            <p className="text-sm text-gray-500">
              Pre-built signal-driven automations for devtool companies.{' '}
              <span className="font-medium text-indigo-600">{activeCount} active</span>
            </p>
          </div>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveFilter(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeFilter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.value !== 'all' && (
              <span className="ml-1.5 text-xs text-gray-400">
                {playbooks.filter((p) =>
                  tab.value === 'all' ? true : p.category === tab.value,
                ).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Playbook grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((playbook) => {
          const catConf = CATEGORY_CONFIG[playbook.category];
          const isActive = playbook.active && playbook.enabled;
          const isToggling = togglingId === playbook.id;

          return (
            <div
              key={playbook.id}
              className={`bg-white rounded-xl border transition-all ${
                isActive
                  ? 'border-indigo-200 shadow-sm ring-1 ring-indigo-100'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="p-5">
                {/* Top row: icon + category + toggle */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        CATEGORY_ICON_BG[playbook.category]
                      }`}
                    >
                      <CategoryIcon
                        category={playbook.category}
                        className={`w-5 h-5 ${CATEGORY_ICON_TEXT[playbook.category]}`}
                      />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{playbook.name}</h3>
                      <span
                        className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${catConf.bg} ${catConf.color}`}
                      >
                        {catConf.label}
                      </span>
                    </div>
                  </div>

                  {/* Toggle switch */}
                  <button
                    onClick={() => handleToggle(playbook)}
                    disabled={isToggling}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      isActive ? 'bg-indigo-600' : 'bg-gray-200'
                    } ${isToggling ? 'opacity-50 cursor-wait' : ''}`}
                    title={isActive ? 'Deactivate playbook' : 'Activate playbook'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  {playbook.description}
                </p>

                {/* Action chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {playbook.actions.map((a, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                    >
                      {a.type.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {playbook.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center text-[11px] text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                {/* Footer stats */}
                {isActive && (
                  <div className="pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      <span className="font-medium text-gray-600">{playbook.runCount}</span> runs
                    </span>
                    {playbook.lastTriggeredAt && (
                      <span>
                        Last fired:{' '}
                        <span className="font-medium text-gray-600">
                          {new Date(playbook.lastTriggeredAt).toLocaleDateString()}
                        </span>
                      </span>
                    )}
                    {playbook.activatedAt && (
                      <span>
                        Activated:{' '}
                        <span className="font-medium text-gray-600">
                          {new Date(playbook.activatedAt).toLocaleDateString()}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">No playbooks in this category.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlaybookIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
      />
    </svg>
  );
}

function CategoryIcon({
  category,
  className = 'w-5 h-5',
}: {
  category: PlaybookCategory;
  className?: string;
}) {
  switch (category) {
    case 'acquisition':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
        </svg>
      );
    case 'expansion':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      );
    case 'retention':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      );
    case 'engagement':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      );
  }
}
