import { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../lib/api';
import type { Signal, Activity, ActivityType, SignalSourceType } from '../types';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEntry {
  id: string;
  kind: 'signal' | 'activity';
  date: string;
  title: string;
  description: string | null;
  icon: React.ReactNode;
  iconBg: string;
  source?: string;
  activityType?: ActivityType;
  signalSource?: SignalSourceType | string;
  metadata?: Record<string, unknown>;
}

interface ActivityTimelineProps {
  contactId: string;
}

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
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// ---------------------------------------------------------------------------
// Signal source icons (inline SVG to avoid external dependencies)
// ---------------------------------------------------------------------------

function GitHubIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function NpmIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331z" />
    </svg>
  );
}

function WebsiteIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  );
}

function SegmentIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.3 6h7.2c.3 0 .5.2.5.5s-.2.5-.5.5h-7.2c-.3 0-.5-.2-.5-.5s.2-.5.5-.5zM3.5 17h7.2c.3 0 .5.2.5.5s-.2.5-.5.5H3.5c-.3 0-.5-.2-.5-.5s.2-.5.5-.5zM12 2C6.5 2 2 6.5 2 12h1c0-5 4-9 9-9s9 4 9 9h1c0-5.5-4.5-10-10-10zm0 20c5.5 0 10-4.5 10-10h-1c0 5-4 9-9 9s-9-4-9-9H2c0 5.5 4.5 10 10 10z" />
    </svg>
  );
}

function ApiIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h.01" />
      <path d="M7 20v-4" />
      <path d="M12 20v-8" />
      <path d="M17 20V8" />
      <path d="M22 4v16" />
    </svg>
  );
}

// Activity type icons

function EmailIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function MeetingIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function TaskIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Icon/color mapping
// ---------------------------------------------------------------------------

function getSignalSourceIcon(source?: string | null): React.ReactNode {
  const s = (source || '').toUpperCase();
  if (s.includes('GITHUB')) return <GitHubIcon />;
  if (s.includes('NPM') || s.includes('PYPI')) return <NpmIcon />;
  if (s.includes('WEBSITE') || s.includes('DOCS')) return <WebsiteIcon />;
  if (s.includes('SEGMENT')) return <SegmentIcon />;
  if (s.includes('API') || s.includes('PRODUCT')) return <ApiIcon />;
  return <SignalIcon />;
}

function getSignalSourceBg(source?: string | null): string {
  const s = (source || '').toUpperCase();
  if (s.includes('GITHUB')) return 'bg-gray-900 text-white';
  if (s.includes('NPM')) return 'bg-red-600 text-white';
  if (s.includes('PYPI')) return 'bg-blue-600 text-white';
  if (s.includes('WEBSITE') || s.includes('DOCS')) return 'bg-emerald-500 text-white';
  if (s.includes('SEGMENT')) return 'bg-green-600 text-white';
  if (s.includes('API') || s.includes('PRODUCT')) return 'bg-violet-600 text-white';
  return 'bg-amber-500 text-white';
}

function getActivityIcon(type: ActivityType): React.ReactNode {
  switch (type) {
    case 'EMAIL':
      return <EmailIcon />;
    case 'CALL':
      return <PhoneIcon />;
    case 'MEETING':
      return <MeetingIcon />;
    case 'NOTE':
      return <NoteIcon />;
    case 'TASK':
      return <TaskIcon />;
    default:
      return <NoteIcon />;
  }
}

function getActivityBg(type: ActivityType): string {
  switch (type) {
    case 'EMAIL':
      return 'bg-blue-500 text-white';
    case 'CALL':
      return 'bg-green-500 text-white';
    case 'MEETING':
      return 'bg-purple-500 text-white';
    case 'NOTE':
      return 'bg-yellow-500 text-white';
    case 'TASK':
      return 'bg-indigo-500 text-white';
    default:
      return 'bg-gray-500 text-white';
  }
}

const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  EMAIL: 'Email',
  CALL: 'Call',
  MEETING: 'Meeting',
  NOTE: 'Note',
  TASK: 'Task',
};

function formatSignalType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Pagination state
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityTimeline({ contactId }: ActivityTimelineProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [signalPage, setSignalPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [hasMoreSignals, setHasMoreSignals] = useState(true);
  const [hasMoreActivities, setHasMoreActivities] = useState(true);
  const [filter, setFilter] = useState<'all' | 'signals' | 'activities'>('all');

  // Fetch initial data
  useEffect(() => {
    setLoadingInitial(true);
    setSignals([]);
    setActivities([]);
    setSignalPage(1);
    setActivityPage(1);
    setHasMoreSignals(true);
    setHasMoreActivities(true);

    const fetchSignals = api
      .get('/signals', { params: { actorId: contactId, limit: PAGE_SIZE, page: 1 } })
      .then(({ data }) => {
        const items = data.signals || [];
        setSignals(items);
        setHasMoreSignals(items.length >= PAGE_SIZE);
      })
      .catch(() => setSignals([]));

    const fetchActivities = api
      .get('/activities', { params: { contactId, limit: PAGE_SIZE, page: 1 } })
      .then(({ data }) => {
        const items = data.activities || [];
        setActivities(items);
        setHasMoreActivities(items.length >= PAGE_SIZE);
      })
      .catch(() => setActivities([]));

    Promise.all([fetchSignals, fetchActivities]).finally(() => setLoadingInitial(false));
  }, [contactId]);

  // Load more handler
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);

    const promises: Promise<void>[] = [];

    if (hasMoreSignals && (filter === 'all' || filter === 'signals')) {
      const nextPage = signalPage + 1;
      promises.push(
        api
          .get('/signals', { params: { actorId: contactId, limit: PAGE_SIZE, page: nextPage } })
          .then(({ data }) => {
            const items = data.signals || [];
            setSignals((prev) => [...prev, ...items]);
            setSignalPage(nextPage);
            setHasMoreSignals(items.length >= PAGE_SIZE);
          })
          .catch(() => setHasMoreSignals(false)),
      );
    }

    if (hasMoreActivities && (filter === 'all' || filter === 'activities')) {
      const nextPage = activityPage + 1;
      promises.push(
        api
          .get('/activities', { params: { contactId, limit: PAGE_SIZE, page: nextPage } })
          .then(({ data }) => {
            const items = data.activities || [];
            setActivities((prev) => [...prev, ...items]);
            setActivityPage(nextPage);
            setHasMoreActivities(items.length >= PAGE_SIZE);
          })
          .catch(() => setHasMoreActivities(false)),
      );
    }

    await Promise.all(promises);
    setLoadingMore(false);
  }, [loadingMore, hasMoreSignals, hasMoreActivities, signalPage, activityPage, contactId, filter]);

  // Merge into unified timeline
  const timelineEntries: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [];

    if (filter === 'all' || filter === 'signals') {
      for (const s of signals) {
        const sourceName = s.source?.name || s.source?.type || '';
        const sourceType = s.source?.type || '';
        entries.push({
          id: `signal-${s.id}`,
          kind: 'signal',
          date: s.timestamp,
          title: formatSignalType(s.type),
          description: buildSignalDescription(s),
          icon: getSignalSourceIcon(sourceType || sourceName),
          iconBg: getSignalSourceBg(sourceType || sourceName),
          source: sourceName,
          signalSource: sourceType,
          metadata: s.metadata,
        });
      }
    }

    if (filter === 'all' || filter === 'activities') {
      for (const a of activities) {
        entries.push({
          id: `activity-${a.id}`,
          kind: 'activity',
          date: a.createdAt,
          title: a.title,
          description: a.description || null,
          icon: getActivityIcon(a.type),
          iconBg: getActivityBg(a.type),
          activityType: a.type,
        });
      }
    }

    // Sort newest first
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return entries;
  }, [signals, activities, filter]);

  const hasMore =
    (filter === 'all' && (hasMoreSignals || hasMoreActivities)) ||
    (filter === 'signals' && hasMoreSignals) ||
    (filter === 'activities' && hasMoreActivities);

  // Group entries by day for section headers
  const groupedEntries = useMemo(() => {
    const groups: Array<{ date: string; entries: TimelineEntry[] }> = [];
    for (const entry of timelineEntries) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && isSameDay(lastGroup.date, entry.date)) {
        lastGroup.entries.push(entry);
      } else {
        groups.push({ date: entry.date, entries: [entry] });
      }
    }
    return groups;
  }, [timelineEntries]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Activity Timeline</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'signals', 'activities'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                filter === f
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f === 'signals' ? 'Signals' : 'Activities'}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loadingInitial ? (
        <div className="flex justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : timelineEntries.length === 0 ? (
        /* Empty state */
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-3">
            <svg
              className="w-6 h-6 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">No activity yet</p>
          <p className="text-xs text-gray-500 max-w-xs mx-auto">
            Signals from GitHub, npm, and other sources will appear here as they are captured.
            Activities like emails, calls, and notes will also show up in this timeline.
          </p>
        </div>
      ) : (
        /* Timeline */
        <div className="relative">
          {groupedEntries.map((group, groupIdx) => (
            <div key={group.date}>
              {/* Day separator */}
              <div className="flex items-center gap-3 mb-3 mt-1">
                <div className="text-xs font-medium text-gray-500">{formatDate(group.date)}</div>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Entries for this day */}
              <div className="relative ml-4 pl-6 border-l-2 border-gray-100">
                {group.entries.map((entry, entryIdx) => {
                  const isLast =
                    groupIdx === groupedEntries.length - 1 &&
                    entryIdx === group.entries.length - 1;
                  return (
                    <div
                      key={entry.id}
                      className={`relative ${isLast ? '' : 'pb-5'}`}
                    >
                      {/* Timeline node */}
                      <div
                        className={`absolute -left-[calc(0.5rem+13px)] top-0.5 flex items-center justify-center w-6 h-6 rounded-full ${entry.iconBg} ring-4 ring-white`}
                      >
                        {entry.icon}
                      </div>

                      {/* Content */}
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 leading-snug">
                              {entry.title}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {entry.kind === 'signal' && entry.source && (
                                <span className="inline-flex items-center text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                  {entry.source}
                                </span>
                              )}
                              {entry.kind === 'activity' && entry.activityType && (
                                <span className="inline-flex items-center text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
                                  {ACTIVITY_TYPE_LABELS[entry.activityType]}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                            {timeAgo(entry.date)}
                          </span>
                        </div>
                        {entry.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {entry.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center mt-4 pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Spinner size="sm" />
                    Loading...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    Load more
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Build a human-readable description from signal metadata
// ---------------------------------------------------------------------------

function buildSignalDescription(signal: Signal): string | null {
  const meta = signal.metadata || {};

  // Common metadata fields
  if (meta.repo && meta.action) {
    return `${meta.action} on ${meta.repo}`;
  }
  if (meta.repository) {
    return `Repository: ${meta.repository}`;
  }
  if (meta.package_name || meta.packageName) {
    const pkg = (meta.package_name || meta.packageName) as string;
    const version = meta.version ? ` v${meta.version}` : '';
    return `Package: ${pkg}${version}`;
  }
  if (meta.url || meta.page) {
    return `${meta.url || meta.page}`;
  }
  if (meta.description) {
    return String(meta.description);
  }
  if (meta.message) {
    return String(meta.message);
  }
  if (meta.title) {
    return String(meta.title);
  }

  // Account name as fallback
  if (signal.account?.name) {
    return signal.account.name;
  }

  return null;
}
