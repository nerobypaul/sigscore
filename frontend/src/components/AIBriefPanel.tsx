import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Brief {
  id: string;
  content: string;
  generatedAt: string;
  validUntil: string;
}

interface AIBriefPanelProps {
  accountId: string;
}

// ---------------------------------------------------------------------------
// Simple Markdown renderer (handles headers, bold, lists, paragraphs)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string): JSX.Element {
  const lines = md.split('\n');
  const elements: JSX.Element[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  function flushList() {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 text-sm text-gray-700 my-2">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  }

  function renderInline(text: string): JSX.Element {
    // Handle bold (**text**) and inline code (`text`)
    const parts: JSX.Element[] = [];
    let remaining = text;
    let partKey = 0;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(<span key={partKey++}>{remaining.slice(0, boldMatch.index)}</span>);
        }
        parts.push(<strong key={partKey++} className="font-semibold text-gray-900">{boldMatch[1]}</strong>);
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
        continue;
      }
      // No more matches
      parts.push(<span key={partKey++}>{remaining}</span>);
      break;
    }

    return <>{parts}</>;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Headings
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-base font-semibold text-gray-900 mt-4 mb-1">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={key++} className="text-sm font-semibold text-gray-800 mt-3 mb-1">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-gray-900 mt-4 mb-2">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      continue;
    }

    // List items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2));
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^\d+\.\s/, ''));
      continue;
    }

    // Empty line
    if (trimmed === '') {
      flushList();
      continue;
    }

    // Paragraph
    flushList();
    elements.push(
      <p key={key++} className="text-sm text-gray-700 my-1.5 leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  }

  flushList();
  return <>{elements}</>;
}

// ---------------------------------------------------------------------------
// Freshness helpers
// ---------------------------------------------------------------------------

function isFresh(brief: Brief): boolean {
  return new Date(brief.validUntil) > new Date();
}

function formatGeneratedAt(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIBriefPanel({ accountId }: AIBriefPanelProps) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState('');

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/ai/brief/${accountId}`);
      setBrief(data.brief || data);
      setFetched(true);
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (statusCode === 402) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else if (msg?.includes('ANTHROPIC_API_KEY') || msg?.includes('API key not configured')) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else if (msg?.includes('not found')) {
        setError('Account not found.');
      } else {
        setError(msg || 'Failed to fetch brief.');
      }
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  const generateBrief = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/ai/brief/${accountId}`);
      setBrief(data);
      setFetched(true);
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (statusCode === 402) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else if (msg?.includes('ANTHROPIC_API_KEY') || msg?.includes('API key not configured')) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else {
        setError(msg || 'Failed to generate brief.');
      }
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  // Auto-fetch on first view
  if (!fetched && !loading) {
    fetchBrief();
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">AI Account Brief</h3>
          {brief && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isFresh(brief)
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              {isFresh(brief) ? 'Fresh' : 'Stale'} -- Generated {formatGeneratedAt(brief.generatedAt)}
            </span>
          )}
        </div>
        <button
          onClick={generateBrief}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
        >
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          )}
          {brief ? 'Regenerate' : 'Generate Brief'}
        </button>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {loading && !brief && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Spinner size="lg" />
            <p className="text-sm text-gray-500">Generating AI brief...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
            {error.includes('Configure it in Settings') && (
              <Link
                to="/settings"
                className="ml-2 text-red-800 underline hover:text-red-900 font-medium"
              >
                Go to Settings
              </Link>
            )}
          </div>
        )}

        {brief && !loading && (
          <div className="prose-sm">
            {renderMarkdown(brief.content)}
          </div>
        )}

        {!brief && !loading && !error && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <p className="text-sm text-gray-500 mb-3">No AI brief has been generated for this account yet.</p>
            <button
              onClick={generateBrief}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Generate Brief
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
