import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageSummary {
  requestsToday: number;
  requestsThisWeek: number;
  requestsThisMonth: number;
  avgResponseTimeMs: number;
  errorRate: number;
  topEndpoints: { endpoint: string; method: string; count: number }[];
}

interface TimeSeriesPoint {
  hour: string;
  count: number;
  errors: number;
  avgResponseTimeMs: number;
}

interface EndpointBreakdown {
  method: string;
  endpoint: string;
  count: number;
  avgResponseTimeMs: number;
  errorRate: number;
  errors: number;
}

interface RateLimitEntry {
  label: string;
  currentUsage: number;
  limit: number;
  percentage: number;
}

interface RateLimitStatus {
  plan: string;
  limits: RateLimitEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-green-100 text-green-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-yellow-100 text-yellow-700',
  PATCH: 'bg-orange-100 text-orange-700',
  DELETE: 'bg-red-100 text-red-700',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  growth: 'Growth',
  scale: 'Scale',
};

const PLAN_MONTHLY_API_LIMITS: Record<string, number> = {
  free: 50_000,
  pro: 500_000,
  growth: 2_000_000,
  scale: Infinity,
};

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortField = 'count' | 'avgResponseTimeMs' | 'errorRate' | 'endpoint';
type SortDir = 'asc' | 'desc';

function sortEndpoints(
  endpoints: EndpointBreakdown[],
  field: SortField,
  dir: SortDir,
): EndpointBreakdown[] {
  const sorted = [...endpoints].sort((a, b) => {
    if (field === 'endpoint') {
      return a.endpoint.localeCompare(b.endpoint);
    }
    return (a[field] as number) - (b[field] as number);
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ApiUsage() {
  useEffect(() => { document.title = 'API Usage — Sigscore'; }, []);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointBreakdown[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitStatus | null>(null);
  const [hours, setHours] = useState(24);
  const [sortField, setSortField] = useState<SortField>('count');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Fetch all data in parallel
  const fetchData = useCallback(async (h: number) => {
    setLoading(true);
    try {
      const [summaryRes, tsRes, endpointRes, rlRes] = await Promise.allSettled([
        api.get('/api-usage/summary'),
        api.get('/api-usage/timeseries', { params: { hours: h } }),
        api.get('/api-usage/endpoints'),
        api.get('/api-usage/rate-limits'),
      ]);

      setSummary(summaryRes.status === 'fulfilled' ? summaryRes.value.data : null);
      setTimeseries(
        tsRes.status === 'fulfilled' ? tsRes.value.data.data : [],
      );
      setEndpoints(
        endpointRes.status === 'fulfilled' ? endpointRes.value.data.endpoints : [],
      );
      setRateLimits(rlRes.status === 'fulfilled' ? rlRes.value.data : null);
    } catch {
      // Errors handled per-request above
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(hours);
  }, [fetchData, hours]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => fetchData(hours), 60_000);
    return () => clearInterval(interval);
  }, [fetchData, hours]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedEndpoints = sortEndpoints(endpoints, sortField, sortDir);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const plan = rateLimits?.plan || 'free';
  const monthlyLimit = PLAN_MONTHLY_API_LIMITS[plan] ?? 50_000;
  const monthlyUsagePercent = isFinite(monthlyLimit)
    ? Math.min(Math.round(((summary?.requestsThisMonth ?? 0) / monthlyLimit) * 100), 100)
    : 0;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">API Usage</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monitor your API consumption, response times, and rate limit usage
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Requests Today"
          value={summary?.requestsToday ?? 0}
          subtitle={`${summary?.requestsThisWeek?.toLocaleString() ?? 0} this week`}
          icon={<RequestsIcon />}
          color="bg-indigo-500"
        />
        <SummaryCard
          label="Requests This Month"
          value={summary?.requestsThisMonth ?? 0}
          subtitle={
            isFinite(monthlyLimit)
              ? `${monthlyUsagePercent}% of ${(monthlyLimit / 1000).toLocaleString()}K limit`
              : 'Unlimited'
          }
          icon={<CalendarIcon />}
          color="bg-blue-500"
        />
        <SummaryCard
          label="Avg Response Time"
          value={summary?.avgResponseTimeMs ?? 0}
          suffix="ms"
          subtitle={
            (summary?.avgResponseTimeMs ?? 0) < 100
              ? 'Excellent'
              : (summary?.avgResponseTimeMs ?? 0) < 300
                ? 'Good'
                : 'Needs attention'
          }
          icon={<ClockIcon />}
          color="bg-emerald-500"
        />
        <SummaryCard
          label="Error Rate"
          value={summary?.errorRate ?? 0}
          suffix="%"
          subtitle="4xx + 5xx responses"
          icon={<ErrorIcon />}
          color={(summary?.errorRate ?? 0) > 5 ? 'bg-red-500' : (summary?.errorRate ?? 0) > 1 ? 'bg-amber-500' : 'bg-green-500'}
        />
      </div>

      {/* Request Volume Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Request Volume</h2>
          <div className="flex items-center gap-2">
            {[24, 48, 72, 168].map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  hours === h
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {h <= 48 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
        </div>
        <RequestVolumeChart data={timeseries} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Top Endpoints Table — 2 columns */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Top Endpoints</h2>
          {sortedEndpoints.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              No endpoint data yet. Make some API requests to see usage here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <SortableHeader
                      label="Endpoint"
                      field="endpoint"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Requests"
                      field="count"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Avg Latency"
                      field="avgResponseTimeMs"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                    <SortableHeader
                      label="Error Rate"
                      field="errorRate"
                      current={sortField}
                      dir={sortDir}
                      onSort={handleSort}
                      align="right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedEndpoints.map((ep, i) => (
                    <tr
                      key={`${ep.method}:${ep.endpoint}`}
                      className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                    >
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              METHOD_COLORS[ep.method] || 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {ep.method}
                          </span>
                          <span className="text-sm text-gray-700 font-mono truncate max-w-[300px]">
                            {ep.endpoint}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right text-sm text-gray-900 font-medium tabular-nums">
                        {ep.count.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right text-sm tabular-nums">
                        <span
                          className={
                            ep.avgResponseTimeMs > 500
                              ? 'text-red-600 font-medium'
                              : ep.avgResponseTimeMs > 200
                                ? 'text-amber-600'
                                : 'text-gray-600'
                          }
                        >
                          {ep.avgResponseTimeMs}ms
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-sm tabular-nums">
                        <span
                          className={
                            ep.errorRate > 10
                              ? 'text-red-600 font-medium'
                              : ep.errorRate > 2
                                ? 'text-amber-600'
                                : 'text-gray-600'
                          }
                        >
                          {ep.errorRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rate Limit Meters — 1 column */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Rate Limits</h2>
          <p className="text-xs text-gray-400 mb-4">
            Current usage per minute vs {PLAN_LABELS[plan] || plan} plan limits
          </p>
          {rateLimits?.limits && rateLimits.limits.length > 0 ? (
            <div className="space-y-5">
              {rateLimits.limits.map((rl) => (
                <RateLimitMeter key={rl.label} entry={rl} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">
              No rate limit data available.
            </p>
          )}
        </div>
      </div>

      {/* Tier Comparison / Upgrade CTA */}
      <TierComparison plan={plan} monthlyRequests={summary?.requestsThisMonth ?? 0} navigate={navigate} />
    </div>
  );
}

// ===========================================================================
// Summary Card
// ===========================================================================

function SummaryCard({
  label,
  value,
  suffix = '',
  subtitle,
  icon,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-xl font-bold text-gray-900 mt-0.5">
            {value.toLocaleString()}
            {suffix && <span className="text-sm font-normal text-gray-400 ml-0.5">{suffix}</span>}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Request Volume Chart (SVG bar chart)
// ===========================================================================

function RequestVolumeChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-gray-400">No request data available for this period.</p>
      </div>
    );
  }

  const width = 800;
  const height = 240;
  const padding = { top: 16, right: 16, bottom: 36, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.max(chartW / data.length - 2, 1);

  const xScale = (i: number) => padding.left + (i / data.length) * chartW + 1;
  const yScale = (v: number) => padding.top + chartH - (v / maxVal) * chartH;

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 4), Math.round(maxVal / 2), Math.round((maxVal * 3) / 4), maxVal];

  // X-axis labels — show ~8 labels
  const labelStep = Math.max(1, Math.floor(data.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={padding.left}
            y1={yScale(tick)}
            x2={width - padding.right}
            y2={yScale(tick)}
            stroke="#f3f4f6"
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

      {/* Bars */}
      {data.map((point, i) => {
        const barH = (point.count / maxVal) * chartH;
        const errH = (point.errors / maxVal) * chartH;

        return (
          <g key={point.hour}>
            {/* Success portion */}
            <rect
              x={xScale(i)}
              y={yScale(point.count)}
              width={barWidth}
              height={Math.max(barH, 0)}
              fill="#6366f1"
              rx={1}
              opacity={0.85}
            >
              <title>
                {formatHourLabel(point.hour)}: {point.count} requests ({point.errors} errors, {point.avgResponseTimeMs}ms avg)
              </title>
            </rect>
            {/* Error overlay */}
            {point.errors > 0 && (
              <rect
                x={xScale(i)}
                y={yScale(point.errors)}
                width={barWidth}
                height={Math.max(errH, 0)}
                fill="#ef4444"
                rx={1}
                opacity={0.7}
              />
            )}
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((point, i) => {
        if (i % labelStep !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={`label-${point.hour}`}
            x={xScale(i) + barWidth / 2}
            y={height - 8}
            textAnchor="middle"
            className="text-[10px]"
            fill="#9ca3af"
          >
            {formatHourLabel(point.hour)}
          </text>
        );
      })}
    </svg>
  );
}

// ===========================================================================
// Rate Limit Meter
// ===========================================================================

function RateLimitMeter({ entry }: { entry: RateLimitEntry }) {
  const barColor =
    entry.percentage >= 80
      ? 'bg-red-500'
      : entry.percentage >= 50
        ? 'bg-amber-500'
        : 'bg-green-500';

  const textColor =
    entry.percentage >= 80
      ? 'text-red-600'
      : entry.percentage >= 50
        ? 'text-amber-600'
        : 'text-green-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-700">{entry.label}</span>
        <span className={`text-xs font-semibold ${textColor}`}>
          {entry.currentUsage}/{entry.limit} per min
        </span>
      </div>
      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${Math.max(entry.percentage, 1)}%` }}
        />
      </div>
      <div className="flex justify-end mt-1">
        <span className="text-[10px] text-gray-400">{entry.percentage}% utilized</span>
      </div>
    </div>
  );
}

// ===========================================================================
// Tier Comparison / Upgrade CTA
// ===========================================================================

function TierComparison({
  plan,
  monthlyRequests,
  navigate,
}: {
  plan: string;
  monthlyRequests: number;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const tiers = [
    { name: 'Free', key: 'free', apiLimit: '50K', contacts: '1K', signals: '5K/mo', price: '$0' },
    { name: 'Pro', key: 'pro', apiLimit: '500K', contacts: '25K', signals: '100K/mo', price: '$79' },
    { name: 'Growth', key: 'growth', apiLimit: '2M', contacts: '100K', signals: '500K/mo', price: '$199' },
    { name: 'Scale', key: 'scale', apiLimit: 'Unlimited', contacts: 'Unlimited', signals: 'Unlimited', price: '$299' },
  ];

  const currentTierIndex = tiers.findIndex((t) => t.key === plan);
  const usagePercent = PLAN_MONTHLY_API_LIMITS[plan]
    ? Math.round((monthlyRequests / PLAN_MONTHLY_API_LIMITS[plan]) * 100)
    : 0;
  const isApproachingLimit = usagePercent >= 70 && plan !== 'scale';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Plan Comparison</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Current plan: <span className="font-medium text-gray-700">{PLAN_LABELS[plan] || plan}</span>
            {isApproachingLimit && (
              <span className="ml-2 text-amber-600 font-medium">
                -- {usagePercent}% of monthly API limit used
              </span>
            )}
          </p>
        </div>
        {isApproachingLimit && (
          <button
            onClick={() => navigate('/billing')}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Upgrade Plan
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-4">Tier</th>
              <th className="text-right text-xs font-medium text-gray-500 pb-2 px-4">API Requests/mo</th>
              <th className="text-right text-xs font-medium text-gray-500 pb-2 px-4">Contacts</th>
              <th className="text-right text-xs font-medium text-gray-500 pb-2 px-4">Signals</th>
              <th className="text-right text-xs font-medium text-gray-500 pb-2 pl-4">Price</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, i) => {
              const isCurrent = tier.key === plan;
              return (
                <tr
                  key={tier.key}
                  className={`${isCurrent ? 'bg-indigo-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isCurrent ? 'text-indigo-700' : 'text-gray-700'}`}>
                        {tier.name}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          CURRENT
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`py-2.5 text-right text-sm px-4 ${isCurrent ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>
                    {tier.apiLimit}
                  </td>
                  <td className={`py-2.5 text-right text-sm px-4 ${isCurrent ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>
                    {tier.contacts}
                  </td>
                  <td className={`py-2.5 text-right text-sm px-4 ${isCurrent ? 'text-indigo-700 font-medium' : 'text-gray-600'}`}>
                    {tier.signals}
                  </td>
                  <td className="py-2.5 text-right pl-4">
                    <span className={`text-sm font-semibold ${isCurrent ? 'text-indigo-700' : 'text-gray-900'}`}>
                      {tier.price}
                    </span>
                    <span className="text-xs text-gray-400">/mo</span>
                    {!isCurrent && i > currentTierIndex && (
                      <button
                        onClick={() => navigate('/billing')}
                        className="ml-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Upgrade
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===========================================================================
// Sortable Table Header
// ===========================================================================

function SortableHeader({
  label,
  field,
  current,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: 'left' | 'right';
}) {
  const isActive = current === field;
  return (
    <th
      className={`pb-2 text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <svg
            className={`w-3 h-3 transition-transform ${dir === 'asc' ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </span>
    </th>
  );
}

// ===========================================================================
// Icons
// ===========================================================================

function RequestsIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

// ===========================================================================
// Helpers
// ===========================================================================

function formatHourLabel(hourBucket: string): string {
  // hourBucket format: YYYY-MM-DD-HH
  const parts = hourBucket.split('-');
  if (parts.length < 4) return hourBucket;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const hour = parseInt(parts[3], 10);
  return `${month}/${day} ${hour.toString().padStart(2, '0')}:00`;
}
