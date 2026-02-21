import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactResult {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  fieldsEnriched: string[];
  error?: string;
  completedAt?: string;
}

interface BatchSummary {
  batchId: string;
  status: 'queued' | 'processing' | 'completed' | 'cancelled';
  total: number;
  completed: number;
  failed: number;
  pending: number;
  skipped: number;
  successRate: number;
  sources: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
}

interface BatchDetail extends BatchSummary {
  contacts: ContactResult[];
}

interface QueueStats {
  totalEnrichedAllTime: number;
  overallSuccessRate: number;
  averageEnrichmentTimeMs: number;
  activeBatches: number;
}

interface ContactOption {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

const SOURCE_OPTIONS = [
  { value: 'clearbit', label: 'Clearbit', description: 'Company & person data' },
  { value: 'github', label: 'GitHub', description: 'Developer profiles' },
  { value: 'npm', label: 'npm', description: 'Package maintainer data' },
  { value: 'email', label: 'Email Lookup', description: 'Email verification' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    queued: 'bg-blue-100 text-blue-800',
    skipped: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnrichmentQueue() {
  useEffect(() => { document.title = 'Enrichment Queue — Sigscore'; }, []);
  const toast = useToast();

  // Stats
  const [stats, setStats] = useState<QueueStats | null>(null);

  // Batch list
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);

  // Expanded batch detail
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Start enrichment panel
  const [showStartPanel, setShowStartPanel] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'all' | 'selected'>('all');
  const [selectedSources, setSelectedSources] = useState<string[]>(['clearbit', 'github', 'npm', 'email']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Contact search for "selected" mode
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactOption[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<ContactOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----- Fetch stats -----
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get<QueueStats>('/enrichment-queue/stats');
      setStats(data);
    } catch {
      // Silent fail
    }
  }, []);

  // ----- Fetch batches -----
  const fetchBatches = useCallback(async () => {
    try {
      const { data } = await api.get<{ batches: BatchSummary[] }>('/enrichment-queue/batches');
      setBatches(data.batches);
    } catch {
      // Silent fail
    } finally {
      setIsLoadingBatches(false);
    }
  }, []);

  // ----- Fetch batch detail -----
  const fetchBatchDetail = useCallback(async (batchId: string) => {
    setIsLoadingDetail(true);
    try {
      const { data } = await api.get<BatchDetail>(`/enrichment-queue/${batchId}`);
      setBatchDetail(data);
    } catch {
      toast.error('Failed to load batch details.');
      setBatchDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  }, [toast]);

  // ----- Search contacts -----
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setContactResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const { data } = await api.get<{ results: Array<{ id: string; type: string; title: string; subtitle?: string }> }>(
        `/search?q=${encodeURIComponent(query)}&types=contacts&limit=10`,
      );
      // Map search results to contact options
      const contacts: ContactOption[] = data.results
        .filter((r) => r.type === 'contact')
        .map((r) => ({
          id: r.id,
          firstName: r.title.split(' ')[0] || null,
          lastName: r.title.split(' ').slice(1).join(' ') || null,
          email: r.subtitle || null,
        }));
      setContactResults(contacts);
    } catch {
      setContactResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // ----- Initial load -----
  useEffect(() => {
    fetchStats();
    fetchBatches();
  }, [fetchStats, fetchBatches]);

  // ----- Polling for active batches -----
  useEffect(() => {
    const hasActive = batches.some(
      (b) => b.status === 'queued' || b.status === 'processing',
    );

    if (hasActive) {
      pollRef.current = setInterval(() => {
        fetchBatches();
        fetchStats();
        // If we have an expanded batch that's still active, refresh its detail
        if (expandedBatchId) {
          const batch = batches.find((b) => b.batchId === expandedBatchId);
          if (batch && (batch.status === 'queued' || batch.status === 'processing')) {
            fetchBatchDetail(expandedBatchId);
          }
        }
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [batches, expandedBatchId, fetchBatches, fetchStats, fetchBatchDetail]);

  // ----- Debounced contact search -----
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchContacts(contactSearch);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [contactSearch, searchContacts]);

  // ----- Handlers -----

  const handleStartEnrichment = async () => {
    if (selectionMode === 'selected' && selectedContacts.length === 0) {
      toast.error('Please select at least one contact.');
      return;
    }
    if (selectedSources.length === 0) {
      toast.error('Please select at least one data source.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        contactIds: selectionMode === 'all' ? 'all' : selectedContacts.map((c) => c.id),
        sources: selectedSources,
      };

      const { data } = await api.post<BatchSummary>('/enrichment-queue/start', payload);

      toast.success(`Enrichment started for ${data.total} contacts.`);
      setShowStartPanel(false);
      setSelectedContacts([]);
      setContactSearch('');
      fetchBatches();
      fetchStats();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to start enrichment.')
          : 'Failed to start enrichment.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async (batchId: string) => {
    try {
      await api.post(`/enrichment-queue/${batchId}/retry`);
      toast.success('Retrying failed contacts.');
      fetchBatches();
      if (expandedBatchId === batchId) {
        fetchBatchDetail(batchId);
      }
    } catch {
      toast.error('Failed to retry. Please try again.');
    }
  };

  const handleCancel = async (batchId: string) => {
    try {
      await api.post(`/enrichment-queue/${batchId}/cancel`);
      toast.success('Batch cancelled.');
      fetchBatches();
      fetchStats();
    } catch {
      toast.error('Failed to cancel batch.');
    }
  };

  const handleExpandBatch = (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      setBatchDetail(null);
    } else {
      setExpandedBatchId(batchId);
      fetchBatchDetail(batchId);
    }
  };

  const toggleSource = (source: string) => {
    setSelectedSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source],
    );
  };

  const addContact = (contact: ContactOption) => {
    if (!selectedContacts.find((c) => c.id === contact.id)) {
      setSelectedContacts((prev) => [...prev, contact]);
    }
    setContactSearch('');
    setContactResults([]);
  };

  const removeContact = (contactId: string) => {
    setSelectedContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  const handleDownloadCsv = (detail: BatchDetail) => {
    const headers = ['Contact Name', 'Email', 'Status', 'Fields Enriched', 'Error'];
    const rows = detail.contacts.map((c) => [
      c.contactName,
      c.contactEmail || '',
      c.status,
      c.fieldsEnriched.join('; '),
      c.error || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `enrichment-batch-${detail.batchId.slice(0, 8)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ----- Derived state -----
  const activeBatches = batches.filter(
    (b) => b.status === 'queued' || b.status === 'processing',
  );
  const historyBatches = batches.filter(
    (b) => b.status === 'completed' || b.status === 'cancelled',
  );

  const estimatedCredits =
    selectionMode === 'all'
      ? 'All contacts'
      : `${selectedContacts.length} contact${selectedContacts.length !== 1 ? 's' : ''}`;

  // ----- Render -----
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contact Enrichment</h1>
          <p className="text-sm text-gray-500 mt-1">
            Bulk enrich contacts with data from multiple sources
          </p>
        </div>
        <button
          onClick={() => setShowStartPanel(!showStartPanel)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Start Enrichment
        </button>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Enriched"
            value={stats.totalEnrichedAllTime.toLocaleString()}
            sublabel="all time"
          />
          <StatCard
            label="Success Rate"
            value={`${stats.overallSuccessRate}%`}
            sublabel="overall"
          />
          <StatCard
            label="Avg Duration"
            value={stats.averageEnrichmentTimeMs > 0 ? formatDuration(stats.averageEnrichmentTimeMs) : '--'}
            sublabel="per batch"
          />
          <StatCard
            label="Active Batches"
            value={String(stats.activeBatches)}
            sublabel="in progress"
          />
        </div>
      )}

      {/* Start Enrichment Panel */}
      {showStartPanel && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Start Enrichment</h2>

          {/* Contact selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Contact Selection</label>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="selectionMode"
                  checked={selectionMode === 'all'}
                  onChange={() => setSelectionMode('all')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">All contacts</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="selectionMode"
                  checked={selectionMode === 'selected'}
                  onChange={() => setSelectionMode('selected')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Selected contacts</span>
              </label>
            </div>

            {selectionMode === 'selected' && (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search contacts by name or email..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {isSearching && (
                    <div className="absolute right-3 top-2.5">
                      <Spinner size="sm" />
                    </div>
                  )}
                  {contactResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {contactResults.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => addContact(contact)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                        >
                          <span className="font-medium text-gray-900">
                            {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown'}
                          </span>
                          {contact.email && (
                            <span className="ml-2 text-gray-500">{contact.email}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected contacts chips */}
                {selectedContacts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedContacts.map((contact) => (
                      <span
                        key={contact.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-full"
                      >
                        {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unknown'}
                        <button
                          onClick={() => removeContact(contact.id)}
                          className="text-indigo-400 hover:text-indigo-700"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data sources */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Data Sources</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SOURCE_OPTIONS.map((source) => (
                <label
                  key={source.value}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedSources.includes(source.value)
                      ? 'border-indigo-300 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedSources.includes(source.value)}
                    onChange={() => toggleSource(source.value)}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{source.label}</span>
                    <p className="text-xs text-gray-500">{source.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Estimated cost */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              <span className="font-medium">Estimated scope:</span> {estimatedCredits} x{' '}
              {selectedSources.length} source{selectedSources.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowStartPanel(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleStartEnrichment}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="border-white border-t-transparent" />
                  Starting...
                </>
              ) : (
                'Start Enrichment'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Active Batches */}
      {activeBatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Active Batches</h2>
          <div className="grid gap-4">
            {activeBatches.map((batch) => (
              <ActiveBatchCard
                key={batch.batchId}
                batch={batch}
                onCancel={() => handleCancel(batch.batchId)}
                onExpand={() => handleExpandBatch(batch.batchId)}
                isExpanded={expandedBatchId === batch.batchId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Batch History */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Batch History</h2>
        {isLoadingBatches ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : historyBatches.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <svg
              className="w-12 h-12 mx-auto text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
              />
            </svg>
            <p className="mt-3 text-sm text-gray-500">
              No enrichment batches yet. Start your first enrichment above.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {historyBatches.map((batch) => (
                  <BatchHistoryRow
                    key={batch.batchId}
                    batch={batch}
                    isExpanded={expandedBatchId === batch.batchId}
                    detail={expandedBatchId === batch.batchId ? batchDetail : null}
                    isLoadingDetail={expandedBatchId === batch.batchId && isLoadingDetail}
                    onExpand={() => handleExpandBatch(batch.batchId)}
                    onRetry={() => handleRetry(batch.batchId)}
                    onDownload={() => {
                      if (batchDetail && expandedBatchId === batch.batchId) {
                        handleDownloadCsv(batchDetail);
                      } else {
                        // Fetch detail first, then download
                        fetchBatchDetail(batch.batchId).then(() => {
                          // Detail will be available after state update
                        });
                        handleExpandBatch(batch.batchId);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400">{sublabel}</p>
    </div>
  );
}

function ActiveBatchCard({
  batch,
  onCancel,
  onExpand,
  isExpanded,
}: {
  batch: BatchSummary;
  onCancel: () => void;
  onExpand: () => void;
  isExpanded: boolean;
}) {
  const progressPercent = batch.total > 0
    ? Math.round(((batch.completed + batch.failed + batch.skipped) / batch.total) * 100)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={batch.status} />
          <span className="text-sm text-gray-500">
            Started {formatDate(batch.createdAt)}
          </span>
          <span className="text-xs text-gray-400">
            Sources: {batch.sources.join(', ')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onExpand}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {isExpanded ? 'Collapse' : 'Details'}
          </button>
          <button
            onClick={onCancel}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>
            {batch.completed + batch.failed + batch.skipped} of {batch.total} completed
          </span>
          <span>{progressPercent}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full flex">
            {batch.completed > 0 && (
              <div
                className="bg-green-500 transition-all duration-300"
                style={{ width: `${(batch.completed / batch.total) * 100}%` }}
              />
            )}
            {batch.failed > 0 && (
              <div
                className="bg-red-500 transition-all duration-300"
                style={{ width: `${(batch.failed / batch.total) * 100}%` }}
              />
            )}
          </div>
        </div>
        <div className="flex gap-4 text-xs">
          <span className="text-green-600">{batch.completed} success</span>
          <span className="text-red-600">{batch.failed} failed</span>
          <span className="text-gray-400">{batch.pending} pending</span>
        </div>
      </div>
    </div>
  );
}

function BatchHistoryRow({
  batch,
  isExpanded,
  detail,
  isLoadingDetail,
  onExpand,
  onRetry,
  onDownload,
}: {
  batch: BatchSummary;
  isExpanded: boolean;
  detail: BatchDetail | null;
  isLoadingDetail: boolean;
  onExpand: () => void;
  onRetry: () => void;
  onDownload: () => void;
}) {
  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onExpand}
      >
        <td className="px-4 py-3 text-sm text-gray-900">{formatDate(batch.createdAt)}</td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {batch.durationMs ? formatDuration(batch.durationMs) : '--'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">{batch.total}</td>
        <td className="px-4 py-3 text-sm">
          <span className={batch.successRate >= 80 ? 'text-green-600' : batch.successRate >= 50 ? 'text-yellow-600' : 'text-red-600'}>
            {batch.successRate}%
          </span>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={batch.status} />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {batch.failed > 0 && (
              <button
                onClick={onRetry}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Retry Failed
              </button>
            )}
            <button
              onClick={onDownload}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              CSV
            </button>
            <button
              onClick={onExpand}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-gray-50">
            {isLoadingDetail ? (
              <div className="flex justify-center py-6">
                <Spinner size="md" />
              </div>
            ) : detail ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Per-Contact Results
                  </p>
                  <span className="text-xs text-gray-400">
                    Batch ID: {detail.batchId.slice(0, 8)}...
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Fields Enriched</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detail.contacts.map((contact) => (
                        <tr key={contact.contactId} className="text-xs">
                          <td className="px-3 py-2 text-gray-900 font-medium">{contact.contactName}</td>
                          <td className="px-3 py-2 text-gray-500">{contact.contactEmail || '--'}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={contact.status} />
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {contact.fieldsEnriched.length > 0
                              ? contact.fieldsEnriched.join(', ')
                              : contact.error || '--'}
                          </td>
                          <td className="px-3 py-2">
                            {contact.status === 'failed' && (
                              <button
                                onClick={() => {
                                  // Individual retry is handled via the batch retry
                                }}
                                className="text-indigo-600 hover:text-indigo-800 font-medium"
                              >
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">No detail available.</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
