import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanName = 'free' | 'pro' | 'growth' | 'scale';
type PlanStatus = 'active' | 'past_due' | 'canceled';

interface SubscriptionInfo {
  plan: PlanName;
  planStatus: PlanStatus;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}

interface UsageInfo {
  contacts: { used: number; limit: number };
  signals: { used: number; limit: number };
  users: { used: number; limit: number };
}

interface PlanConfig {
  name: string;
  key: PlanName;
  price: string;
  priceNote: string;
  contacts: string;
  signals: string;
  users: string;
  features: string[];
  highlight?: boolean;
}

// ---------------------------------------------------------------------------
// Plan data
// ---------------------------------------------------------------------------

const PLANS: PlanConfig[] = [
  {
    name: 'Free',
    key: 'free',
    price: '$0',
    priceNote: '/mo',
    contacts: '1,000',
    signals: '5,000/mo',
    users: '1',
    features: [
      'Core CRM (contacts, companies, deals)',
      'Signal ingestion (5k/mo)',
      'PQA scoring',
      'REST + GraphQL APIs',
    ],
  },
  {
    name: 'Pro',
    key: 'pro',
    price: '$79',
    priceNote: '/mo',
    contacts: '25,000',
    signals: '100,000/mo',
    users: '10',
    highlight: true,
    features: [
      'Everything in Free',
      '25k contacts',
      '100k signals/mo',
      'Up to 10 users',
      'Slack notifications',
      'CSV import/export',
      'Priority support',
    ],
  },
  {
    name: 'Growth',
    key: 'growth',
    price: '$199',
    priceNote: '/mo',
    contacts: '100,000',
    signals: '500,000/mo',
    users: '25',
    features: [
      'Everything in Pro',
      '100k contacts',
      '500k signals/mo',
      'Up to 25 users',
      'Custom objects',
      'Advanced AI features',
      'Priority support',
    ],
  },
  {
    name: 'Scale',
    key: 'scale',
    price: '$299',
    priceNote: '/mo',
    contacts: 'Unlimited',
    signals: 'Unlimited',
    users: 'Unlimited',
    features: [
      'Everything in Growth',
      'Unlimited contacts & signals',
      'Unlimited users',
      'Dedicated support',
      'SLA guarantee',
      'SSO / SAML',
    ],
  },
];

const STATUS_BADGES: Record<PlanStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700' },
  past_due: { label: 'Past Due', className: 'bg-yellow-100 text-yellow-700' },
  canceled: { label: 'Canceled', className: 'bg-red-100 text-red-700' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Billing() {
  const toast = useToast();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanName | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [subRes, usageRes] = await Promise.allSettled([
        api.get('/billing/subscription'),
        api.get('/usage'),
      ]);

      if (subRes.status === 'fulfilled') {
        setSubscription(subRes.value.data);
      } else {
        // Default to free if billing endpoint not available
        setSubscription({ plan: 'free', planStatus: 'active', stripeSubscriptionId: null, stripeCustomerId: null });
      }

      if (usageRes.status === 'fulfilled') {
        setUsage(usageRes.value.data);
      }
    } catch {
      toast.error('Failed to load billing information.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- Stripe Checkout ----

  async function handleUpgrade(planKey: PlanName) {
    if (planKey === 'free') return;

    setCheckoutLoading(planKey);
    try {
      const priceMap: Record<string, string> = {
        pro: import.meta.env.VITE_STRIPE_PRICE_PRO || 'price_pro_placeholder',
        growth: import.meta.env.VITE_STRIPE_PRICE_GROWTH || 'price_growth_placeholder',
        scale: import.meta.env.VITE_STRIPE_PRICE_SCALE || 'price_scale_placeholder',
      };
      const priceId = priceMap[planKey] || 'price_pro_placeholder';

      const { data } = await api.post('/billing/checkout', {
        priceId,
        successUrl: `${window.location.origin}/billing?success=true`,
        cancelUrl: `${window.location.origin}/billing?canceled=true`,
      });

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to create checkout session. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  }

  // ---- Stripe Customer Portal ----

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const { data } = await api.post('/billing/portal', {
        returnUrl: `${window.location.origin}/billing`,
      });

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      toast.error('Failed to open billing portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  }

  // ---- Check URL params for success / cancel ----

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success('Subscription updated successfully!');
      // Clean URL
      window.history.replaceState({}, '', '/billing');
    } else if (params.get('canceled') === 'true') {
      toast.error('Checkout was canceled.');
      window.history.replaceState({}, '', '/billing');
    }
  }, [toast]);

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const currentPlan = subscription?.plan ?? 'free';
  const planStatus = subscription?.planStatus ?? 'active';
  const badge = STATUS_BADGES[planStatus];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-500 mt-1">Manage your subscription and billing details.</p>
      </div>

      {/* Current Plan Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Current Plan: <span className="text-indigo-600 capitalize">{currentPlan}</span>
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          {planStatus === 'past_due' && (
            <p className="text-sm text-yellow-600 mt-1">
              Your last payment failed. Please update your payment method to avoid service interruption.
            </p>
          )}
        </div>
        {subscription?.stripeCustomerId && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {portalLoading ? <Spinner size="sm" /> : <CreditCardIcon />}
            Manage Billing
          </button>
        )}
      </div>

      {/* Usage Stats */}
      {usage && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <UsageCard label="Contacts" used={usage.contacts.used} limit={usage.contacts.limit} />
          <UsageCard label="Signals (this month)" used={usage.signals.used} limit={usage.signals.limit} />
          <UsageCard label="Users" used={usage.users.used} limit={usage.users.limit} />
        </div>
      )}

      {/* Plan Comparison Cards */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => {
            const isCurrent = plan.key === currentPlan;
            const isDowngrade = PLANS.findIndex((p) => p.key === currentPlan) > PLANS.findIndex((p) => p.key === plan.key);

            return (
              <div
                key={plan.key}
                className={`relative bg-white border rounded-xl p-6 flex flex-col ${
                  plan.highlight
                    ? 'border-indigo-400 ring-2 ring-indigo-100'
                    : 'border-gray-200'
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                <div className="mt-2 mb-4">
                  <span className="text-3xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.priceNote}</span>
                </div>
                <div className="space-y-2 text-sm text-gray-600 mb-6">
                  <div className="flex items-center gap-2">
                    <CheckIcon /> <span>{plan.contacts} contacts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon /> <span>{plan.signals} signals</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckIcon /> <span>{plan.users} user{plan.users !== '1' ? 's' : ''}</span>
                  </div>
                </div>
                <ul className="space-y-1.5 text-sm text-gray-600 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckIcon />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-500 cursor-default"
                    >
                      Current Plan
                    </button>
                  ) : isDowngrade ? (
                    <button
                      onClick={handleManageBilling}
                      disabled={portalLoading}
                      className="w-full py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Downgrade
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={checkoutLoading !== null}
                      className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                        plan.highlight
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      }`}
                    >
                      {checkoutLoading === plan.key ? (
                        <Spinner size="sm" />
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UsageCard({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1 || limit >= Number.MAX_SAFE_INTEGER;
  const pct = unlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isHigh = pct > 80;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {used.toLocaleString()}
        <span className="text-sm font-normal text-gray-400">
          {' '}/ {unlimited ? 'Unlimited' : limit.toLocaleString()}
        </span>
      </p>
      {!unlimited && (
        <div className="mt-3 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isHigh ? 'bg-yellow-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}
