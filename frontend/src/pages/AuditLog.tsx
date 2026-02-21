import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'invite', label: 'Invite' },
  { value: 'role_change', label: 'Role Change' },
  { value: 'remove', label: 'Remove' },
  { value: 'transfer_ownership', label: 'Transfer Ownership' },
  { value: 'export', label: 'Export' },
];

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All Entity Types' },
  { value: 'contact', label: 'Contact' },
  { value: 'company', label: 'Company' },
  { value: 'deal', label: 'Deal' },
  { value: 'workflow', label: 'Workflow' },
  { value: 'api_key', label: 'API Key' },
  { value: 'member', label: 'Member' },
];

const ACTION_BADGE_STYLES: Record<string, string> = {
  create: 'bg-green-50 text-green-700 border-green-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
  login: 'bg-gray-100 text-gray-700 border-gray-200',
  invite: 'bg-purple-50 text-purple-700 border-purple-200',
  role_change: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  remove: 'bg-red-50 text-red-700 border-red-200',
  transfer_ownership: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  export: 'bg-amber-50 text-amber-700 border-amber-200',
};

const DEFAULT_BADGE_STYLE = 'bg-gray-100 text-gray-700 border-gray-200';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'Just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getEntityLink(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  const routes: Record<string, string> = {
    contact: `/contacts/${entityId}`,
    company: `/companies/${entityId}`,
    deal: `/deals/${entityId}`,
  };
  return routes[entityType] ?? null;
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ---------------------------------------------------------------------------
// Changes Diff component
// ---------------------------------------------------------------------------

function ChangesDiff({
  changes,
}: {
  changes: Record<string, { from: unknown; to: unknown }>;
}) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {entries.map(([field, { from, to }]) => (
        <div key={field} className="text-xs font-mono bg-gray-50 rounded px-2 py-1">
          <span className="text-gray-500">{field}:</span>{' '}
          <span className="text-red-600 line-through">{formatValue(from)}</span>
          {' -> '}
          <span className="text-green-600">{formatValue(to)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AuditLog() {
  useEffect(() => { document.title = 'Audit Log — Sigscore'; }, []);
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filter state
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ---- Fetch logs ----

  const fetchLogs = useCallback(
    async (cursor?: string) => {
      try {
        const params = new URLSearchParams();
        if (actionFilter) params.set('action', actionFilter);
        if (entityTypeFilter) params.set('entityType', entityTypeFilter);
        if (cursor) params.set('cursor', cursor);
        params.set('limit', '50');

        const { data } = await api.get(`/audit?${params.toString()}`);
        if (cursor) {
          setLogs((prev) => [...prev, ...data.auditLogs]);
        } else {
          setLogs(data.auditLogs);
        }
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch {
        toast.error('Failed to load audit logs.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [actionFilter, entityTypeFilter, toast],
  );

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    fetchLogs(nextCursor);
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Audit Log</h1>
        <p className="text-sm text-gray-500">
          Track all changes and actions across your organization for compliance and security.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={entityTypeFilter}
          onChange={(e) => setEntityTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        >
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {(actionFilter || entityTypeFilter) && (
          <button
            onClick={() => {
              setActionFilter('');
              setEntityTypeFilter('');
            }}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Audit log table */}
      {logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
              />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            No audit logs yet
          </h4>
          <p className="text-sm text-gray-500">
            Actions performed in your organization will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Time
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Action
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Entity
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map((log) => {
                  const link = getEntityLink(log.entityType, log.entityId);
                  const isExpanded = expandedId === log.id;
                  const hasChanges =
                    log.changes && Object.keys(log.changes).length > 0;

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Time */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className="text-sm text-gray-600"
                          title={formatFullDate(log.createdAt)}
                        >
                          {relativeTime(log.createdAt)}
                        </span>
                      </td>

                      {/* Action Badge */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                            ACTION_BADGE_STYLES[log.action] ?? DEFAULT_BADGE_STYLE
                          }`}
                        >
                          {formatAction(log.action)}
                        </span>
                      </td>

                      {/* Entity Type */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {log.entityType ? (
                          <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                            {log.entityType}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">--</span>
                        )}
                      </td>

                      {/* Entity Name */}
                      <td className="px-5 py-3.5">
                        {log.entityName ? (
                          link ? (
                            <a
                              href={link}
                              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                            >
                              {log.entityName}
                            </a>
                          ) : (
                            <span className="text-sm text-gray-900">
                              {log.entityName}
                            </span>
                          )
                        ) : log.entityId ? (
                          <span className="text-sm text-gray-500 font-mono text-xs">
                            {log.entityId.slice(0, 12)}...
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">--</span>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-5 py-3.5">
                        {hasChanges ? (
                          <div>
                            <button
                              onClick={() =>
                                setExpandedId(isExpanded ? null : log.id)
                              }
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                            >
                              <svg
                                className={`w-3.5 h-3.5 transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8.25 4.5l7.5 7.5-7.5 7.5"
                                />
                              </svg>
                              {Object.keys(log.changes!).length} field
                              {Object.keys(log.changes!).length !== 1
                                ? 's'
                                : ''}{' '}
                              changed
                            </button>
                            {isExpanded && (
                              <ChangesDiff changes={log.changes!} />
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-100 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loadingMore ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner size="sm" />
                    Loading...
                  </span>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
