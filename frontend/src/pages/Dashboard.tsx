import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import type { Contact, Deal, Activity, Signal, AccountScore } from '../types';
import { STAGE_LABELS, STAGE_COLORS, TIER_COLORS } from '../types';
import { DashboardSkeleton } from '../components/Spinner';
import OnboardingChecklist from '../components/OnboardingChecklist';
import DemoDataBanner from '../components/DemoDataBanner';
import ConnectorHealthCard from '../components/ConnectorHealthCard';
import ProductTour from '../components/ProductTour';
import { useProductTour } from '../lib/useProductTour';
import { useToast } from '../components/Toast';
import { useAuth } from '../lib/auth';

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
  const tour = useProductTour();
  const toast = useToast();
  const { user } = useAuth();
  const isDemo = user?.organizations?.some(
    (uo: { organization?: { name?: string } }) => uo.organization?.name?.startsWith('DevSignal Demo'),
  );

  useEffect(() => { document.title = 'Dashboard — DevSignal'; }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [contactsRes, companiesRes, dealsRes, activitiesRes, signalsRes, scoresRes] = await Promise.all([
          api.get('/contacts', { params: { limit: 5 } }),
          api.get('/companies', { params: { limit: 1 } }),
          api.get('/deals', { params: { limit: 100 } }),
          api.get('/activities', { params: { limit: 5 } }),
          api.get('/signals', { params: { limit: 10 } }).catch(() => ({ data: { signals: [] } })),
          api.get('/signals/accounts/top', { params: { tier: 'HOT', limit: 5 } }).catch(() => ({ data: { accounts: [] } })),
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
          hotAccounts: scoresRes.data.accounts || [],
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
        toast.error('Failed to load dashboard data.');
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
      const failedCount = [trendsRes, distRes, topRes].filter((r) => r.status === 'rejected').length;
      if (failedCount === 3) {
        toast.error('Failed to load analytics charts.');
      }
      setAnalytics({
        trends: trendsRes.status === 'fulfilled' ? trendsRes.value.data.trends || [] : [],
        distribution: distRes.status === 'fulfilled' ? distRes.value.data.distribution || {} : {},
        topSignals: topRes.status === 'fulfilled' ? topRes.value.data.signals || [] : [],
      });
    });
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!stats) return null;

  const isNewUser = stats.contacts.total < 5;

  // -- New user: show onboarding hero instead of stat cards --
  if (isNewUser) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
        <DemoDataBanner />
        <OnboardingChecklist />

        <div className="mb-8" data-tour="dashboard-title">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of your signal intelligence</p>
        </div>

        {/* Hero onboarding banner */}
        <OnboardingHero />

        {/* Still show any signals or hot accounts that might exist from demo data */}
        {stats.signals.recent.length > 0 && (
          <div className="mt-8">
            <RecentActivityFeed signals={stats.signals.recent} activities={stats.activities.recent} />
          </div>
        )}

        {/* Product Tour Overlay */}
        <ProductTour
          active={tour.isTourActive}
          step={tour.step}
          currentStep={tour.currentStep}
          totalSteps={tour.totalSteps}
          onNext={tour.nextStep}
          onPrev={tour.prevStep}
          onSkip={tour.skipTour}
        />
      </div>
    );
  }

  // -- Active user: full dashboard --
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

  // Compute daily digest numbers
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySignalCount = stats.signals.recent.filter(
    (s) => s.timestamp && s.timestamp.slice(0, 10) === todayStr
  ).length;
  const todayContactCount = stats.contacts.recent.filter(
    (c) => c.createdAt && c.createdAt.slice(0, 10) === todayStr
  ).length;
  // Find the hottest rising account for the insight line
  const topRisingAccount = stats.hotAccounts.find((a) => a.trend === 'RISING') || stats.hotAccounts[0];

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Demo data banner */}
      <DemoDataBanner />

      {/* Getting Started checklist for new users */}
      <OnboardingChecklist />

      <div className="mb-8 flex items-center justify-between" data-tour="dashboard-title">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of your signal intelligence</p>
        </div>
        {tour.hasCompletedTour && (
          <button
            onClick={tour.startTour}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
            title="Restart product tour"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
            Restart tour
          </button>
        )}
      </div>

      {/* Hot Accounts Spotlight — demo users see this first for "wow" moment */}
      {isDemo && stats.hotAccounts.length > 0 && (() => {
        const hot = stats.hotAccounts.filter((a) => (a.score ?? 0) >= 70).slice(0, 3);
        if (hot.length === 0) return null;
        return (
          <Link
            to="/scores"
            className="block mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg p-6 hover:shadow-2xl transition-all hover:scale-[1.01]"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Your Hottest Accounts</h2>
                <p className="text-sm text-indigo-200 mt-0.5">
                  {stats.hotAccounts.length} accounts scored — {hot.length} ready to convert
                </p>
              </div>
              <span className="text-sm font-medium text-white bg-white/20 px-3 py-1 rounded-full group-hover:bg-white/30 transition-colors">
                View All Scores &rarr;
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {hot.map((account) => (
                <div key={account.accountId} className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-white truncate">{account.account?.name || 'Unknown'}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      (account.score ?? 0) >= 80
                        ? 'bg-red-500/30 text-red-100'
                        : 'bg-amber-500/30 text-amber-100'
                    }`}>
                      {account.score ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-indigo-200">
                    <span className={`uppercase font-semibold ${
                      account.tier === 'HOT' ? 'text-red-300' : 'text-amber-300'
                    }`}>{account.tier}</span>
                    {account.trend && (
                      <span>{account.trend === 'RISING' ? '↑ Rising' : account.trend === 'FALLING' ? '↓ Falling' : '→ Stable'}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Link>
        );
      })()}

      {/* Daily Digest Card */}
      <DailyDigest
        signalCount={todaySignalCount}
        contactCount={todayContactCount}
        topAccount={topRisingAccount}
        totalSignals={stats.signals.recent.length}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-tour="stat-cards">
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

      {/* Connector Health */}
      <div className="mb-8">
        <ConnectorHealthCard />
      </div>

      {/* Recent Activity Feed */}
      <RecentActivityFeed signals={stats.signals.recent} activities={stats.activities.recent} />

      {/* Analytics Charts */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 mt-8">
          {/* Signal Trends */}
          <SignalTrendsChart trends={analytics.trends} />

          {/* PQA Score Distribution */}
          <PQADistributionChart distribution={analytics.distribution} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot Accounts */}
        <HotAccountsSection accounts={stats.hotAccounts} />

        {/* Deal pipeline summary */}
        <DealPipelineSection deals={stats.deals} />

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
      </div>

      {/* Product Tour Overlay */}
      <ProductTour
        active={tour.isTourActive}
        step={tour.step}
        currentStep={tour.currentStep}
        totalSteps={tour.totalSteps}
        onNext={tour.nextStep}
        onPrev={tour.prevStep}
        onSkip={tour.skipTour}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding Hero (for new users with < 5 contacts)
// ---------------------------------------------------------------------------

function OnboardingHero() {
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 sm:p-8 lg:p-10 text-white">
      <div className="max-w-2xl">
        <h2 className="text-2xl lg:text-3xl font-bold mb-3">
          Welcome to DevSignal!
        </h2>
        <p className="text-indigo-100 text-lg mb-8 leading-relaxed">
          Connect your first signal source to start discovering who's evaluating your tool.
          We'll track developer activity across GitHub, npm, documentation, and more --
          so your team knows exactly which companies to talk to.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-indigo-700 font-semibold rounded-lg hover:bg-indigo-50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
            Connect GitHub
          </Link>
          <Link
            to="/contacts"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/15 text-white font-semibold rounded-lg hover:bg-white/25 transition-colors border border-white/20"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Import Contacts
          </Link>
          <Link
            to="/"
            onClick={(e) => {
              e.preventDefault();
              // Trigger demo data load via the DemoDataBanner mechanism
              window.dispatchEvent(new CustomEvent('devsignal:load-demo'));
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/15 text-white font-semibold rounded-lg hover:bg-white/25 transition-colors border border-white/20"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            Explore Demo Data
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Daily Digest Card
// ---------------------------------------------------------------------------

function DailyDigest({
  signalCount,
  contactCount,
  topAccount,
  totalSignals,
}: {
  signalCount: number;
  contactCount: number;
  topAccount?: AccountScore | null;
  totalSignals: number;
}) {
  // Only show if there's something meaningful to report
  const hasActivity = signalCount > 0 || contactCount > 0 || topAccount;
  if (!hasActivity && totalSignals === 0) return null;

  // Build insight line
  let insight = '';
  if (topAccount && topAccount.account) {
    const trendLabel = topAccount.trend === 'RISING' ? 'rising' : topAccount.trend === 'FALLING' ? 'falling' : 'stable';
    insight = `${topAccount.account.name}'s score is ${topAccount.score} (${topAccount.tier}) and ${trendLabel}`;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Daily Digest</h3>
          <p className="text-sm text-gray-600">
            Today: <span className="font-medium">{signalCount} new signal{signalCount !== 1 ? 's' : ''}</span>
            {contactCount > 0 && (
              <>, <span className="font-medium">{contactCount} new contact{contactCount !== 1 ? 's' : ''}</span></>
            )}
            {topAccount && (
              <>, <span className="font-medium">{topAccount.account?.name || 'Unknown'}</span> is your hottest account</>
            )}
          </p>
          {insight && (
            <p className="text-xs text-gray-500 mt-1">
              {insight}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Activity Feed (the "living" feed)
// ---------------------------------------------------------------------------

function RecentActivityFeed({ signals, activities }: { signals: Signal[]; activities: Activity[] }) {
  const hasSignals = signals.length > 0;
  const hasActivities = activities.length > 0;

  if (!hasSignals && !hasActivities) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Recent Activity</h2>
        <div className="py-8 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">No signals yet.</p>
          <p className="text-xs text-gray-400 mb-4">Connect GitHub, npm, or another source to start tracking developer activity.</p>
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Connect a signal source
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  // Merge signals + activities, sort by recency, show last 10
  const feed = [
    ...signals.map((s) => ({
      id: s.id,
      kind: 'signal' as const,
      title: formatSignalTitle(s),
      subtitle: s.account?.name || (s.actor ? `${s.actor?.firstName || ''} ${s.actor?.lastName || ''}`.trim() : '') || s.source?.name || '',
      linkTo: s.account?.id ? `/companies/${s.account.id}` : (s.actor?.id ? `/contacts/${s.actor.id}` : '/signals'),
      date: s.timestamp,
      signalType: s.type,
    })),
    ...activities.map((a) => ({
      id: a.id,
      kind: 'activity' as const,
      title: a.title,
      subtitle: `${a.type} - ${a.status}`,
      linkTo: '/activities',
      date: a.createdAt,
      signalType: '',
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <Link to="/signals" className="text-sm text-indigo-600 hover:text-indigo-500">View all</Link>
      </div>
      <div className="divide-y divide-gray-100">
        {feed.map((item) => (
          <Link
            key={item.id}
            to={item.linkTo}
            className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
          >
            {item.kind === 'signal' ? (
              <SignalTypeBadge type={item.signalType} />
            ) : (
              <ActivityTypeBadge type={item.subtitle.split(' - ')[0]} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
              {item.subtitle && (
                <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
              )}
            </div>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatRelativeTime(item.date)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hot Accounts Section (with empty state)
// ---------------------------------------------------------------------------

function HotAccountsSection({ accounts }: { accounts: AccountScore[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Hot Accounts</h2>
        <Link to="/scores" className="text-sm text-indigo-600 hover:text-indigo-500">View all scores</Link>
      </div>
      {accounts.length === 0 ? (
        <div className="py-6 text-center">
          <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1.001A3.75 3.75 0 0012 18z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">No hot accounts yet.</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Accounts scoring 80+ will appear here once you have signals flowing. Connect a source to start tracking.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((s) => (
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
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deal Pipeline Section (with empty state)
// ---------------------------------------------------------------------------

function DealPipelineSection({ deals }: { deals: DashboardStats['deals'] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Deal Pipeline</h2>
        <Link to="/deals" className="text-sm text-indigo-600 hover:text-indigo-500">
          View all
        </Link>
      </div>
      {Object.keys(deals.byStage).length === 0 ? (
        <div className="py-6 text-center">
          <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 mb-1">No deals yet.</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            Deals are created automatically when accounts reach "WARM" status, or manually from the Companies page.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(deals.byStage).map(([stage, count]) => {
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

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatShortDate(dateStr);
}

function formatSignalTitle(signal: Signal): string {
  const type = signal.type?.replace(/_/g, ' ').toLowerCase() || 'signal';
  const actorName = signal.actor
    ? `${signal.actor.firstName || ''} ${signal.actor.lastName || ''}`.trim()
    : '';
  const accountName = signal.account?.name || '';

  if (actorName && accountName) {
    return `${actorName} at ${accountName} -- ${type}`;
  }
  if (accountName) {
    return `${accountName} -- ${type}`;
  }
  if (actorName) {
    return `${actorName} -- ${type}`;
  }
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function SignalTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    github_star: 'bg-amber-100 text-amber-700',
    github_fork: 'bg-amber-100 text-amber-700',
    github_issue: 'bg-amber-100 text-amber-700',
    github_pr: 'bg-amber-100 text-amber-700',
    npm_download: 'bg-red-100 text-red-700',
    npm_install: 'bg-red-100 text-red-700',
    doc_visit: 'bg-blue-100 text-blue-700',
    page_view: 'bg-blue-100 text-blue-700',
    sign_up: 'bg-green-100 text-green-700',
    api_usage: 'bg-indigo-100 text-indigo-700',
  };

  const normalizedType = (type || '').toLowerCase().replace(/ /g, '_');
  const colorClass = colors[normalizedType] || 'bg-amber-100 text-amber-700';
  const icon = normalizedType.startsWith('github') ? 'GH' : normalizedType.startsWith('npm') ? 'npm' : 'S';

  return (
    <span className={`text-[10px] font-bold w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${colorClass}`}>
      {icon}
    </span>
  );
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
