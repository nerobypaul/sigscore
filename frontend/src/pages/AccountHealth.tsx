import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import type { AccountScore, ScoreTier, ScoreTrend } from '../types';
import { TIER_COLORS } from '../types';
import { PQASkeleton } from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HealthTab = 'at-risk' | 'expanding' | 'churning';

interface AccountWithDelta extends AccountScore {
  daysSinceLastSignal: number;
  topSignalTypes: string[];
  delta: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

function daysSince(date: string | null | undefined): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

function extractTopSignalTypes(factors: AccountScore['factors']): string[] {
  if (!factors || factors.length === 0) return [];
  return factors
    .filter((f) => f.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((f) => f.name.replace(/_/g, ' '));
}

function computeDelta(account: AccountScore): number {
  // Estimate delta from trend: RISING = positive, FALLING = negative, STABLE = 0
  // This is an approximation since we don't have exact previous scores per account inline
  if (account.trend === 'RISING') return Math.min(account.score, 10);
  if (account.trend === 'FALLING') return -Math.min(100 - account.score, 10);
  return 0;
}

function enrichAccount(account: AccountScore): AccountWithDelta {
  return {
    ...account,
    daysSinceLastSignal: daysSince(account.lastSignalAt),
    topSignalTypes: extractTopSignalTypes(account.factors),
    delta: computeDelta(account),
  };
}

// ---------------------------------------------------------------------------
// Donut Chart (pure CSS/SVG)
// ---------------------------------------------------------------------------

function DonutChart({
  segments,
  size = 160,
  strokeWidth = 24,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-sm fill-gray-400 font-medium"
        >
          No data
        </text>
      </svg>
    );
  }

  let cumulativeOffset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments
        .filter((s) => s.value > 0)
        .map((segment) => {
          const segmentLength = (segment.value / total) * circumference;
          const dashArray = `${segmentLength} ${circumference - segmentLength}`;
          const dashOffset = -cumulativeOffset + circumference * 0.25;
          cumulativeOffset += segmentLength;

          return (
            <circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              className="transition-all duration-500"
            />
          );
        })}
      <text
        x={size / 2}
        y={size / 2 - 8}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-2xl fill-gray-900 font-bold"
      >
        {total}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 14}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs fill-gray-500"
      >
        accounts
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Score Distribution Histogram (pure SVG)
// ---------------------------------------------------------------------------

function ScoreHistogram({ scores }: { scores: number[] }) {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * 10}-${i * 10 + 9}`,
    min: i * 10,
    max: i * 10 + 9,
    count: 0,
  }));

  // Special case: score of 100 goes in the 90-100 bucket
  scores.forEach((score) => {
    const idx = Math.min(Math.floor(score / 10), 9);
    buckets[idx].count++;
  });

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  // Tier boundary colors
  const getBucketColor = (min: number): string => {
    if (min >= 80) return '#ef4444'; // red-500 (HOT)
    if (min >= 50) return '#f97316'; // orange-500 (WARM)
    if (min >= 20) return '#3b82f6'; // blue-500 (COLD)
    return '#9ca3af'; // gray-400 (INACTIVE)
  };

  const chartWidth = 100; // percentage
  const barHeight = 200;

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: barHeight }}>
        {buckets.map((bucket) => {
          const heightPct = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
          return (
            <div
              key={bucket.label}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ height: '100%', width: `${chartWidth / 10}%` }}
            >
              {bucket.count > 0 && (
                <span className="text-[10px] font-medium text-gray-600 mb-1">
                  {bucket.count}
                </span>
              )}
              <div
                className="w-full rounded-t transition-all duration-500 min-w-[12px]"
                style={{
                  height: `${Math.max(heightPct, bucket.count > 0 ? 2 : 0)}%`,
                  backgroundColor: getBucketColor(bucket.min),
                  opacity: bucket.count > 0 ? 1 : 0.2,
                }}
                title={`${bucket.label}: ${bucket.count} accounts`}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-1 mt-1.5">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className="flex-1 text-center text-[10px] text-gray-500"
          >
            {bucket.min}
          </div>
        ))}
      </div>
      {/* Tier boundary legend */}
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {[
          { label: 'INACTIVE (<20)', color: '#9ca3af' },
          { label: 'COLD (20-49)', color: '#3b82f6' },
          { label: 'WARM (50-79)', color: '#f97316' },
          { label: 'HOT (80+)', color: '#ef4444' },
        ].map((tier) => (
          <div key={tier.label} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: tier.color }}
            />
            <span className="text-[10px] text-gray-500 font-medium">
              {tier.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend Indicator
// ---------------------------------------------------------------------------

function TrendArrow({ trend }: { trend: ScoreTrend }) {
  if (trend === 'RISING')
    return <span className="text-green-600 font-bold text-sm">&#8593;</span>;
  if (trend === 'FALLING')
    return <span className="text-red-600 font-bold text-sm">&#8595;</span>;
  return <span className="text-gray-400 font-bold text-sm">&#8594;</span>;
}

// ---------------------------------------------------------------------------
// Tier Badge
// ---------------------------------------------------------------------------

function TierBadge({ tier }: { tier: ScoreTier }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[tier]}`}
    >
      {tier}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
  subtext,
}: {
  label: string;
  value: number | string;
  accent: string;
  subtext?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
      {subtext && (
        <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk & Opportunity Table
// ---------------------------------------------------------------------------

function AccountTable({
  accounts,
  emptyMessage,
}: {
  accounts: AccountWithDelta[];
  emptyMessage: string;
}) {
  if (accounts.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left py-3 px-4 font-semibold text-gray-600">
              Account
            </th>
            <th className="text-center py-3 px-4 font-semibold text-gray-600 w-20">
              Score
            </th>
            <th className="text-center py-3 px-4 font-semibold text-gray-600 w-16">
              Tier
            </th>
            <th className="text-center py-3 px-4 font-semibold text-gray-600 w-16">
              Trend
            </th>
            <th className="text-center py-3 px-4 font-semibold text-gray-600 w-20">
              Delta
            </th>
            <th className="text-right py-3 px-4 font-semibold text-gray-600 w-28">
              Last Signal
            </th>
            <th className="text-left py-3 px-4 font-semibold text-gray-600 hidden lg:table-cell">
              Top Factors
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map((account) => (
            <tr
              key={account.id}
              className="hover:bg-gray-50 transition-colors"
            >
              <td className="py-3 px-4">
                <Link
                  to={`/companies/${account.accountId}`}
                  className="font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  {account.account?.name || 'Unknown'}
                </Link>
                {account.account?.domain && (
                  <span className="text-xs text-gray-400 ml-2">
                    {account.account.domain}
                  </span>
                )}
              </td>
              <td className="py-3 px-4 text-center">
                <span className="font-bold text-gray-900">{account.score}</span>
              </td>
              <td className="py-3 px-4 text-center">
                <TierBadge tier={account.tier} />
              </td>
              <td className="py-3 px-4 text-center">
                <TrendArrow trend={account.trend} />
              </td>
              <td className="py-3 px-4 text-center">
                <span
                  className={`text-sm font-semibold ${
                    account.delta > 0
                      ? 'text-green-600'
                      : account.delta < 0
                      ? 'text-red-600'
                      : 'text-gray-400'
                  }`}
                >
                  {account.delta > 0 ? '+' : ''}
                  {account.delta}
                </span>
              </td>
              <td className="py-3 px-4 text-right text-gray-500 text-xs">
                {account.lastSignalAt
                  ? timeAgo(account.lastSignalAt)
                  : '--'}
              </td>
              <td className="py-3 px-4 hidden lg:table-cell">
                <div className="flex flex-wrap gap-1">
                  {account.topSignalTypes.map((type) => (
                    <span
                      key={type}
                      className="inline-block text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                    >
                      {type}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function AccountHealth() {
  useEffect(() => {
    document.title = 'Account Health — Sigscore';
  }, []);

  const toast = useToast();
  const [scores, setScores] = useState<AccountScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<HealthTab>('at-risk');

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/signals/accounts/top', {
        params: { limit: 500 },
      });
      const list: AccountScore[] = Array.isArray(data)
        ? data
        : data.accounts || [];
      setScores(list);
    } catch {
      setScores([]);
      toast.error('Failed to load account health data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  // ---------------------------------------------------------------------------
  // Computed stats
  // ---------------------------------------------------------------------------

  const enrichedAccounts = useMemo(
    () => scores.map(enrichAccount),
    [scores],
  );

  const totalAccounts = scores.length;

  // Tier counts
  const hotCount = scores.filter((s) => s.tier === 'HOT').length;
  const warmCount = scores.filter((s) => s.tier === 'WARM').length;
  const coldCount = scores.filter((s) => s.tier === 'COLD').length;
  const inactiveCount = scores.filter((s) => s.tier === 'INACTIVE').length;

  // Trend counts
  const risingCount = scores.filter((s) => s.trend === 'RISING').length;
  const fallingCount = scores.filter((s) => s.trend === 'FALLING').length;
  const stableCount = scores.filter((s) => s.trend === 'STABLE').length;

  // Average PQA score
  const avgScore =
    totalAccounts > 0
      ? Math.round(
          scores.reduce((sum, s) => sum + s.score, 0) / totalAccounts,
        )
      : 0;

  // Active (signal in last 7 days) vs inactive
  const activeCount = scores.filter(
    (s) => s.lastSignalAt && daysSince(s.lastSignalAt) <= 7,
  ).length;
  const dormantCount = totalAccounts - activeCount;

  // ---------------------------------------------------------------------------
  // Risk & Opportunity filtered lists
  // ---------------------------------------------------------------------------

  const atRiskAccounts = useMemo(
    () =>
      enrichedAccounts
        .filter((a) => a.trend === 'FALLING' && a.score > 50)
        .sort((a, b) => b.score - a.score),
    [enrichedAccounts],
  );

  const expandingAccounts = useMemo(
    () =>
      enrichedAccounts
        .filter((a) => a.trend === 'RISING')
        .sort((a, b) => b.score - a.score),
    [enrichedAccounts],
  );

  const churningAccounts = useMemo(
    () =>
      enrichedAccounts.filter((a) => {
        // Accounts that were previously WARM/HOT (score suggests they had higher engagement)
        // but have now dropped to COLD/INACTIVE
        const currentTier = a.tier;
        const wouldHaveBeenHigher =
          a.trend === 'FALLING' &&
          (currentTier === 'COLD' || currentTier === 'INACTIVE');
        // Also include accounts that are COLD/INACTIVE with high signal counts (were once active)
        const hadActivity = a.signalCount > 5 && a.daysSinceLastSignal > 14;
        return (
          (wouldHaveBeenHigher || hadActivity) &&
          (currentTier === 'COLD' || currentTier === 'INACTIVE')
        );
      })
      .sort((a, b) => b.signalCount - a.signalCount),
    [enrichedAccounts],
  );

  // Remove duplicates that appear in multiple lists based on unique id
  // (not needed since tabs are exclusive, but kept for safety)

  const tabData: Record<HealthTab, { accounts: AccountWithDelta[]; emptyMsg: string }> = {
    'at-risk': {
      accounts: atRiskAccounts,
      emptyMsg: 'No valuable accounts showing declining engagement. That\'s great news!',
    },
    expanding: {
      accounts: expandingAccounts,
      emptyMsg: 'No accounts with rising engagement detected yet.',
    },
    churning: {
      accounts: churningAccounts,
      emptyMsg: 'No churning accounts detected. Your engagement is solid.',
    },
  };

  const tabLabels: Record<HealthTab, { label: string; count: number }> = {
    'at-risk': { label: 'At Risk', count: atRiskAccounts.length },
    expanding: { label: 'Expanding', count: expandingAccounts.length },
    churning: { label: 'Churning', count: churningAccounts.length },
  };

  // Donut chart segments
  const donutSegments = [
    { label: 'HOT', value: hotCount, color: '#ef4444' },
    { label: 'WARM', value: warmCount, color: '#f97316' },
    { label: 'COLD', value: coldCount, color: '#3b82f6' },
    { label: 'INACTIVE', value: inactiveCount, color: '#9ca3af' },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Account Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Intelligence on account engagement, risk, and growth
          </p>
        </div>
        <PQASkeleton />
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Account Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Intelligence on account engagement, risk, and growth
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <EmptyState
            icon={
              <svg
                className="w-7 h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            }
            title="No account health data yet"
            description="Account health intelligence will appear once signals are processed and scoring is configured. Connect a signal source to get started."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Health</h1>
          <p className="mt-1 text-sm text-gray-500">
            Intelligence on account engagement, risk, and growth across{' '}
            {totalAccounts} scored accounts
          </p>
        </div>
        <Link
          to="/scores"
          className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
        >
          View PQA Scores &rarr;
        </Link>
      </div>

      {/* ================================================================= */}
      {/* TOP SECTION: Health Overview                                       */}
      {/* ================================================================= */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Donut chart card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Tier Distribution
          </h2>
          <div className="flex items-center gap-6">
            <DonutChart segments={donutSegments} size={140} strokeWidth={20} />
            <div className="space-y-2 flex-1">
              {donutSegments.map((seg) => (
                <div key={seg.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-sm text-gray-700">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {seg.value}
                    </span>
                    <span className="text-xs text-gray-400">
                      (
                      {totalAccounts > 0
                        ? Math.round((seg.value / totalAccounts) * 100)
                        : 0}
                      %)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary stats cards */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Avg PQA Score"
            value={avgScore}
            accent="text-indigo-600"
            subtext={`of 100`}
          />
          <StatCard
            label="Active (7d)"
            value={activeCount}
            accent="text-green-600"
            subtext={`${dormantCount} dormant`}
          />
          <StatCard
            label="Rising"
            value={risingCount}
            accent="text-green-600"
            subtext={`${stableCount} stable`}
          />
          <StatCard
            label="Falling"
            value={fallingCount}
            accent="text-red-600"
            subtext={`${atRiskAccounts.length} at risk`}
          />
        </div>

        {/* Trend momentum card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
            Engagement Momentum
          </h2>
          <div className="space-y-4">
            {/* Rising bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-green-600 font-bold">&#8593;</span>
                  <span className="text-sm text-gray-700">Rising</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {risingCount}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      totalAccounts > 0
                        ? (risingCount / totalAccounts) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            {/* Stable bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 font-bold">&#8594;</span>
                  <span className="text-sm text-gray-700">Stable</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {stableCount}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-400 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      totalAccounts > 0
                        ? (stableCount / totalAccounts) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            {/* Falling bar */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-red-600 font-bold">&#8595;</span>
                  <span className="text-sm text-gray-700">Falling</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {fallingCount}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      totalAccounts > 0
                        ? (fallingCount / totalAccounts) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Net health indicator */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                Net Health
              </span>
              <span
                className={`text-lg font-bold ${
                  risingCount - fallingCount > 0
                    ? 'text-green-600'
                    : risingCount - fallingCount < 0
                    ? 'text-red-600'
                    : 'text-gray-500'
                }`}
              >
                {risingCount - fallingCount > 0 ? '+' : ''}
                {risingCount - fallingCount}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Rising minus falling accounts
            </p>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* MIDDLE SECTION: Risk & Opportunity Table                           */}
      {/* ================================================================= */}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        {/* Tab header */}
        <div className="border-b border-gray-200 bg-gray-50 px-4">
          <nav className="flex gap-0 -mb-px">
            {(Object.entries(tabLabels) as [HealthTab, { label: string; count: number }][]).map(
              ([key, { label, count }]) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === key
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {label}
                  <span
                    className={`ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      activeTab === key
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ),
            )}
          </nav>
        </div>

        {/* Tab content */}
        <AccountTable
          accounts={tabData[activeTab].accounts}
          emptyMessage={tabData[activeTab].emptyMsg}
        />
      </div>

      {/* ================================================================= */}
      {/* BOTTOM SECTION: Score Distribution Histogram                       */}
      {/* ================================================================= */}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Score Distribution
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              PQA scores bucketed by range with tier boundaries highlighted
            </p>
          </div>
          <span className="text-xs text-gray-400">
            {totalAccounts} accounts scored
          </span>
        </div>
        <ScoreHistogram scores={scores.map((s) => s.score)} />
      </div>
    </div>
  );
}
