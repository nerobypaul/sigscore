import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface SearchResult {
  type: 'contact' | 'company' | 'deal' | 'signal';
  id: string;
  title: string;
  subtitle?: string;
  score: number;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

const TYPE_ICONS: Record<string, string> = {
  contact: 'C',
  company: 'B',
  deal: 'D',
  signal: 'S',
};

const TYPE_COLORS: Record<string, string> = {
  contact: 'bg-blue-100 text-blue-700',
  company: 'bg-emerald-100 text-emerald-700',
  deal: 'bg-purple-100 text-purple-700',
  signal: 'bg-amber-100 text-amber-700',
};

const TYPE_ROUTES: Record<string, string> = {
  contact: '/contacts',
  company: '/companies',
  deal: '/deals',
  signal: '/signals',
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input when open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get<SearchResponse>('/search', {
          params: { q: query, limit: 10 },
        });
        setResults(data.results);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      const base = TYPE_ROUTES[result.type] || '/';
      if (result.type === 'contact' || result.type === 'company') {
        navigate(`${base}/${result.id}`);
      } else {
        navigate(base);
      }
    },
    [navigate],
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      navigateToResult(results[selectedIndex]);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <span>Search...</span>
        <kbd className="hidden sm:inline text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
          {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search contacts, companies, deals..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {loading && <Spinner />}
          <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.map((result, i) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => navigateToResult(result)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === selectedIndex ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0 ${TYPE_COLORS[result.type]}`}>
                  {TYPE_ICONS[result.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{result.title}</p>
                  {result.subtitle && (
                    <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 capitalize flex-shrink-0">{result.type}</span>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.length >= 2 && !loading && results.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">No results found for "{query}"</p>
          </div>
        )}

        {/* Initial state */}
        {query.length < 2 && (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-400">Type at least 2 characters to search</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
