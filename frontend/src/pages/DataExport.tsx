import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportRecord {
  jobId: string;
  organizationId: string;
  userId: string;
  format: 'json' | 'csv';
  entities: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileName?: string;
  totalRecords?: number;
  recordCounts?: Record<string, number>;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

const ENTITY_OPTIONS = [
  { value: 'contacts', label: 'Contacts' },
  { value: 'companies', label: 'Companies' },
  { value: 'signals', label: 'Signals' },
  { value: 'deals', label: 'Deals' },
  { value: 'activities', label: 'Activities' },
] as const;

const FORMAT_OPTIONS = [
  { value: 'json' as const, label: 'JSON' },
  { value: 'csv' as const, label: 'CSV' },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataExport() {
  useEffect(() => { document.title = 'Data Export — DevSignal'; }, []);
  const toast = useToast();

  // Form state
  const [selectedEntities, setSelectedEntities] = useState<string[]>([
    'contacts',
    'companies',
  ]);
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Export history
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Polling for in-progress exports
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----- Fetch export history -----
  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await api.get<{ exports: ExportRecord[] }>('/exports');
      setExports(data.exports);
    } catch {
      // Silently fail on history fetch; user can retry
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // ----- Poll for in-progress exports -----
  useEffect(() => {
    const hasInProgress = exports.some(
      (e) => e.status === 'pending' || e.status === 'processing',
    );

    if (hasInProgress && !pollRef.current) {
      pollRef.current = setInterval(() => {
        fetchHistory();
      }, 3000);
    } else if (!hasInProgress && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [exports, fetchHistory]);

  // ----- Entity checkbox toggle -----
  const toggleEntity = (entity: string) => {
    setSelectedEntities((prev) =>
      prev.includes(entity)
        ? prev.filter((e) => e !== entity)
        : [...prev, entity],
    );
  };

  // ----- Select/deselect all -----
  const toggleAll = () => {
    if (selectedEntities.length === ENTITY_OPTIONS.length) {
      setSelectedEntities([]);
    } else {
      setSelectedEntities(ENTITY_OPTIONS.map((o) => o.value));
    }
  };

  // ----- Start export -----
  const handleStartExport = async () => {
    if (selectedEntities.length === 0) {
      toast.error('Please select at least one entity to export.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ jobId: string; status: string }>('/exports', {
        format,
        entities: selectedEntities,
      });

      toast.success(`Export job started (ID: ${data.jobId.slice(0, 8)}...)`);

      // Add the new export to the top of the list
      setExports((prev) => [
        {
          jobId: data.jobId,
          organizationId: '',
          userId: '',
          format,
          entities: [...selectedEntities],
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch {
      toast.error('Failed to start export. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----- Download -----
  const handleDownload = async (jobId: string, fileName?: string) => {
    try {
      const response = await api.get(`/exports/${jobId}/download`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data as BlobPart]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'devsignal-export';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error('Failed to download export file.');
    }
  };

  // ----- Helpers -----
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const statusBadge = (status: ExportRecord['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}
      >
        {(status === 'pending' || status === 'processing') && (
          <Spinner size="sm" className="mr-1" />
        )}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  // ----- Render -----
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Data Export</h1>
        <p className="mt-1 text-sm text-gray-500">
          Export your organization data for compliance, backup, or migration
          purposes. Exports are processed in the background and available for
          download when complete.
        </p>
      </div>

      {/* Export Configuration Card */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          New Export
        </h2>

        {/* Entity Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
              Select Entities
            </label>
            <button
              type="button"
              onClick={toggleAll}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              {selectedEntities.length === ENTITY_OPTIONS.length
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ENTITY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedEntities.includes(opt.value)
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedEntities.includes(opt.value)}
                  onChange={() => toggleEntity(opt.value)}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Format Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Export Format
          </label>
          <div className="flex gap-4">
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  format === opt.value
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={opt.value}
                  checked={format === opt.value}
                  onChange={() => setFormat(opt.value)}
                  className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  {opt.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Start Export Button */}
        <button
          type="button"
          onClick={handleStartExport}
          disabled={isSubmitting || selectedEntities.length === 0}
          className="inline-flex items-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2 border-white border-t-transparent" />
              Starting Export...
            </>
          ) : (
            <>
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Start Export
            </>
          )}
        </button>
      </div>

      {/* Export History */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Export History
          </h2>
        </div>

        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : exports.length === 0 ? (
          <div className="text-center py-12 px-6">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No exports yet
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Create your first export using the form above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entities
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Format
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Records
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {exports.map((exp) => (
                  <tr key={exp.jobId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(exp.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-wrap gap-1">
                        {exp.entities.map((entity) => (
                          <span
                            key={entity}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                          >
                            {entity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                      {exp.format}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {exp.totalRecords != null
                        ? exp.totalRecords.toLocaleString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {exp.sizeBytes != null ? formatBytes(exp.sizeBytes) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(exp.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {exp.status === 'completed' ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleDownload(exp.jobId, exp.fileName)
                          }
                          className="text-indigo-600 hover:text-indigo-500 font-medium"
                        >
                          Download
                        </button>
                      ) : exp.status === 'failed' ? (
                        <span
                          className="text-red-500 text-xs"
                          title={exp.error}
                        >
                          {exp.error
                            ? exp.error.length > 40
                              ? exp.error.slice(0, 40) + '...'
                              : exp.error
                            : 'Failed'}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">
                          Processing...
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
