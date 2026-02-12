import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { Signal, Pagination } from '../types';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

const SIGNAL_TYPE_COLORS: Record<string, string> = {
  repo_clone: 'bg-purple-100 text-purple-700',
  package_install: 'bg-green-100 text-green-700',
  page_view: 'bg-blue-100 text-blue-700',
  api_call: 'bg-indigo-100 text-indigo-700',
  signup: 'bg-yellow-100 text-yellow-700',
  feature_use: 'bg-pink-100 text-pink-700',
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  GITHUB: 'bg-gray-800 text-white',
  NPM: 'bg-red-100 text-red-700',
  WEBSITE: 'bg-blue-100 text-blue-700',
  DOCS: 'bg-teal-100 text-teal-700',
  PRODUCT_API: 'bg-indigo-100 text-indigo-700',
  SEGMENT: 'bg-green-100 text-green-700',
  CUSTOM_WEBHOOK: 'bg-orange-100 text-orange-700',
};

const SIGNAL_TYPES = [
  'repo_clone',
  'package_install',
  'page_view',
  'api_call',
  'signup',
  'feature_use',
];

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function Signals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('');

  // Debounce account search
  useEffect(() => {
    const timer = setTimeout(() => {
      setAccountFilter(accountSearch);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [accountSearch]);

  const hasFilters = typeFilter || fromDate || toDate || accountFilter;

  const clearFilters = () => {
    setTypeFilter('');
    setFromDate('');
    setToDate('');
    setAccountSearch('');
    setAccountFilter('');
    setPage(1);
  };

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/signals', {
        params: {
          page,
          limit: 20,
          type: typeFilter || undefined,
          from: fromDate || undefined,
          to: toDate || undefined,
          account: accountFilter || undefined,
        },
      });
      setSignals(data.data || []);
      setPagination(data.pagination || null);
    } catch {
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, fromDate, toDate, accountFilter]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Signal Feed</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pagination ? `${pagination.total} total signals` : ''}
        </p>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Signal Type</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            <option value="">All types</option>
            {SIGNAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Account</label>
          <input
            type="text"
            placeholder="Search account..."
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Signal list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : signals.length === 0 ? (
          hasFilters ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No signals match your filters
            </div>
          ) : (
            <EmptyState
              icon={
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              }
              title="No signals yet"
              description="Signals will appear here as users interact with your product through connected sources."
            />
          )
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {signals.map((signal) => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  isExpanded={expandedId === signal.id}
                  onToggle={() =>
                    setExpandedId(expandedId === signal.id ? null : signal.id)
                  }
                />
              ))}
            </div>

            {/* Pagination */}
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

function SignalCard({
  signal,
  isExpanded,
  onToggle,
}: {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const typeColor =
    SIGNAL_TYPE_COLORS[signal.type] || 'bg-gray-100 text-gray-700';
  const sourceTypeColor = signal.source?.type
    ? SOURCE_TYPE_COLORS[signal.source.type] || 'bg-gray-100 text-gray-600'
    : 'bg-gray-100 text-gray-600';

  return (
    <div className="px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Type badge */}
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 mt-0.5 ${typeColor}`}
        >
          {signal.type.replace(/_/g, ' ')}
        </span>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Actor */}
            <span className="text-sm font-medium text-gray-900">
              {signal.actor
                ? `${signal.actor.firstName} ${signal.actor.lastName}`
                : signal.anonymousId
                ? `Anonymous (${signal.anonymousId.slice(0, 8)}...)`
                : 'Unknown'}
            </span>

            {signal.actor?.email && (
              <span className="text-xs text-gray-400">{signal.actor.email}</span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Account */}
            {signal.account && (
              <span className="text-sm text-indigo-600 font-medium">
                {signal.account.name}
              </span>
            )}

            {/* Source */}
            {signal.source && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${sourceTypeColor}`}
              >
                {signal.source.name}
              </span>
            )}
          </div>

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
                <pre className="mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 overflow-x-auto max-h-48">
                  {JSON.stringify(signal.metadata, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
          {timeAgo(signal.timestamp || signal.createdAt)}
        </span>
      </div>
    </div>
  );
}
