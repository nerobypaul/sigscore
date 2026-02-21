import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import type { IntegrationMeta, SignalSource, IntegrationCategory } from '../types';

const CATEGORY_COLORS: Record<IntegrationCategory, { bg: string; text: string; dot: string }> = {
  'Developer Activity': { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  'Package Registry': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Analytics': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  'CRM': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Communication': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  'Community': { bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  'Custom': { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400' },
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-500',
  PAUSED: 'bg-yellow-500',
  ERROR: 'bg-red-500',
};

const ALL_CATEGORIES: IntegrationCategory[] = [
  'Developer Activity',
  'Package Registry',
  'Analytics',
  'CRM',
  'Communication',
  'Community',
  'Custom',
];

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return n.toLocaleString();
}

interface MergedIntegration {
  meta: IntegrationMeta;
  source: SignalSource | null;
}

export default function Integrations() {
  const [catalog, setCatalog] = useState<IntegrationMeta[]>([]);
  const [sources, setSources] = useState<SignalSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'All'>('All');

  useEffect(() => {
    document.title = 'Integrations — Sigscore';
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [catalogRes, sourcesRes] = await Promise.all([
          api.get<{ integrations: IntegrationMeta[] }>('/sources/catalog'),
          api.get<{ sources: SignalSource[] }>('/sources'),
        ]);
        if (!cancelled) {
          setCatalog(catalogRes.data.integrations);
          setSources(sourcesRes.data.sources);
        }
      } catch {
        // Silently handle — the page shows empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const sourceMap = useMemo(() => {
    const map = new Map<string, SignalSource>();
    for (const s of sources) {
      map.set(s.type, s);
    }
    return map;
  }, [sources]);

  const merged: MergedIntegration[] = useMemo(() => {
    return catalog.map((meta) => ({
      meta,
      source: sourceMap.get(meta.type) || null,
    }));
  }, [catalog, sourceMap]);

  const filtered = useMemo(() => {
    return merged.filter((item) => {
      const matchesSearch =
        search === '' ||
        item.meta.name.toLowerCase().includes(search.toLowerCase()) ||
        item.meta.description.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        activeCategory === 'All' || item.meta.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [merged, search, activeCategory]);

  // Stats
  const connectedCount = sources.filter((s) => s.status === 'ACTIVE' || s.status === 'PAUSED').length;
  const totalRecentSignals = sources.reduce((sum, s) => sum + s.recentSignals, 0);
  const errorCount = sources.filter((s) => s.status === 'ERROR').length;

  if (loading) {
    return (
      <div className="p-6 lg:p-10">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-4 bg-gray-200 rounded w-80" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect your developer tools and data sources
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{connectedCount}</p>
              <p className="text-xs text-gray-500">Connected</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{formatNumber(totalRecentSignals)}</p>
              <p className="text-xs text-gray-500">Signals this week</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${errorCount > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <svg className={`w-5 h-5 ${errorCount > 0 ? 'text-red-600' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{errorCount}</p>
              <p className="text-xs text-gray-500">Errors</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search + Category filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search integrations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
          />
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('All')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === 'All'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const colors = CATEGORY_COLORS[cat];
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? `${colors.bg} ${colors.text} ring-1 ring-current`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <p className="text-sm text-gray-500">No integrations match your search</p>
          <button
            onClick={() => { setSearch(''); setActiveCategory('All'); }}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(({ meta, source }) => {
            const catColors = CATEGORY_COLORS[meta.category];
            const isConnected = source !== null;
            return (
              <Link
                key={meta.type}
                to={`/integrations/${meta.type.toLowerCase()}`}
                className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 hover:shadow-md transition-all duration-200"
              >
                {/* Top row: icon + status */}
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-11 h-11 rounded-xl ${catColors.bg} flex items-center justify-center flex-shrink-0`}>
                    <span className={`text-lg font-bold ${catColors.text}`}>
                      {meta.name[0]}
                    </span>
                  </div>
                  {isConnected ? (
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[source.status] || 'bg-gray-300'}`} />
                      <span className="text-xs font-medium text-green-700">Connected</span>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-gray-400">Available</span>
                  )}
                </div>

                {/* Name */}
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {meta.name}
                </h3>

                {/* Description */}
                <p className="mt-1 text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {meta.description}
                </p>

                {/* Bottom row: category + stats */}
                <div className="mt-4 flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${catColors.bg} ${catColors.text}`}>
                    {meta.category}
                  </span>
                  {isConnected && (
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                        {formatNumber(source._count.signals)}
                      </span>
                      {source.lastSyncAt && (
                        <span>{formatRelativeTime(source.lastSyncAt)}</span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
