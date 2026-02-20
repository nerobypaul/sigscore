import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { AccountScore, ScoreTier, ScoreTrend } from '../types';
import { TIER_COLORS } from '../types';
import { PQASkeleton } from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import OrgScoreTrendChart from '../components/OrgScoreTrendChart';
import { useToast } from '../components/Toast';

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString();
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? 'bg-red-500'
      : score >= 40
      ? 'bg-orange-500'
      : score >= 20
      ? 'bg-blue-500'
      : 'bg-gray-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 bg-gray-200 rounded-full">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-medium">{score}</span>
    </div>
  );
}

function TrendIndicator({ trend }: { trend: ScoreTrend }) {
  if (trend === 'RISING') return <span className="text-green-600 font-medium">&#8593;</span>;
  if (trend === 'FALLING') return <span className="text-red-600 font-medium">&#8595;</span>;
  return <span className="text-gray-400 font-medium">&#8594;</span>;
}

function TierBadge({ tier }: { tier: ScoreTier }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TIER_COLORS[tier]}`}
    >
      {tier}
    </span>
  );
}

export default function PQADashboard() {
  useEffect(() => { document.title = 'PQA Scores — DevSignal'; }, []);
  const toast = useToast();
  const [scores, setScores] = useState<AccountScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchScores = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/signals/accounts/top', {
        params: { limit: 200 },
      });
      // The API returns { accounts: [...] }
      const list: AccountScore[] = Array.isArray(data) ? data : data.accounts || [];
      setScores(list);
    } catch {
      setScores([]);
      toast.error('Failed to load PQA scores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  // Compute summary stats
  const totalAccounts = scores.length;
  const hotCount = scores.filter((s) => s.tier === 'HOT').length;
  const warmCount = scores.filter((s) => s.tier === 'WARM').length;
  const coldCount = scores.filter((s) => s.tier === 'COLD').length;
  const inactiveCount = scores.filter((s) => s.tier === 'INACTIVE').length;
  const avgScore =
    totalAccounts > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / totalAccounts)
      : 0;
  const risingCount = scores.filter((s) => s.trend === 'RISING').length;

  // Client-side pagination of sorted scores
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);
  const totalPages = Math.ceil(sortedScores.length / limit);
  const paginatedScores = sortedScores.slice((page - 1) * limit, page * limit);

  // Tier distribution for the bar chart
  const tierData: { tier: ScoreTier; count: number; color: string }[] = [
    { tier: 'HOT', count: hotCount, color: 'bg-red-500' },
    { tier: 'WARM', count: warmCount, color: 'bg-orange-500' },
    { tier: 'COLD', count: coldCount, color: 'bg-blue-500' },
    { tier: 'INACTIVE', count: inactiveCount, color: 'bg-gray-400' },
  ];

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">PQA Scores</h1>
          <p className="mt-1 text-sm text-gray-500">Product-Qualified Account scoring</p>
        </div>
        <PQASkeleton />
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">PQA Scores</h1>
          <p className="mt-1 text-sm text-gray-500">Product-Qualified Account scoring</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <EmptyState
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
            title="No scored accounts yet"
            description="Account scores will appear here once signals are processed and scoring rules are configured."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">PQA Scores</h1>
        <p className="mt-1 text-sm text-gray-500">
          Product-Qualified Account scoring — accounts ranked 0-100 based on developer activity signals.
          HOT (70+) = high engagement, WARM (40-69) = growing interest, COLD (20-39) = early signals, INACTIVE (&lt;20) = minimal activity.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Total Scored"
          value={totalAccounts}
          accent="text-gray-900"
        />
        <SummaryCard
          label="HOT Accounts"
          value={hotCount}
          accent="text-red-600"
        />
        <SummaryCard
          label="Avg Score"
          value={avgScore}
          accent="text-indigo-600"
        />
        <SummaryCard
          label="Trending Up"
          value={risingCount}
          accent="text-green-600"
        />
      </div>

      {/* Org-level score trend chart */}
      <div className="mb-6">
        <OrgScoreTrendChart days={30} height={200} />
      </div>

      {/* Main content: two columns */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column: Top Accounts table */}
        <div className="flex-1 lg:w-3/5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Top Accounts</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 w-10">#</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Account</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Score</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Tier</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-600">Trend</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Signals</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600">Last Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedScores.map((score, idx) => {
                    const rank = (page - 1) * limit + idx + 1;
                    const isExpanded = expandedId === score.id;
                    return (
                      <AccountRow
                        key={score.id}
                        score={score}
                        rank={rank}
                        isExpanded={isExpanded}
                        onToggle={() =>
                          setExpandedId(isExpanded ? null : score.id)
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Tier distribution */}
        <div className="lg:w-2/5">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Tier Distribution</h2>
            </div>

            <div className="p-4">
              {/* Stacked bar */}
              {totalAccounts > 0 && (
                <div className="flex rounded-full overflow-hidden h-6 mb-4">
                  {tierData
                    .filter((t) => t.count > 0)
                    .map((t) => (
                      <div
                        key={t.tier}
                        className={`${t.color} flex items-center justify-center text-xs font-medium text-white`}
                        style={{
                          width: `${(t.count / totalAccounts) * 100}%`,
                        }}
                        title={`${t.tier}: ${t.count}`}
                      >
                        {(t.count / totalAccounts) * 100 >= 10
                          ? `${Math.round((t.count / totalAccounts) * 100)}%`
                          : ''}
                      </div>
                    ))}
                </div>
              )}

              {/* Tier breakdown list */}
              <div className="space-y-3">
                {tierData.map((t) => (
                  <div key={t.tier} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${t.color}`} />
                      <span className="text-sm text-gray-700">{t.tier}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {t.count}
                      </span>
                      <span className="text-xs text-gray-400">
                        ({totalAccounts > 0 ? Math.round((t.count / totalAccounts) * 100) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Score distribution summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-4">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Trend Summary</h2>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 font-medium">&#8593;</span>
                  <span className="text-sm text-gray-700">Rising</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {scores.filter((s) => s.trend === 'RISING').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 font-medium">&#8594;</span>
                  <span className="text-sm text-gray-700">Stable</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {scores.filter((s) => s.trend === 'STABLE').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-medium">&#8595;</span>
                  <span className="text-sm text-gray-700">Falling</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {scores.filter((s) => s.trend === 'FALLING').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function AccountRow({
  score,
  rank,
  isExpanded,
  onToggle,
}: {
  score: AccountScore;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <td className="py-3 px-4 text-gray-400 font-medium">{rank}</td>
        <td className="py-3 px-4">
          <div>
            <span className="font-medium text-gray-900">
              {score.account?.name || 'Unknown'}
            </span>
            {score.account?.domain && (
              <span className="text-xs text-gray-400 ml-2">
                {score.account.domain}
              </span>
            )}
          </div>
        </td>
        <td className="py-3 px-4">
          <ScoreBar score={score.score} />
        </td>
        <td className="py-3 px-4">
          <TierBadge tier={score.tier} />
        </td>
        <td className="py-3 px-4 text-center">
          <TrendIndicator trend={score.trend} />
        </td>
        <td className="py-3 px-4 text-right text-gray-600">{score.signalCount}</td>
        <td className="py-3 px-4 text-right text-gray-500 text-xs">
          {score.lastSignalAt ? timeAgo(score.lastSignalAt) : '--'}
        </td>
      </tr>
      {isExpanded && score.factors && score.factors.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-4 py-3">
            <div className="pl-8">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Score Factors
              </p>
              <div className="space-y-2">
                {score.factors.map((factor, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">
                        {factor.name}
                      </span>
                      <span className="text-gray-400 ml-2 text-xs">
                        {factor.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        weight: {factor.weight}
                      </span>
                      <span className="font-semibold text-gray-900 w-10 text-right">
                        {factor.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
