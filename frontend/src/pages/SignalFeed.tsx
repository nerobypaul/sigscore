import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import type { WebSocketMessage } from '../lib/useWebSocket';
import type { Signal, Pagination } from '../types';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { CompanyHoverCard, ContactHoverCard } from '../components/HoverCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 10_000;

const SOURCE_TYPES = [
  'GITHUB',
  'NPM',
  'PYPI',
  'WEBSITE',
  'DOCS',
  'PRODUCT_API',
  'SEGMENT',
  'DISCORD',
  'TWITTER',
  'STACKOVERFLOW',
  'REDDIT',
  'POSTHOG',
  'LINKEDIN',
  'INTERCOM',
  'ZENDESK',
  'CLEARBIT',
  'CUSTOM_WEBHOOK',
] as const;

const SOURCE_TYPE_LABELS: Record<string, string> = {
  GITHUB: 'GitHub',
  NPM: 'npm',
  PYPI: 'PyPI',
  WEBSITE: 'Website',
  DOCS: 'Docs',
  PRODUCT_API: 'Product API',
  SEGMENT: 'Segment',
  DISCORD: 'Discord',
  TWITTER: 'Twitter / X',
  STACKOVERFLOW: 'Stack Overflow',
  REDDIT: 'Reddit',
  POSTHOG: 'PostHog',
  LINKEDIN: 'LinkedIn',
  INTERCOM: 'Intercom',
  ZENDESK: 'Zendesk',
  CLEARBIT: 'Clearbit',
  CUSTOM_WEBHOOK: 'Custom Webhook',
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  GITHUB: 'bg-gray-800 text-white',
  NPM: 'bg-red-100 text-red-700',
  PYPI: 'bg-yellow-100 text-yellow-800',
  WEBSITE: 'bg-blue-100 text-blue-700',
  DOCS: 'bg-teal-100 text-teal-700',
  PRODUCT_API: 'bg-indigo-100 text-indigo-700',
  SEGMENT: 'bg-green-100 text-green-700',
  DISCORD: 'bg-violet-100 text-violet-700',
  TWITTER: 'bg-sky-100 text-sky-700',
  STACKOVERFLOW: 'bg-orange-100 text-orange-700',
  REDDIT: 'bg-orange-200 text-orange-800',
  POSTHOG: 'bg-blue-200 text-blue-800',
  LINKEDIN: 'bg-blue-100 text-blue-700',
  INTERCOM: 'bg-indigo-200 text-indigo-800',
  ZENDESK: 'bg-green-200 text-green-800',
  CLEARBIT: 'bg-purple-100 text-purple-700',
  CUSTOM_WEBHOOK: 'bg-gray-100 text-gray-600',
};

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  repo_clone: 'bg-purple-100 text-purple-700',
  package_install: 'bg-green-100 text-green-700',
  page_view: 'bg-blue-100 text-blue-700',
  api_call: 'bg-indigo-100 text-indigo-700',
  signup: 'bg-yellow-100 text-yellow-700',
  feature_use: 'bg-pink-100 text-pink-700',
};

type DateRangePreset = 'today' | '7d' | '30d' | 'all';

interface CompanyOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

function getDateGroup(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekAgo = new Date(today.getTime() - 7 * 86_400_000);

  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= weekAgo) return 'This Week';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function groupSignalsByDate(signals: Signal[]): { label: string; signals: Signal[] }[] {
  const groups: { label: string; signals: Signal[] }[] = [];
  let currentLabel = '';
  for (const signal of signals) {
    const label = getDateGroup(signal.timestamp || signal.createdAt);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, signals: [] });
    }
    groups[groups.length - 1].signals.push(signal);
  }
  return groups;
}

function getDateRange(preset: DateRangePreset): { from?: string; to?: string } {
  if (preset === 'all') return {};
  const now = new Date();
  let from: Date;
  switch (preset) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7d':
      from = new Date(now.getTime() - 7 * 86_400_000);
      break;
    case '30d':
      from = new Date(now.getTime() - 30 * 86_400_000);
      break;
  }
  return { from: from.toISOString() };
}

/** Extract a short metadata summary from signal metadata */
function metadataSummary(metadata: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (metadata.repo) parts.push(`repo: ${metadata.repo}`);
  if (metadata.package) parts.push(`pkg: ${metadata.package}`);
  if (metadata.url) parts.push(`${metadata.url}`);
  if (metadata.page) parts.push(`page: ${metadata.page}`);
  if (metadata.feature) parts.push(`feature: ${metadata.feature}`);
  if (metadata.action) parts.push(`action: ${metadata.action}`);
  if (metadata.event) parts.push(`event: ${metadata.event}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ---------------------------------------------------------------------------
// Source icon component
// ---------------------------------------------------------------------------

function SourceIcon({ sourceType }: { sourceType?: string }) {
  const color = sourceType
    ? SOURCE_TYPE_COLORS[sourceType] || 'bg-gray-100 text-gray-600'
    : 'bg-gray-100 text-gray-600';

  const label = sourceType
    ? SOURCE_TYPE_LABELS[sourceType] || sourceType
    : '?';

  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold flex-shrink-0 ${color}`}
      title={label}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Signal Card
// ---------------------------------------------------------------------------

function FeedSignalCard({
  signal,
  isExpanded,
  onToggle,
}: {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const typeColor =
    SIGNAL_TYPE_COLORS[signal.type] || 'bg-gray-100 text-gray-700';
  const summary = metadataSummary(signal.metadata);

  const handleCopyMetadata = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(signal.metadata, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="px-5 py-4 hover:bg-gray-50/70 transition-colors group">
      <div className="flex items-start gap-3">
        {/* Source icon */}
        <SourceIcon sourceType={signal.source?.type} />

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top line: event type + actor */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${typeColor}`}
            >
              {signal.type.replace(/_/g, ' ')}
            </span>
            {signal.actor ? (
              <ContactHoverCard contactId={signal.actor.id}>
                <Link to={`/contacts/${signal.actor.id}`} className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                  {signal.actor.firstName} {signal.actor.lastName}
                </Link>
              </ContactHoverCard>
            ) : (
              <span className="text-sm font-medium text-gray-900">
                {signal.anonymousId
                  ? `Anonymous (${signal.anonymousId.slice(0, 8)}...)`
                  : 'Unknown'}
              </span>
            )}
            {signal.actor?.email && (
              <span className="text-xs text-gray-400 truncate max-w-[180px]">
                {signal.actor.email}
              </span>
            )}
          </div>

          {/* Company + source name */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {signal.account && (
              <CompanyHoverCard companyId={signal.account.id}>
                <Link
                  to={`/companies/${signal.account.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                >
                  {signal.account.name}
                </Link>
              </CompanyHoverCard>
            )}
            {signal.source && (
              <span className="text-xs text-gray-400">
                via {signal.source.name}
              </span>
            )}
          </div>

          {/* Metadata summary */}
          {summary && (
            <p className="mt-1 text-xs text-gray-500 truncate">{summary}</p>
          )}

          {/* Expandable metadata */}
          {signal.metadata && Object.keys(signal.metadata).length > 0 && (
            <div className="mt-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle();
                }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {isExpanded ? 'Hide metadata' : 'Show metadata'}
              </button>
              {isExpanded && (
                <pre className="mt-1.5 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 overflow-x-auto max-h-48">
                  {JSON.stringify(signal.metadata, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Right: timestamp + hover actions */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0 mt-1">
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {timeAgo(signal.timestamp || signal.createdAt)}
          </span>

          {/* Quick actions — visible on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {signal.actor && (
              <Link
                to={`/contacts/${signal.actor.id}`}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                title="View contact"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                </svg>
              </Link>
            )}
            {signal.account && (
              <Link
                to={`/companies/${signal.account.id}`}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
                title="View company"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5M3.75 3v18h16.5V3H3.75zm3 3.75h3v3h-3v-3zm6.75 0h3v3h-3v-3zm-6.75 6h3v3h-3v-3zm6.75 0h3v3h-3v-3z" />
                </svg>
              </Link>
            )}
            <button
              onClick={handleCopyMetadata}
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
              title={copied ? 'Copied!' : 'Copy metadata'}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function SignalFeed() {
  useEffect(() => { document.title = 'Signal Feed — DevSignal'; }, []);

  // Data state
  const [signals, setSignals] = useState<Signal[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filter state
  const [sourceTypeFilter, setSourceTypeFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRangePreset>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [newSignalCount, setNewSignalCount] = useState(0);

  // Companies for dropdown
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>();
  const latestTimestampRef = useRef<string>('');

  // Debounce search — only update the debounced value; fetchSignals handles
  // replacing signals when buildParams (which depends on debouncedSearch) changes.
  // Do NOT call setSignals([]) here — it races with the initial fetch on mount
  // and wipes already-loaded data 400ms after render.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load companies for the dropdown
  useEffect(() => {
    api
      .get('/companies', { params: { limit: 200 } })
      .then(({ data }) => {
        const list = (data.data || data.companies || []) as CompanyOption[];
        setCompanies(list);
      })
      .catch(() => {
        // Non-critical, ignore
      });
  }, []);

  const hasFilters = sourceTypeFilter || companyFilter || dateRange !== 'all' || debouncedSearch;

  const clearFilters = () => {
    setSourceTypeFilter('');
    setCompanyFilter('');
    setDateRange('all');
    setSearchQuery('');
    setDebouncedSearch('');
    setPage(1);
    setSignals([]);
  };

  // Build query params
  const buildParams = useCallback(
    (pageNum: number) => {
      const dateParams = getDateRange(dateRange);
      return {
        page: pageNum,
        limit: PAGE_SIZE,
        sourceType: sourceTypeFilter || undefined,
        accountId: companyFilter || undefined,
        from: dateParams.from || undefined,
        to: dateParams.to || undefined,
        search: debouncedSearch || undefined,
      };
    },
    [sourceTypeFilter, companyFilter, dateRange, debouncedSearch],
  );

  // Fetch signals (initial or filter change)
  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/signals', { params: buildParams(1) });
      const list = data.signals || data.data || [];
      setSignals(list);
      setPagination(data.pagination || null);
      setPage(1);
      setNewSignalCount(0);
      if (list.length > 0) {
        latestTimestampRef.current = list[0].timestamp || list[0].createdAt;
      }
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Fetch more (infinite scroll)
  const fetchMore = useCallback(async () => {
    if (loadingMore) return;
    if (pagination && page >= pagination.totalPages) return;

    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/signals', {
        params: buildParams(nextPage),
      });
      const list = data.signals || data.data || [];
      setSignals((prev) => [...prev, ...list]);
      setPagination(data.pagination || null);
      setPage(nextPage);
    } catch {
      // Ignore load-more errors
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, pagination, page, buildParams]);

  // Check for new signals (poll)
  const checkForNew = useCallback(async () => {
    if (!latestTimestampRef.current) return;
    try {
      const { data } = await api.get('/signals', {
        params: {
          ...buildParams(1),
          limit: 1,
          from: latestTimestampRef.current,
        },
      });
      const total = data.pagination?.total ?? 0;
      // Subtract 1 because "from" is inclusive and includes the latest signal we already have
      const newCount = Math.max(0, total - 1);
      if (newCount > 0) {
        setNewSignalCount(newCount);
      }
    } catch {
      // Polling failure is non-critical
    }
  }, [buildParams]);

  // Initial load + filter-change reload
  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // Auto-refresh polling
  useEffect(() => {
    if (autoRefresh) {
      pollTimerRef.current = setInterval(checkForNew, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [autoRefresh, checkForNew]);

  // WebSocket real-time updates
  const handleWSMessage = useCallback(
    (msg: WebSocketMessage) => {
      if (msg.type === 'signal.created') {
        if (autoRefresh) {
          setNewSignalCount((c) => c + 1);
        }
      }
    },
    [autoRefresh],
  );

  useWebSocket(handleWSMessage);

  // Infinite scroll handler
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop - clientHeight < 200) {
        fetchMore();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [fetchMore]);

  // Reset to page 1 on filter change
  useEffect(() => {
    setPage(1);
    setSignals([]);
  }, [sourceTypeFilter, companyFilter, dateRange]);

  // Load new signals banner click
  const loadNewSignals = () => {
    setNewSignalCount(0);
    fetchSignals();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 lg:px-8 pt-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Signal Feed</h1>
            {pagination && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                {pagination.total.toLocaleString()}
              </span>
            )}
          </div>

          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-500">Auto-refresh</span>
            <button
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                autoRefresh ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  autoRefresh ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Filters bar */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {/* Source type */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Source
            </label>
            <select
              value={sourceTypeFilter}
              onChange={(e) => setSourceTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
            >
              <option value="">All sources</option>
              {SOURCE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {SOURCE_TYPE_LABELS[st]}
                </option>
              ))}
            </select>
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Company
            </label>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white max-w-[200px]"
            >
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Date range
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRangePreset)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Search
            </label>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
              <input
                type="text"
                placeholder="Search signals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* New signals banner */}
      {newSignalCount > 0 && (
        <div className="px-6 lg:px-8">
          <button
            onClick={loadNewSignals}
            className="w-full py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            {newSignalCount} new signal{newSignalCount !== 1 ? 's' : ''} -- click to load
          </button>
        </div>
      )}

      {/* Signal list */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 lg:px-8 pb-6 mt-2"
      >
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner />
            </div>
          ) : signals.length === 0 ? (
            hasFilters ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                No signals match your filters.{' '}
                <button
                  onClick={clearFilters}
                  className="text-indigo-600 hover:text-indigo-700 underline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <EmptyState
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                    />
                  </svg>
                }
                title="No signals yet"
                description="Signals will appear here as they flow in from your connected sources. Connect a source to get started."
              />
            )
          ) : (
            <>
              {groupSignalsByDate(signals).map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 z-10 px-5 py-2 bg-gray-50 border-b border-gray-200">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{group.label}</span>
                    <span className="ml-2 text-xs text-gray-400">{group.signals.length}</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.signals.map((signal) => (
                      <FeedSignalCard
                        key={signal.id}
                        signal={signal}
                        isExpanded={expandedId === signal.id}
                        onToggle={() =>
                          setExpandedId(
                            expandedId === signal.id ? null : signal.id,
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-4 border-t border-gray-100">
                  <Spinner size="sm" />
                  <span className="ml-2 text-sm text-gray-400">
                    Loading more...
                  </span>
                </div>
              )}

              {/* End of list */}
              {pagination &&
                page >= pagination.totalPages &&
                !loadingMore && (
                  <div className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
                    Showing all {pagination.total.toLocaleString()} signals
                  </div>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
