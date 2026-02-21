import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnomalyMetadata {
  anomalyType?: 'SPIKE' | 'DROP';
  severity?: 'moderate' | 'high';
  todayCount?: number;
  mean?: number;
  stddev?: number;
  expectedMin?: number;
  expectedMax?: number;
  zScore?: number;
  accountName?: string;
  description?: string;
}

interface AnomalyRecord {
  id: string;
  title: string;
  accountId: string | null;
  metadata: AnomalyMetadata;
  read: boolean;
  createdAt: string;
}

type FilterTab = 'all' | 'spikes' | 'drops';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString();
}

function buildDescription(meta: AnomalyMetadata): string {
  if (meta.description) return meta.description;

  const multiplier = meta.mean && meta.mean > 0
    ? Math.round((meta.todayCount ?? 0) / meta.mean * 10) / 10
    : null;

  if (meta.anomalyType === 'SPIKE' && multiplier !== null) {
    return `Signal activity ${multiplier}x above normal baseline`;
  }
  if (meta.anomalyType === 'DROP' && multiplier !== null) {
    return `Signal activity dropped to ${multiplier}x of normal baseline`;
  }
  return 'Unusual signal activity detected';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Anomalies() {
  useEffect(() => { document.title = 'Signal Anomalies — Sigscore'; }, []);
  const toast = useToast();

  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');

  // ---- Data fetching ----

  const fetchAnomalies = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/anomalies?days=7');
      setAnomalies(data.data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load anomalies';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnomalies();
  }, [fetchAnomalies]);

  // ---- Scan trigger ----

  const handleScan = async () => {
    try {
      setScanning(true);
      await api.post('/anomalies/scan');
      toast.success('Anomaly scan started. New anomalies will appear shortly.');
      // Re-fetch after a short delay to allow the scan to complete
      setTimeout(() => {
        fetchAnomalies();
      }, 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start anomaly scan';
      toast.error(msg);
    } finally {
      setScanning(false);
    }
  };

  // ---- Filtering ----

  const filtered = anomalies.filter((a) => {
    if (filter === 'spikes') return a.metadata.anomalyType === 'SPIKE';
    if (filter === 'drops') return a.metadata.anomalyType === 'DROP';
    return true;
  });

  const spikeCount = anomalies.filter((a) => a.metadata.anomalyType === 'SPIKE').length;
  const dropCount = anomalies.filter((a) => a.metadata.anomalyType === 'DROP').length;

  // ---- Render ----

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Signal Anomalies</h1>
          <p className="text-sm text-gray-500 mt-1">
            Automatically detected unusual signal activity
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scanning ? (
            <>
              <ScanSpinner />
              Scanning...
            </>
          ) : (
            <>
              <ScanIcon />
              Scan Now
            </>
          )}
        </button>
      </div>

      {/* Stats bar */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total (7d)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{anomalies.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Spikes</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-gray-900">{spikeCount}</p>
              {spikeCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  <ArrowUpIcon />
                </span>
              )}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Drops</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-gray-900">{dropCount}</p>
              {dropCount > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  <ArrowDownIcon />
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {!loading && !error && anomalies.length > 0 && (
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            {([
              { key: 'all' as const, label: 'All', count: anomalies.length },
              { key: 'spikes' as const, label: 'Spikes', count: spikeCount },
              { key: 'drops' as const, label: 'Drops', count: dropCount },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  filter === tab.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading anomalies...</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500">{error}</p>
          <button
            onClick={fetchAnomalies}
            className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasFilter={filter !== 'all'} onClearFilter={() => setFilter('all')} />
      ) : (
        <div className="space-y-4">
          {filtered.map((anomaly) => (
            <AnomalyCard key={anomaly.id} anomaly={anomaly} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AnomalyCard({ anomaly }: { anomaly: AnomalyRecord }) {
  const meta = anomaly.metadata;
  const isSpike = meta.anomalyType === 'SPIKE';
  const isHigh = meta.severity === 'high';

  const typeBadgeClasses = isSpike
    ? 'bg-red-100 text-red-700'
    : 'bg-blue-100 text-blue-700';

  const severityBadgeClasses = isHigh
    ? 'bg-red-100 text-red-700'
    : 'bg-yellow-100 text-yellow-700';

  const accountName = meta.accountName ?? anomaly.title ?? 'Unknown Account';
  const description = buildDescription(meta);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Account name + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {anomaly.accountId ? (
              <Link
                to={`/companies/${anomaly.accountId}`}
                className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
              >
                {accountName}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-gray-900">{accountName}</span>
            )}

            {/* Type badge */}
            {meta.anomalyType && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeClasses}`}>
                {isSpike ? <ArrowUpIcon /> : <ArrowDownIcon />}
                {meta.anomalyType}
              </span>
            )}

            {/* Severity badge */}
            {meta.severity && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${severityBadgeClasses}`}>
                {meta.severity}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 mb-2">{description}</p>

          {/* Context: expected range and actual count */}
          {(meta.mean !== undefined || meta.todayCount !== undefined) && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {meta.expectedMin !== undefined && meta.expectedMax !== undefined && (
                <span>
                  Expected range: {meta.expectedMin} - {meta.expectedMax} signals/day
                </span>
              )}
              {meta.todayCount !== undefined && (
                <span>
                  Actual: <span className="font-medium text-gray-700">{meta.todayCount}</span> signals today
                </span>
              )}
              {meta.zScore !== undefined && (
                <span>
                  z-score: {meta.zScore > 0 ? '+' : ''}{meta.zScore}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 text-right">
          <span className="text-xs text-gray-400">{relativeTime(anomaly.createdAt)}</span>
          {!anomaly.read && (
            <div className="mt-1 flex justify-end">
              <span className="w-2 h-2 rounded-full bg-indigo-500" title="Unread" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilter, onClearFilter }: { hasFilter: boolean; onClearFilter: () => void }) {
  return (
    <div className="text-center py-16">
      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      {hasFilter ? (
        <>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No matching anomalies</h3>
          <p className="mt-1 text-sm text-gray-500">
            No anomalies match the selected filter.
          </p>
          <button
            onClick={onClearFilter}
            className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Clear filter
          </button>
        </>
      ) : (
        <>
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No anomalies detected</h3>
          <p className="mt-1 text-sm text-gray-500">
            All accounts are showing normal signal activity over the past 7 days.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Anomalies are detected when signal activity deviates significantly from rolling baselines.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ScanIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function ScanSpinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
    </svg>
  );
}
