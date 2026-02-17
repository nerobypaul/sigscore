import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChangelogEntry {
  date: string;
  time: string;
  title: string;
  content: string;
  status: 'completed' | 'needs-review' | 'blocked' | 'unknown';
}

interface ChangelogResponse {
  entries: ChangelogEntry[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function statusBadge(status: ChangelogEntry['status']) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Shipped
        </span>
      );
    case 'needs-review':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          In Review
        </span>
      );
    case 'blocked':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Blocked
        </span>
      );
    default:
      return null;
  }
}

/**
 * Render markdown-like content to JSX.
 * Handles: **bold**, `code`, - bullet lists, code blocks (```), blank lines.
 */
function renderContent(content: string) {
  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let key = 0;

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      elements.push(
        <pre
          key={key++}
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700 overflow-x-auto my-2 font-mono"
        >
          {codeBlockLines.join('\n')}
        </pre>,
      );
      codeBlockLines = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Skip the Status line (already shown as badge)
    if (line.trim().startsWith('**Status:**')) continue;

    // Blank line
    if (line.trim() === '' || line.trim() === '---') {
      continue;
    }

    // Bullet list item
    if (line.trim().startsWith('- ')) {
      const bulletContent = line.trim().slice(2);
      elements.push(
        <li key={key++} className="text-sm text-gray-600 leading-relaxed ml-4 list-disc">
          {renderInline(bulletContent)}
        </li>,
      );
      continue;
    }

    // Bold section header (e.g., **Task:**, **Changes:**, **Decisions:**)
    const sectionMatch = line.trim().match(/^\*\*(.+?):\*\*\s*(.*)/);
    if (sectionMatch) {
      const label = sectionMatch[1];
      const rest = sectionMatch[2];
      // Skip rendering "Task" label when it has no trailing content (the title already covers it)
      if (label === 'Task' && !rest) continue;
      elements.push(
        <p key={key++} className="text-sm text-gray-700 mt-3 mb-1">
          <span className="font-semibold text-gray-800">{label}:</span>
          {rest ? <> {renderInline(rest)}</> : null}
        </p>,
      );
      continue;
    }

    // Table row (skip table formatting)
    if (line.trim().startsWith('|')) continue;

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-sm text-gray-600 leading-relaxed">
        {renderInline(line.trim())}
      </p>,
    );
  }

  // Flush any remaining code block
  if (inCodeBlock) flushCodeBlock();

  return <div className="space-y-0.5">{elements}</div>;
}

/**
 * Render inline markdown: **bold**, `code`, file paths with --
 */
function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let inlineKey = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code: `text`
    const codeMatch = remaining.match(/`(.+?)`/);

    let firstMatch: { type: 'bold' | 'code'; index: number; full: string; inner: string } | null = null;

    if (boldMatch && boldMatch.index !== undefined) {
      firstMatch = { type: 'bold', index: boldMatch.index, full: boldMatch[0], inner: boldMatch[1] };
    }
    if (codeMatch && codeMatch.index !== undefined) {
      if (!firstMatch || codeMatch.index < firstMatch.index) {
        firstMatch = { type: 'code', index: codeMatch.index, full: codeMatch[0], inner: codeMatch[1] };
      }
    }

    if (!firstMatch) {
      parts.push(remaining);
      break;
    }

    if (firstMatch.index > 0) {
      parts.push(remaining.slice(0, firstMatch.index));
    }

    if (firstMatch.type === 'bold') {
      parts.push(
        <span key={`i-${inlineKey++}`} className="font-semibold text-gray-800">
          {firstMatch.inner}
        </span>,
      );
    } else {
      parts.push(
        <code key={`i-${inlineKey++}`} className="px-1 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-700">
          {firstMatch.inner}
        </code>,
      );
    }

    remaining = remaining.slice(firstMatch.index + firstMatch.full.length);
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Changelog Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

export default function Changelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async (offset: number, append: boolean) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const { data } = await api.get<ChangelogResponse>('/changelog', {
        params: { limit: PAGE_SIZE, offset },
      });
      if (append) {
        setEntries((prev) => [...prev, ...data.entries]);
      } else {
        setEntries(data.entries);
      }
      setTotal(data.total);
      setError(null);
    } catch {
      setError('Failed to load changelog. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(0, false);
  }, [fetchEntries]);

  const handleLoadMore = () => {
    fetchEntries(entries.length, true);
  };

  const hasMore = entries.length < total;

  // Group entries by date for timeline rendering
  const grouped: { date: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const last = grouped[grouped.length - 1];
    if (last && last.date === entry.date) {
      last.entries.push(entry);
    } else {
      grouped.push({ date: entry.date, entries: [entry] });
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <PublicNav />

      {/* Hero Header */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-16 pb-12 sm:pb-16 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-gray-300">Product Updates</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            What&apos;s New
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
            See what we&apos;ve been shipping. Every feature, improvement, and fix — documented as it happens.
          </p>
          {!loading && total > 0 && (
            <p className="mt-3 text-sm text-gray-500">
              {total} update{total !== 1 ? 's' : ''} and counting
            </p>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="bg-white text-gray-900 min-h-[60vh]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-3">
                <svg className="animate-spin w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-gray-500">Loading changelog...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="text-center py-20">
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={() => fetchEntries(0, false)}
                className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && entries.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No updates yet</h3>
              <p className="text-gray-500">Check back soon for product updates.</p>
            </div>
          )}

          {/* Timeline */}
          {!loading && !error && grouped.length > 0 && (
            <div className="space-y-12">
              {grouped.map((group) => (
                <div key={group.date} className="relative">
                  {/* Date header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex-shrink-0 w-3 h-3 rounded-full bg-indigo-600 ring-4 ring-indigo-100" />
                    <h2 className="text-lg font-bold text-gray-900">
                      {formatDate(group.date)}
                    </h2>
                  </div>

                  {/* Entries for this date */}
                  <div className="ml-1.5 border-l-2 border-gray-200 pl-8 space-y-6">
                    {group.entries.map((entry, idx) => (
                      <div
                        key={`${entry.date}-${entry.time}-${idx}`}
                        className="relative bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200"
                      >
                        {/* Timeline dot */}
                        <div className="absolute -left-[2.3rem] top-7 w-2.5 h-2.5 rounded-full bg-gray-300 ring-4 ring-white" />

                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-gray-900 leading-snug">
                              {entry.title}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">
                              {entry.time}
                            </p>
                          </div>
                          {statusBadge(entry.status)}
                        </div>

                        {/* Content */}
                        <div className="mt-3">
                          {renderContent(entry.content)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load More */}
          {!loading && hasMore && (
            <div className="text-center mt-12">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    Load older updates
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
