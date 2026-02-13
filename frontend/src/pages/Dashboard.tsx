import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import type { Contact, Deal, Activity, Signal, AccountScore } from '../types';
import { STAGE_LABELS, STAGE_COLORS, TIER_COLORS } from '../types';
import Spinner from '../components/Spinner';
import GettingStarted from '../components/GettingStarted';

interface DashboardStats {
  contacts: { total: number; recent: Contact[] };
  companies: { total: number };
  deals: { total: number; totalValue: number; byStage: Record<string, number> };
  activities: { total: number; recent: Activity[] };
  signals: { recent: Signal[] };
  hotAccounts: AccountScore[];
}

interface AnalyticsData {
  trends: { date: string; count: number }[];
  distribution: Record<string, number>;
  topSignals: { type: string; count: number }[];
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [contactsRes, companiesRes, dealsRes, activitiesRes, signalsRes, scoresRes] = await Promise.all([
          api.get('/contacts', { params: { limit: 5 } }),
          api.get('/companies', { params: { limit: 1 } }),
          api.get('/deals', { params: { limit: 100 } }),
          api.get('/activities', { params: { limit: 5 } }),
          api.get('/signals', { params: { limit: 8 } }).catch(() => ({ data: { signals: [] } })),
          api.get('/signals/scores', { params: { tier: 'HOT', limit: 5 } }).catch(() => ({ data: { scores: [] } })),
        ]);

        const deals: Deal[] = dealsRes.data.deals || [];
        const totalValue = deals.reduce((sum: number, d: Deal) => sum + (d.amount || 0), 0);
        const byStage: Record<string, number> = {};
        deals.forEach((d: Deal) => {
          byStage[d.stage] = (byStage[d.stage] || 0) + 1;
        });

        setStats({
          contacts: {
            total: contactsRes.data.pagination?.total ?? 0,
            recent: contactsRes.data.contacts || [],
          },
          companies: {
            total: companiesRes.data.pagination?.total ?? 0,
          },
          deals: {
            total: dealsRes.data.pagination?.total ?? 0,
            totalValue,
            byStage,
          },
          activities: {
            total: activitiesRes.data.pagination?.total ?? 0,
            recent: activitiesRes.data.activities || [],
          },
          signals: {
            recent: signalsRes.data.signals || [],
          },
          hotAccounts: scoresRes.data.scores || [],
        });
      } catch {
        // If API fails (e.g. no org), show empty state
        setStats({
          contacts: { total: 0, recent: [] },
          companies: { total: 0 },
          deals: { total: 0, totalValue: 0, byStage: {} },
          activities: { total: 0, recent: [] },
          signals: { recent: [] },
          hotAccounts: [],
        });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  // Fetch analytics data independently
  useEffect(() => {
    Promise.allSettled([
      api.get('/analytics/signal-trends', { params: { days: 30 } }),
      api.get('/analytics/pqa-distribution'),
      api.get('/analytics/top-signals', { params: { limit: 8 } }),
    ]).then(([trendsRes, distRes, topRes]) => {
      setAnalytics({
        trends: trendsRes.status === 'fulfilled' ? trendsRes.value.data.trends || [] : [],
        distribution: distRes.status === 'fulfilled' ? distRes.value.data.distribution || {} : {},
        topSignals: topRes.status === 'fulfilled' ? topRes.value.data.types || [] : [],
      });
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      label: 'Total Contacts',
      value: stats.contacts.total,
      href: '/contacts',
      color: 'bg-blue-500',
    },
    {
      label: 'Companies',
      value: stats.companies.total,
      href: '/companies',
      color: 'bg-emerald-500',
    },
    {
      label: 'Open Deals',
      value: stats.deals.total,
      href: '/deals',
      color: 'bg-purple-500',
    },
    {
      label: 'Pipeline Value',
      value: `$${stats.deals.totalValue.toLocaleString()}`,
      href: '/deals',
      color: 'bg-amber-500',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Getting Started checklist for new users */}
      <GettingStarted />

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your CRM data</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.href}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}>
                <span className="text-white text-lg font-bold">
                  {typeof card.value === 'number' ? '#' : '$'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Analytics Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Signal Trends */}
          <SignalTrendsChart trends={analytics.trends} />

          {/* PQA Score Distribution */}
          <PQADistributionChart distribution={analytics.distribution} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deal pipeline summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Deal Pipeline</h2>
            <Link to="/deals" className="text-sm text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {Object.keys(stats.deals.byStage).length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No deals yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.deals.byStage).map(([stage, count]) => {
                const stageKey = stage as keyof typeof STAGE_LABELS;
                return (
                  <div key={stage} className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        STAGE_COLORS[stageKey] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {STAGE_LABELS[stageKey] || stage}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent contacts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Contacts</h2>
            <Link to="/contacts" className="text-sm text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {stats.contacts.recent.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No contacts yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats.contacts.recent.map((contact) => (
                <Link
                  key={contact.id}
                  to={`/contacts/${contact.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                    {contact.firstName?.[0]}
                    {contact.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{contact.email || contact.title || ''}</p>
                  </div>
                  {contact.company && (
                    <span className="text-xs text-gray-400">{contact.company.name}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Top Signal Types */}
        {analytics && analytics.topSignals.length > 0 && (
          <TopSignalTypesChart topSignals={analytics.topSignals} />
        )}

        {/* Recent Signal + Activity Feed */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
            <div className="flex gap-3">
              <Link to="/signals" className="text-sm text-indigo-600 hover:text-indigo-500">Signals</Link>
              <Link to="/activities" className="text-sm text-indigo-600 hover:text-indigo-500">Activities</Link>
            </div>
          </div>
          {stats.activities.recent.length === 0 && stats.signals.recent.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No activity yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Merge signals + activities, show most recent first */}
              {[
                ...stats.signals.recent.map((s) => ({
                  id: s.id,
                  kind: 'signal' as const,
                  title: s.type,
                  subtitle: s.account?.name || s.actor ? `${s.actor?.firstName || ''} ${s.actor?.lastName || ''}`.trim() : s.source?.name || '',
                  date: s.timestamp,
                })),
                ...stats.activities.recent.map((a) => ({
                  id: a.id,
                  kind: 'activity' as const,
                  title: a.title,
                  subtitle: `${a.type} - ${a.status}`,
                  date: a.createdAt,
                })),
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 8)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-4 py-3">
                    {item.kind === 'signal' ? (
                      <span className="text-xs font-bold w-7 h-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">S</span>
                    ) : (
                      <ActivityTypeBadge type={item.subtitle.split(' - ')[0]} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(item.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Hot Accounts */}
        {stats.hotAccounts.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Hot Accounts</h2>
              <Link to="/scores" className="text-sm text-indigo-600 hover:text-indigo-500">View all scores</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {stats.hotAccounts.map((s) => (
                <Link
                  key={s.id}
                  to={`/companies/${s.accountId}`}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900 truncate">{s.account?.name || 'Unknown'}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[s.tier]}`}>{s.tier}</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{s.score}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{s.signalCount} signals</span>
                    <span>{s.userCount} users</span>
                    <span className="capitalize">{s.trend.toLowerCase()}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics Chart Components
// ---------------------------------------------------------------------------

function SignalTrendsChart({ trends }: { trends: { date: string; count: number }[] }) {
  if (trends.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Signal Volume (30d)</h2>
        <p className="text-sm text-gray-400 py-8 text-center">No signal data available</p>
      </div>
    );
  }

  const maxCount = Math.max(...trends.map((t) => t.count), 1);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Signal Volume (30d)</h2>
        <span className="text-xs text-gray-400">
          Peak: {maxCount} signals
        </span>
      </div>

      {/* Y-axis label + chart */}
      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-xs text-gray-400 py-0.5 w-8 text-right">
          <span>{maxCount}</span>
          <span>{Math.round(maxCount / 2)}</span>
          <span>0</span>
        </div>
        <div className="flex-1">
          <div className="flex items-end gap-0.5 h-40">
            {trends.map((item, i) => (
              <div
                key={i}
                className="flex-1 bg-indigo-500 rounded-t min-w-[4px] transition-all hover:bg-indigo-600 cursor-default"
                style={{ height: `${(item.count / maxCount) * 100}%`, minHeight: item.count > 0 ? '2px' : '0px' }}
                title={`${formatShortDate(item.date)}: ${item.count} signals`}
              />
            ))}
          </div>
          {/* X-axis labels */}
          <div className="flex justify-between mt-2">
            {trends
              .filter((_, i) => i % 5 === 0 || i === trends.length - 1)
              .map((item, i) => (
                <span key={i} className="text-xs text-gray-400">
                  {formatShortDate(item.date)}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PQADistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const tiers = ['HOT', 'WARM', 'COLD', 'INACTIVE'] as const;
  const tierColors: Record<string, string> = {
    HOT: 'bg-red-500',
    WARM: 'bg-orange-500',
    COLD: 'bg-blue-500',
    INACTIVE: 'bg-gray-400',
  };
  const tierBgColors: Record<string, string> = {
    HOT: 'bg-red-50',
    WARM: 'bg-orange-50',
    COLD: 'bg-blue-50',
    INACTIVE: 'bg-gray-50',
  };
  const tierTextColors: Record<string, string> = {
    HOT: 'text-red-700',
    WARM: 'text-orange-700',
    COLD: 'text-blue-700',
    INACTIVE: 'text-gray-500',
  };

  const total = Object.values(distribution).reduce((sum, v) => sum + v, 0);
  const maxCount = Math.max(...Object.values(distribution), 1);

  if (total === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Health Distribution</h2>
        <p className="text-sm text-gray-400 py-8 text-center">No account scores yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Account Health Distribution</h2>
        <span className="text-xs text-gray-400">{total} total accounts</span>
      </div>
      <div className="space-y-3">
        {tiers.map((tier) => {
          const count = distribution[tier] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;

          return (
            <div key={tier} className={`rounded-lg p-3 ${tierBgColors[tier]}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm font-semibold ${tierTextColors[tier]}`}>{tier}</span>
                <span className={`text-sm font-medium ${tierTextColors[tier]}`}>
                  {count} <span className="text-xs font-normal opacity-70">({pct}%)</span>
                </span>
              </div>
              <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${tierColors[tier]}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopSignalTypesChart({ topSignals }: { topSignals: { type: string; count: number }[] }) {
  if (topSignals.length === 0) return null;

  const maxCount = Math.max(...topSignals.map((s) => s.count), 1);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Top Signals (This Month)</h2>
        <Link to="/signals" className="text-sm text-indigo-600 hover:text-indigo-500">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {topSignals.map((signal) => {
          const barWidth = (signal.count / maxCount) * 100;
          return (
            <div key={signal.type} className="flex items-center gap-3">
              <div className="w-28 flex-shrink-0">
                <span className="text-sm font-medium text-gray-700 truncate block">
                  {signal.type.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-600 w-10 text-right">{signal.count}</span>
              </div>
            </div>
          );
        })}
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

function ActivityTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    TASK: 'bg-blue-100 text-blue-700',
    CALL: 'bg-green-100 text-green-700',
    MEETING: 'bg-purple-100 text-purple-700',
    EMAIL: 'bg-yellow-100 text-yellow-700',
    NOTE: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-md ${colors[type] || colors.NOTE}`}>
      {type}
    </span>
  );
}
