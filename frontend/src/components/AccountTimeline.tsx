import { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../lib/api';
import type { Signal, Activity, Deal } from '../types';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(date).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Timeline entry types
// ---------------------------------------------------------------------------

type EntryKind = 'signal' | 'activity' | 'deal';
type FilterKind = 'all' | EntryKind;

interface TimelineEntry {
  id: string;
  kind: EntryKind;
  title: string;
  subtitle: string;
  date: string;
  iconBg: string;
  iconColor: string;
}

// ---------------------------------------------------------------------------
// Icons for each entry type
// ---------------------------------------------------------------------------

function SignalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function DealIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AccountTimelineProps {
  companyId: string;
  signals?: Signal[];
  activities?: Activity[];
  deals?: Deal[];
  limit?: number;
}

export default function AccountTimeline({
  companyId,
  signals: initialSignals,
  activities: initialActivities,
  deals: initialDeals,
  limit = 50,
}: AccountTimelineProps) {
  const [signals, setSignals] = useState<Signal[]>(initialSignals || []);
  const [activities, setActivities] = useState<Activity[]>(initialActivities || []);
  const [deals, setDeals] = useState<Deal[]>(initialDeals || []);
  const [loading, setLoading] = useState(!initialSignals);
  const [filter, setFilter] = useState<FilterKind>('all');
  const [visibleCount, setVisibleCount] = useState(20);

  // Fetch data if not provided as props
  useEffect(() => {
    if (initialSignals && initialActivities && initialDeals) return;

    setLoading(true);
    const fetches: Promise<void>[] = [];

    if (!initialSignals) {
      fetches.push(
        api.get('/signals', { params: { accountId: companyId, limit } })
          .then(({ data }) => setSignals(data.signals || []))
          .catch(() => setSignals([]))
      );
    }
    if (!initialActivities) {
      fetches.push(
        api.get('/activities', { params: { companyId, limit } })
          .then(({ data }) => setActivities(data.activities || []))
          .catch(() => setActivities([]))
      );
    }
    if (!initialDeals) {
      fetches.push(
        api.get('/deals', { params: { companyId, limit: 50 } })
          .then(({ data }) => setDeals(data.deals || []))
          .catch(() => setDeals([]))
      );
    }

    Promise.all(fetches).finally(() => setLoading(false));
  }, [companyId, limit, initialSignals, initialActivities, initialDeals]);

  // Merge into unified timeline
  const entries = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [];

    signals.forEach((s) => {
      items.push({
        id: `signal-${s.id}`,
        kind: 'signal',
        title: s.type.replace(/_/g, ' ').replace(/\./g, ' '),
        subtitle: s.source?.name || 'Signal',
        date: s.timestamp,
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-600',
      });
    });

    activities.forEach((a) => {
      items.push({
        id: `activity-${a.id}`,
        kind: 'activity',
        title: a.title,
        subtitle: `${a.type} - ${a.status}`,
        date: a.createdAt,
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
      });
    });

    deals.forEach((d) => {
      items.push({
        id: `deal-${d.id}`,
        kind: 'deal',
        title: d.title,
        subtitle: `${d.stage}${d.amount != null ? ` - $${d.amount.toLocaleString()}` : ''}`,
        date: d.createdAt,
        iconBg: 'bg-purple-100',
        iconColor: 'text-purple-600',
      });
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [signals, activities, deals]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.kind === filter);
  }, [entries, filter]);

  const visible = filtered.slice(0, visibleCount);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + 20);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  const FILTERS: { key: FilterKind; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'signal', label: 'Signals' },
    { key: 'activity', label: 'Activities' },
    { key: 'deal', label: 'Deals' },
  ];

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setVisibleCount(20); }}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No timeline events yet</p>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-1">
            {visible.map((item) => (
              <div key={item.id} className="relative flex gap-4 py-3">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full ${item.iconBg} ${item.iconColor} flex items-center justify-center z-10`}
                >
                  {item.kind === 'signal' && <SignalIcon />}
                  {item.kind === 'activity' && <ActivityIcon />}
                  {item.kind === 'deal' && <DealIcon />}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.subtitle}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{timeAgo(item.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load more */}
      {visible.length < filtered.length && (
        <div className="text-center mt-4">
          <button
            onClick={handleLoadMore}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
