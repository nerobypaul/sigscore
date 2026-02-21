import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendSeries {
  type: string;
  data: number[];
}

interface TrendData {
  dates: string[];
  series: TrendSeries[];
  total: number;
}

interface CohortRow {
  period: string;
  size: number;
  values: number[];
}

interface CohortData {
  cohorts: CohortRow[];
  periodLabels: string[];
}

interface FunnelStage {
  name: string;
  count: number;
  conversionRate: number;
  dropoff: number;
}

interface FunnelData {
  stages: FunnelStage[];
}

interface TierMovementEntry {
  from: string;
  to: string;
  count: number;
}

interface TierMovementData {
  upgrades: TierMovementEntry[];
  downgrades: TierMovementEntry[];
  net: number;
}

interface TopMoverAccount {
  accountId: string;
  name: string;
  domain: string | null;
  scoreDelta: number;
  currentScore: number;
  currentTier: string;
}

interface TopMoversData {
  risers: TopMoverAccount[];
  fallers: TopMoverAccount[];
}

interface SourceEntry {
  source: string;
  signalCount: number;
  uniqueAccounts: number;
  avgScore: number;
}

interface SourceAttributionData {
  sources: SourceEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { key: 'trends', label: 'Signal Trends' },
  { key: 'cohorts', label: 'Cohort Analysis' },
  { key: 'funnel', label: 'Funnel' },
  { key: 'insights', label: 'Insights' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TIER_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-700',
  WARM: 'bg-orange-100 text-orange-700',
  COLD: 'bg-blue-100 text-blue-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
};

const LINE_COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#64748b', // slate
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Analytics() {
  useEffect(() => { document.title = 'Analytics — Sigscore'; }, []);
  const [activeTab, setActiveTab] = useState<TabKey>('trends');
  const [loading, setLoading] = useState(true);

  // Trends state
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [trendDays, setTrendDays] = useState(30);

  // Cohort state
  const [cohortData, setCohortData] = useState<CohortData | null>(null);
  const [cohortPeriod, setCohortPeriod] = useState<'week' | 'month'>('month');
  const [cohortMetric, setCohortMetric] = useState<'signals' | 'score' | 'contacts'>('signals');

  // Funnel state
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);

  // Insights state
  const [tierMovement, setTierMovement] = useState<TierMovementData | null>(null);
  const [topMovers, setTopMovers] = useState<TopMoversData | null>(null);
  const [sourceAttribution, setSourceAttribution] = useState<SourceAttributionData | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchTrends = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const { data } = await api.get('/analytics/advanced/trends', {
        params: { days, groupBy: days > 60 ? 'week' : 'day' },
      });
      setTrendData(data);
    } catch {
      setTrendData({ dates: [], series: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCohorts = useCallback(async (period: 'week' | 'month', metric: string) => {
    setLoading(true);
    try {
      const { data } = await api.get('/analytics/advanced/cohorts', {
        params: { period, metric, months: 6 },
      });
      setCohortData(data);
    } catch {
      setCohortData({ cohorts: [], periodLabels: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFunnel = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/analytics/advanced/funnel');
      setFunnelData(data);
    } catch {
      setFunnelData({ stages: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const [tierRes, moversRes, sourceRes] = await Promise.allSettled([
        api.get('/analytics/advanced/tier-movement', { params: { days: 30 } }),
        api.get('/analytics/advanced/top-movers', { params: { days: 7, limit: 5 } }),
        api.get('/analytics/advanced/source-attribution', { params: { days: 30 } }),
      ]);
      setTierMovement(tierRes.status === 'fulfilled' ? tierRes.value.data : { upgrades: [], downgrades: [], net: 0 });
      setTopMovers(moversRes.status === 'fulfilled' ? moversRes.value.data : { risers: [], fallers: [] });
      setSourceAttribution(sourceRes.status === 'fulfilled' ? sourceRes.value.data : { sources: [] });
    } catch {
      // handled by individual catch above
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch data on tab change
  useEffect(() => {
    if (activeTab === 'trends') fetchTrends(trendDays);
    else if (activeTab === 'cohorts') fetchCohorts(cohortPeriod, cohortMetric);
    else if (activeTab === 'funnel') fetchFunnel();
    else if (activeTab === 'insights') fetchInsights();
  }, [activeTab, trendDays, cohortPeriod, cohortMetric, fetchTrends, fetchCohorts, fetchFunnel, fetchInsights]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Deep insights into signal trends, cohort behavior, and pipeline health
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {activeTab === 'trends' && (
            <SignalTrendsTab data={trendData} days={trendDays} onDaysChange={setTrendDays} />
          )}
          {activeTab === 'cohorts' && (
            <CohortTab
              data={cohortData}
              period={cohortPeriod}
              metric={cohortMetric}
              onPeriodChange={setCohortPeriod}
              onMetricChange={setCohortMetric}
            />
          )}
          {activeTab === 'funnel' && <FunnelTab data={funnelData} />}
          {activeTab === 'insights' && (
            <InsightsTab
              tierMovement={tierMovement}
              topMovers={topMovers}
              sourceAttribution={sourceAttribution}
            />
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Signal Trends Tab
// ===========================================================================

function SignalTrendsTab({
  data,
  days,
  onDaysChange,
}: {
  data: TrendData | null;
  days: number;
  onDaysChange: (d: number) => void;
}) {
  if (!data || data.dates.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-400">No signal data available for the selected period.</p>
      </div>
    );
  }

  const { dates, series, total } = data;

  // Compute SVG chart dimensions
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Find the max value across all series
  const maxVal = Math.max(...series.flatMap((s) => s.data), 1);

  // X and Y scale helpers
  const xScale = (i: number) => padding.left + (i / Math.max(dates.length - 1, 1)) * chartW;
  const yScale = (v: number) => padding.top + chartH - (v / maxVal) * chartH;

  // Build SVG path for each series
  const buildPath = (dataPoints: number[]): string => {
    return dataPoints
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(v).toFixed(1)}`)
      .join(' ');
  };

  // X-axis labels (show ~8 labels)
  const labelStep = Math.max(1, Math.floor(dates.length / 8));
  const xLabels = dates.filter((_, i) => i % labelStep === 0 || i === dates.length - 1);

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 4), Math.round(maxVal / 2), Math.round((maxVal * 3) / 4), maxVal];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => onDaysChange(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === d
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-500">
          Total: <span className="font-semibold text-gray-900">{total.toLocaleString()}</span> signals
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={yScale(tick)}
                x2={width - padding.right}
                y2={yScale(tick)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={yScale(tick) + 4}
                textAnchor="end"
                className="text-[10px]"
                fill="#9ca3af"
              >
                {tick}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xLabels.map((label) => {
            const idx = dates.indexOf(label);
            return (
              <text
                key={label}
                x={xScale(idx)}
                y={height - 8}
                textAnchor="middle"
                className="text-[10px]"
                fill="#9ca3af"
              >
                {formatShortDate(label)}
              </text>
            );
          })}

          {/* Lines */}
          {series.map((s, si) => (
            <path
              key={s.type}
              d={buildPath(s.data)}
              fill="none"
              stroke={LINE_COLORS[si % LINE_COLORS.length]}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-100">
          {series.map((s, si) => (
            <div key={s.type} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: LINE_COLORS[si % LINE_COLORS.length] }}
              />
              <span className="text-xs text-gray-600">
                {s.type.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Cohort Analysis Tab
// ===========================================================================

function CohortTab({
  data,
  period,
  metric,
  onPeriodChange,
  onMetricChange,
}: {
  data: CohortData | null;
  period: 'week' | 'month';
  metric: 'signals' | 'score' | 'contacts';
  onPeriodChange: (p: 'week' | 'month') => void;
  onMetricChange: (m: 'signals' | 'score' | 'contacts') => void;
}) {
  if (!data || data.cohorts.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-400">No cohort data available. Accounts need signals to generate cohorts.</p>
      </div>
    );
  }

  // Find max value for color intensity
  const allValues = data.cohorts.flatMap((c) => c.values);
  const maxVal = Math.max(...allValues, 1);

  // Maximum number of periods across all cohorts
  const maxPeriods = Math.max(...data.cohorts.map((c) => c.values.length));

  // Cell color based on intensity (0 = transparent, max = full indigo)
  const getCellColor = (val: number) => {
    if (val === 0) return 'bg-gray-50';
    const intensity = val / maxVal;
    if (intensity > 0.8) return 'bg-indigo-700 text-white';
    if (intensity > 0.6) return 'bg-indigo-500 text-white';
    if (intensity > 0.4) return 'bg-indigo-400 text-white';
    if (intensity > 0.2) return 'bg-indigo-200 text-indigo-900';
    return 'bg-indigo-100 text-indigo-800';
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Period:</span>
          {(['month', 'week'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'month' ? 'Monthly' : 'Weekly'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium">Metric:</span>
          {(['signals', 'contacts', 'score'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onMetricChange(m)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                metric === m
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Cohort Heat Map */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="text-xs font-medium text-gray-500 pb-2 text-left pr-3 w-28">Cohort</th>
              <th className="text-xs font-medium text-gray-500 pb-2 text-center w-16">Size</th>
              {Array.from({ length: maxPeriods }, (_, i) => (
                <th key={i} className="text-xs font-medium text-gray-500 pb-2 text-center w-16">
                  +{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((cohort) => (
              <tr key={cohort.period}>
                <td className="text-xs font-medium text-gray-700 py-1 pr-3">{cohort.period}</td>
                <td className="text-xs text-gray-500 py-1 text-center">{cohort.size}</td>
                {Array.from({ length: maxPeriods }, (_, i) => {
                  const val = i < cohort.values.length ? cohort.values[i] : null;
                  return (
                    <td key={i} className="py-1 px-0.5">
                      {val !== null ? (
                        <div
                          className={`text-xs font-medium rounded px-1 py-1 text-center ${getCellColor(val)}`}
                          title={`${cohort.period} +${i}: ${val}`}
                        >
                          {val}
                        </div>
                      ) : (
                        <div className="text-xs text-center text-gray-200">-</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
          <span className="text-xs text-gray-500">Intensity:</span>
          <div className="flex gap-1">
            {['bg-gray-50', 'bg-indigo-100', 'bg-indigo-200', 'bg-indigo-400', 'bg-indigo-500', 'bg-indigo-700'].map(
              (c, i) => (
                <div key={i} className={`w-6 h-4 rounded ${c}`} />
              ),
            )}
          </div>
          <span className="text-xs text-gray-400 ml-1">Low to High</span>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Funnel Tab
// ===========================================================================

function FunnelTab({ data }: { data: FunnelData | null }) {
  if (!data || data.stages.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-gray-400">No funnel data available. Accounts need signals to build a funnel.</p>
      </div>
    );
  }

  const { stages } = data;
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="space-y-3">
        {stages.map((stage, i) => {
          const barWidth = (stage.count / maxCount) * 100;
          const prevCount = i > 0 ? stages[i - 1].count : stage.count;
          const dropoffPct = prevCount > 0 ? Math.round((stage.dropoff / prevCount) * 100) : 0;

          return (
            <div key={stage.name}>
              {/* Dropoff indicator between stages */}
              {i > 0 && stage.dropoff > 0 && (
                <div className="flex items-center gap-2 py-1.5 pl-4">
                  <svg className="w-4 h-4 text-red-400" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 1l7 7-3 0 0 7-8 0 0-7-3 0z" transform="rotate(180, 8, 8)" />
                  </svg>
                  <span className="text-xs text-red-500">
                    -{stage.dropoff} dropped ({dropoffPct}%)
                  </span>
                </div>
              )}

              {/* Stage bar */}
              <div className="flex items-center gap-4">
                <div className="w-32 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-700">
                    {stage.name.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="relative h-10 bg-gray-50 rounded-lg overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-lg transition-all flex items-center justify-end pr-3"
                      style={{ width: `${Math.max(barWidth, 3)}%` }}
                    >
                      {barWidth > 20 && (
                        <span className="text-xs font-semibold text-white">
                          {stage.count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {barWidth <= 20 && (
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-600">
                        {stage.count.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="w-20 text-right flex-shrink-0">
                  <span
                    className={`text-sm font-semibold ${
                      i === 0 ? 'text-gray-500' : stage.conversionRate >= 50 ? 'text-green-600' : 'text-amber-600'
                    }`}
                  >
                    {i === 0 ? '-' : `${stage.conversionRate}%`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {stages.length >= 2 && (
        <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-6">
          <div>
            <span className="text-xs text-gray-500">Overall conversion</span>
            <p className="text-lg font-bold text-gray-900">
              {stages[0].count > 0
                ? `${Math.round((stages[stages.length - 1].count / stages[0].count) * 100 * 10) / 10}%`
                : '0%'}
            </p>
          </div>
          <div>
            <span className="text-xs text-gray-500">Biggest dropoff</span>
            <p className="text-lg font-bold text-red-600">
              {stages.reduce(
                (worst, s) => (s.dropoff > worst.dropoff ? s : worst),
                { name: '-', dropoff: 0 },
              ).name.replace(/_/g, ' ')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Insights Tab
// ===========================================================================

function InsightsTab({
  tierMovement,
  topMovers,
  sourceAttribution,
}: {
  tierMovement: TierMovementData | null;
  topMovers: TopMoversData | null;
  sourceAttribution: SourceAttributionData | null;
}) {
  // Compute summary metrics
  const totalUpgrades = tierMovement?.upgrades.reduce((s, e) => s + e.count, 0) ?? 0;
  const totalDowngrades = tierMovement?.downgrades.reduce((s, e) => s + e.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Tier Upgrades"
          value={totalUpgrades}
          color="bg-green-500"
          suffix="accounts"
        />
        <MetricCard
          label="Tier Downgrades"
          value={totalDowngrades}
          color="bg-red-500"
          suffix="accounts"
        />
        <MetricCard
          label="Net Movement"
          value={tierMovement?.net ?? 0}
          color={tierMovement && tierMovement.net >= 0 ? 'bg-green-500' : 'bg-red-500'}
          prefix={tierMovement && tierMovement.net > 0 ? '+' : ''}
          suffix="accounts"
        />
        <MetricCard
          label="Signal Sources"
          value={sourceAttribution?.sources.length ?? 0}
          color="bg-indigo-500"
          suffix="active"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier Movement */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Tier Movement (30d)</h3>
          {totalUpgrades === 0 && totalDowngrades === 0 ? (
            <p className="text-sm text-gray-400 py-4">No tier changes recorded in this period.</p>
          ) : (
            <div className="space-y-3">
              {tierMovement?.upgrades.map((entry, i) => (
                <div key={`up-${i}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-500" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 3l5 5h-3v5H6V8H3z" />
                    </svg>
                    <span className="text-sm text-gray-700">
                      {entry.from} &rarr; {entry.to}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-green-600">{entry.count}</span>
                </div>
              ))}
              {tierMovement?.downgrades.map((entry, i) => (
                <div key={`down-${i}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 13l5-5h-3V3H6v5H3z" />
                    </svg>
                    <span className="text-sm text-gray-700">
                      {entry.from} &rarr; {entry.to}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-red-600">{entry.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source Attribution — Horizontal Bar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Source Attribution (30d)</h3>
          {!sourceAttribution || sourceAttribution.sources.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No source data available.</p>
          ) : (
            <div className="space-y-3">
              {sourceAttribution.sources.map((src) => {
                const maxSignals = Math.max(...sourceAttribution.sources.map((s) => s.signalCount), 1);
                const barW = (src.signalCount / maxSignals) * 100;

                return (
                  <div key={src.source}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 truncate">{src.source}</span>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-shrink-0">
                        <span>{src.uniqueAccounts} accts</span>
                        <span>avg {src.avgScore}</span>
                      </div>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full flex items-center justify-end pr-2"
                        style={{ width: `${Math.max(barW, 3)}%` }}
                      >
                        {barW > 15 && (
                          <span className="text-[10px] font-semibold text-white">
                            {src.signalCount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Risers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Top Risers (7d)
          </h3>
          {!topMovers || topMovers.risers.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No rising accounts in this period.</p>
          ) : (
            <div className="space-y-3">
              {topMovers.risers.map((account) => (
                <AccountMoverRow key={account.accountId} account={account} direction="up" />
              ))}
            </div>
          )}
        </div>

        {/* Top Fallers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Top Fallers (7d)
          </h3>
          {!topMovers || topMovers.fallers.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No falling accounts in this period.</p>
          ) : (
            <div className="space-y-3">
              {topMovers.fallers.map((account) => (
                <AccountMoverRow key={account.accountId} account={account} direction="down" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Shared Components
// ===========================================================================

function MetricCard({
  label,
  value,
  color,
  prefix = '',
  suffix = '',
}: {
  label: string;
  value: number;
  color: string;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center`}>
          <span className="text-white text-lg font-bold">#</span>
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">
            {prefix}{value} <span className="text-sm font-normal text-gray-400">{suffix}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function AccountMoverRow({
  account,
  direction,
}: {
  account: TopMoverAccount;
  direction: 'up' | 'down';
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 flex-shrink-0">
          {account.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{account.name}</p>
          {account.domain && (
            <p className="text-xs text-gray-400 truncate">{account.domain}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[account.currentTier] || 'bg-gray-100 text-gray-500'}`}>
          {account.currentTier}
        </span>
        <span className="text-sm font-bold text-gray-900">{account.currentScore}</span>
        <span
          className={`text-xs font-semibold ${
            direction === 'up' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {direction === 'up' ? '+' : ''}{account.scoreDelta}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
