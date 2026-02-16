import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import type { Company, Signal, Contact, AccountScore, ScoreTier } from '../types';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup',
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
  ENTERPRISE: 'Enterprise',
};

const TIER_BG: Record<ScoreTier, string> = {
  HOT: 'bg-red-500',
  WARM: 'bg-amber-500',
  COLD: 'bg-blue-500',
  INACTIVE: 'bg-gray-400',
};

const TIER_BG_LIGHT: Record<ScoreTier, string> = {
  HOT: 'bg-red-50 border-red-200 text-red-700',
  WARM: 'bg-amber-50 border-amber-200 text-amber-700',
  COLD: 'bg-blue-50 border-blue-200 text-blue-700',
  INACTIVE: 'bg-gray-50 border-gray-200 text-gray-500',
};

const SCORE_FACTOR_LABELS: Record<string, string> = {
  userCount: 'Users',
  velocity: 'Velocity',
  featureBreadth: 'Feature Breadth',
  engagement: 'Engagement',
  seniority: 'Seniority',
  firmographic: 'Firmographic',
};

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

function bestIndex(values: (number | null | undefined)[], mode: 'max' | 'min' = 'max'): number {
  let best = -1;
  let bestVal = mode === 'max' ? -Infinity : Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (mode === 'max' ? v > bestVal : v < bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return best;
}

// Only highlight winner if there are at least 2 non-null distinct values
function shouldHighlight(values: (number | null | undefined)[]): boolean {
  const filtered = values.filter((v) => v != null);
  if (filtered.length < 2) return false;
  return new Set(filtered).size > 1;
}

// ---------------------------------------------------------------------------
// Types for fetched company data
// ---------------------------------------------------------------------------

interface CompanyData {
  company: Company;
  contacts: Contact[];
  signals: Signal[];
  score: AccountScore | null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CompanyCompare() {
  const [searchParams] = useSearchParams();
  const ids = useMemo(() => {
    const raw = searchParams.get('ids') || '';
    return raw.split(',').filter(Boolean).slice(0, 4);
  }, [searchParams]);

  const [data, setData] = useState<Map<string, CompanyData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (ids.length < 2) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrors([]);

    const fetchAll = async () => {
      const results = new Map<string, CompanyData>();
      const errs: string[] = [];

      await Promise.all(
        ids.map(async (id) => {
          try {
            const [companyRes, contactsRes, signalsRes] = await Promise.all([
              api.get(`/companies/${id}`),
              api.get('/contacts', { params: { companyId: id, limit: 100 } }).catch(() => ({ data: { contacts: [] } })),
              api.get('/signals', { params: { accountId: id, limit: 50 } }).catch(() => ({ data: { signals: [] } })),
            ]);

            results.set(id, {
              company: companyRes.data,
              contacts: contactsRes.data.contacts || [],
              signals: signalsRes.data.signals || [],
              score: companyRes.data.score || null,
            });
          } catch {
            errs.push(id);
          }
        })
      );

      setData(results);
      setErrors(errs);
      setLoading(false);
    };

    fetchAll();
  }, [ids]);

  // Ordered list of loaded company data matching the id order
  const companies = useMemo(() => {
    return ids.map((id) => data.get(id)).filter((d): d is CompanyData => !!d);
  }, [ids, data]);

  // ---------------------------------------------------------------------------
  // Invalid state
  // ---------------------------------------------------------------------------

  if (ids.length < 2) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Select companies to compare</h2>
          <p className="text-sm text-gray-500 mb-4">
            Go to the companies list and select 2-4 companies to compare side-by-side.
          </p>
          <Link
            to="/companies"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Go to Companies
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const colCount = companies.length;

  // Grid template columns: label column + company columns
  // On mobile, we switch to a stacked view
  const gridCols =
    colCount === 2
      ? 'grid-cols-[200px_1fr_1fr]'
      : colCount === 3
        ? 'grid-cols-[200px_1fr_1fr_1fr]'
        : 'grid-cols-[200px_1fr_1fr_1fr_1fr]';

  const mobileGridCols =
    colCount === 2
      ? 'grid-cols-[120px_1fr_1fr]'
      : colCount === 3
        ? 'grid-cols-[120px_1fr_1fr_1fr]'
        : 'grid-cols-[120px_1fr_1fr_1fr_1fr]';

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/companies" className="hover:text-gray-700">Companies</Link>
        <span>/</span>
        <span className="text-gray-900">Compare</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Comparison</h1>
          <p className="mt-1 text-sm text-gray-500">
            Comparing {companies.length} companies side-by-side
          </p>
        </div>
        <Link
          to="/companies"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Companies
        </Link>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          {errors.length} company(ies) could not be loaded and will be omitted.
        </div>
      )}

      {companies.length < 2 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-sm text-gray-500">Not enough companies could be loaded for comparison.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* ============================================================ */}
          {/* COMPANY HEADERS                                              */}
          {/* ============================================================ */}
          <div className={`hidden md:grid ${gridCols} border-b border-gray-200`}>
            <div className="p-4 bg-gray-50" />
            {companies.map((cd) => (
              <div key={cd.company.id} className="p-4 bg-gray-50 border-l border-gray-200 text-center">
                <Link to={`/companies/${cd.company.id}`} className="group">
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold mx-auto mb-2 group-hover:bg-emerald-200 transition-colors">
                    {cd.company.name[0]?.toUpperCase()}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                    {cd.company.name}
                  </h3>
                </Link>
                {cd.company.domain && (
                  <p className="text-xs text-gray-500 mt-0.5">{cd.company.domain}</p>
                )}
              </div>
            ))}
          </div>

          {/* Mobile company headers */}
          <div className={`md:hidden grid ${mobileGridCols} border-b border-gray-200`}>
            <div className="p-3 bg-gray-50" />
            {companies.map((cd) => (
              <div key={cd.company.id} className="p-3 bg-gray-50 border-l border-gray-200 text-center">
                <Link to={`/companies/${cd.company.id}`}>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold mx-auto mb-1">
                    {cd.company.name[0]?.toUpperCase()}
                  </div>
                  <h3 className="text-xs font-semibold text-gray-900 truncate">
                    {cd.company.name}
                  </h3>
                </Link>
              </div>
            ))}
          </div>

          {/* ============================================================ */}
          {/* PQA SCORE                                                     */}
          {/* ============================================================ */}
          <SectionHeader label="PQA Score" />
          <CompareRow
            label="Overall Score"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.score?.score ?? null)}
            renderValue={(val, isWinner) => (
              <span className={`text-lg font-bold ${isWinner ? 'text-indigo-600' : 'text-gray-900'}`}>
                {val != null ? val : '--'}
              </span>
            )}
          />
          <CompareRow
            label="Tier"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.score?.tier ?? null)}
            renderValue={(val) => {
              if (!val) return <span className="text-gray-400">--</span>;
              const tier = val as ScoreTier;
              return (
                <span className={`inline-flex items-center text-xs font-semibold uppercase px-2.5 py-1 rounded-full border ${TIER_BG_LIGHT[tier]}`}>
                  {tier}
                </span>
              );
            }}
            compareFn={() => -1}
          />
          <CompareRow
            label="Trend"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.score?.trend ?? null)}
            renderValue={(val) => {
              if (!val) return <span className="text-gray-400">--</span>;
              const colors: Record<string, string> = { RISING: 'text-green-600', STABLE: 'text-gray-500', FALLING: 'text-red-500' };
              const icons: Record<string, string> = { RISING: 'Trending Up', STABLE: 'Stable', FALLING: 'Trending Down' };
              return <span className={`text-xs font-medium ${colors[val as string] || 'text-gray-500'}`}>{icons[val as string] || val}</span>;
            }}
            compareFn={() => -1}
          />

          {/* ============================================================ */}
          {/* KEY METRICS                                                   */}
          {/* ============================================================ */}
          <SectionHeader label="Key Metrics" />
          <CompareRow
            label="Signal Count"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.score?.signalCount ?? cd.signals.length)}
            renderValue={(val, isWinner) => (
              <span className={`text-sm font-semibold ${isWinner ? 'text-indigo-600' : 'text-gray-900'}`}>
                {val != null ? val.toLocaleString() : '0'}
              </span>
            )}
          />
          <CompareRow
            label="Contact Count"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.contacts.length)}
            renderValue={(val, isWinner) => (
              <span className={`text-sm font-semibold ${isWinner ? 'text-indigo-600' : 'text-gray-900'}`}>
                {val != null ? val.toLocaleString() : '0'}
              </span>
            )}
          />
          <CompareRow
            label="User Count"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.score?.userCount ?? null)}
            renderValue={(val, isWinner) => (
              <span className={`text-sm font-semibold ${isWinner ? 'text-indigo-600' : 'text-gray-900'}`}>
                {val != null ? val.toLocaleString() : '--'}
              </span>
            )}
          />
          <CompareRow
            label="Last Signal"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => {
              const d = cd.score?.lastSignalAt || (cd.signals.length > 0 ? cd.signals[0].timestamp : null);
              return d ? new Date(d).getTime() : null;
            })}
            renderValue={(val) => {
              if (val == null) return <span className="text-gray-400">--</span>;
              return <span className="text-sm text-gray-700">{timeAgo(new Date(val as number).toISOString())}</span>;
            }}
            compareFn={() => -1}
          />

          {/* ============================================================ */}
          {/* COMPANY INFO                                                  */}
          {/* ============================================================ */}
          <SectionHeader label="Company Information" />
          <CompareRow
            label="Industry"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.company.industry ?? null)}
            renderValue={(val) => (
              <span className="text-sm text-gray-700">{val || '--'}</span>
            )}
            compareFn={() => -1}
          />
          <CompareRow
            label="Size"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.company.size ?? null)}
            renderValue={(val) => (
              <span className="text-sm text-gray-700">
                {val ? SIZE_LABELS[val as string] || val : '--'}
              </span>
            )}
            compareFn={() => -1}
          />
          <CompareRow
            label="Website"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => cd.company.website ?? null)}
            renderValue={(val) => {
              if (!val) return <span className="text-gray-400">--</span>;
              return (
                <a
                  href={(val as string).startsWith('http') ? val as string : `https://${val}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:text-indigo-500 truncate block"
                >
                  {val as string}
                </a>
              );
            }}
            compareFn={() => -1}
          />
          <CompareRow
            label="Location"
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={companies.map((cd) => {
              const parts = [cd.company.city, cd.company.state, cd.company.country].filter(Boolean);
              return parts.length > 0 ? parts.join(', ') : null;
            })}
            renderValue={(val) => (
              <span className="text-sm text-gray-700">{val || '--'}</span>
            )}
            compareFn={() => -1}
          />

          {/* ============================================================ */}
          {/* SCORE BREAKDOWN                                               */}
          {/* ============================================================ */}
          <SectionHeader label="Score Breakdown" />
          {(['userCount', 'velocity', 'featureBreadth', 'engagement', 'seniority', 'firmographic'] as const).map(
            (factorKey) => {
              const values = companies.map((cd) => {
                const factor = cd.score?.factors?.find(
                  (f) => f.name.toLowerCase().replace(/\s+/g, '') === factorKey.toLowerCase()
                );
                return factor?.value ?? null;
              });

              return (
                <CompareRow
                  key={factorKey}
                  label={SCORE_FACTOR_LABELS[factorKey]}
                  gridCols={gridCols}
                  mobileGridCols={mobileGridCols}
                  values={values}
                  renderValue={(val, isWinner) => {
                    if (val == null) return <span className="text-gray-400">--</span>;
                    const numVal = val as number;
                    const company = companies[0]; // for tier color
                    const tier = company?.score?.tier || 'INACTIVE';
                    return (
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-semibold ${isWinner ? 'text-indigo-600' : 'text-gray-900'}`}>
                            {numVal}
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${isWinner ? 'bg-indigo-500' : TIER_BG[tier] || 'bg-gray-400'}`}
                            style={{ width: `${Math.min(100, Math.max(0, numVal))}%` }}
                          />
                        </div>
                      </div>
                    );
                  }}
                />
              );
            }
          )}

          {/* ============================================================ */}
          {/* SIGNAL BREAKDOWN BY SOURCE                                    */}
          {/* ============================================================ */}
          <SectionHeader label="Signals by Source" />
          <SignalsBySource companies={companies} gridCols={gridCols} mobileGridCols={mobileGridCols} />

          {/* ============================================================ */}
          {/* RECENT SIGNALS                                                */}
          {/* ============================================================ */}
          <SectionHeader label="Recent Signals (Last 5)" />
          <div className={`hidden md:grid ${gridCols}`}>
            <div className="p-4" />
            {companies.map((cd) => (
              <div key={cd.company.id} className="p-4 border-l border-gray-200">
                {cd.signals.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">No signals</p>
                ) : (
                  <div className="space-y-2">
                    {cd.signals.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-start gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50/50">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mt-0.5">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {s.type.replace(/_/g, ' ').replace(/\./g, ' ')}
                          </p>
                          <p className="text-xs text-gray-400">
                            {s.source?.name || 'Unknown'} -- {timeAgo(s.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Mobile recent signals - stacked */}
          <div className="md:hidden">
            {companies.map((cd) => (
              <div key={cd.company.id} className="border-t border-gray-200 p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {cd.company.name}
                </h4>
                {cd.signals.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">No signals</p>
                ) : (
                  <div className="space-y-2">
                    {cd.signals.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 bg-gray-50/50">
                        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate">
                            {s.type.replace(/_/g, ' ').replace(/\./g, ' ')}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(s.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Reusable comparison row
// ===========================================================================

interface CompareRowProps<T = number | string | null> {
  label: string;
  gridCols: string;
  mobileGridCols: string;
  values: (T | null)[];
  renderValue: (value: T | null, isWinner: boolean, index: number) => React.ReactNode;
  /** Return index of the winner. Return -1 to skip highlighting. Default: max numeric value. */
  compareFn?: (values: (T | null)[]) => number;
}

function CompareRow<T = number | string | null>({
  label,
  gridCols,
  mobileGridCols,
  values,
  renderValue,
  compareFn,
}: CompareRowProps<T>) {
  const winnerIdx = compareFn
    ? compareFn(values)
    : (() => {
        const numVals = values.map((v) => (typeof v === 'number' ? v : null));
        if (!shouldHighlight(numVals)) return -1;
        return bestIndex(numVals);
      })();

  return (
    <>
      {/* Desktop */}
      <div className={`hidden md:grid ${gridCols} border-t border-gray-100 hover:bg-gray-50/50 transition-colors`}>
        <div className="p-4 flex items-center">
          <span className="text-sm font-medium text-gray-600">{label}</span>
        </div>
        {values.map((val, i) => (
          <div
            key={i}
            className={`p-4 border-l border-gray-100 flex items-center justify-center ${
              i === winnerIdx ? 'bg-indigo-50/50' : ''
            }`}
          >
            {renderValue(val, i === winnerIdx, i)}
          </div>
        ))}
      </div>

      {/* Mobile */}
      <div className={`md:hidden grid ${mobileGridCols} border-t border-gray-100`}>
        <div className="p-3 flex items-center">
          <span className="text-xs font-medium text-gray-600">{label}</span>
        </div>
        {values.map((val, i) => (
          <div
            key={i}
            className={`p-3 border-l border-gray-100 flex items-center justify-center ${
              i === winnerIdx ? 'bg-indigo-50/50' : ''
            }`}
          >
            {renderValue(val, i === winnerIdx, i)}
          </div>
        ))}
      </div>
    </>
  );
}

// ===========================================================================
// Section header
// ===========================================================================

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</h3>
    </div>
  );
}

// ===========================================================================
// Signals by source breakdown
// ===========================================================================

function SignalsBySource({
  companies,
  gridCols,
  mobileGridCols,
}: {
  companies: CompanyData[];
  gridCols: string;
  mobileGridCols: string;
}) {
  // Collect all unique source names
  const allSources = useMemo(() => {
    const sources = new Set<string>();
    for (const cd of companies) {
      for (const s of cd.signals) {
        sources.add(s.source?.name || 'Unknown');
      }
    }
    return Array.from(sources).sort();
  }, [companies]);

  if (allSources.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-gray-400">No signal sources to compare</p>
      </div>
    );
  }

  return (
    <>
      {allSources.map((sourceName) => {
        const values = companies.map(
          (cd) => cd.signals.filter((s) => (s.source?.name || 'Unknown') === sourceName).length
        );

        return (
          <CompareRow
            key={sourceName}
            label={sourceName}
            gridCols={gridCols}
            mobileGridCols={mobileGridCols}
            values={values}
            renderValue={(val, isWinner) => (
              <span className={`text-sm font-semibold ${isWinner ? 'text-indigo-600' : 'text-gray-900'}`}>
                {val ?? 0}
              </span>
            )}
          />
        );
      })}
    </>
  );
}
