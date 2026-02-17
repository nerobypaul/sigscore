import { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// SVG Icon Components
// ---------------------------------------------------------------------------

function ArrowRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function CheckIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XMarkIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MinusIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pricing Data
// ---------------------------------------------------------------------------

interface PricingTier {
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  features: string[];
  cta: string;
  ctaLink: string;
  highlighted: boolean;
  badge?: string;
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    description: 'For indie devtool builders exploring product-led growth.',
    features: [
      '1,000 contacts',
      '5,000 signals/month',
      '1 user',
      '3 signal sources (GitHub, npm, PyPI)',
      'Basic PQA scoring',
      'REST + GraphQL API',
      'Community support',
    ],
    cta: 'Start Free',
    ctaLink: '/register',
    highlighted: false,
  },
  {
    name: 'Pro',
    monthlyPrice: 79,
    annualPrice: 63,
    description: 'For growing devtool teams turning signals into pipeline.',
    features: [
      '25,000 contacts',
      '100,000 signals/month',
      '10 users',
      'All 13 signal sources',
      'Custom scoring rules',
      'Email sequences',
      'Workflows & playbooks',
      'API access',
    ],
    cta: 'Start 14-day Trial',
    ctaLink: '/register',
    highlighted: true,
    badge: 'MOST POPULAR',
  },
  {
    name: 'Growth',
    monthlyPrice: 199,
    annualPrice: 159,
    description: 'For scaling devtool teams that need deeper signal coverage and CRM sync.',
    features: [
      '100,000 contacts',
      '500,000 signals/month',
      '25 users',
      'Everything in Pro',
      'HubSpot + Salesforce sync',
      'Clearbit enrichment',
      'Advanced analytics',
      'Zapier/Make integration',
      'Priority support',
    ],
    cta: 'Start 14-day Trial',
    ctaLink: '/register',
    highlighted: false,
  },
  {
    name: 'Scale',
    monthlyPrice: 299,
    annualPrice: 239,
    description: 'For devtool companies scaling growth across the organization.',
    features: [
      'Unlimited contacts',
      'Unlimited signals',
      'Unlimited users',
      'Everything in Growth',
      'SAML/OIDC SSO',
      'Custom SLA',
      'Dedicated support',
      'Audit log',
    ],
    cta: 'Talk to Sales',
    ctaLink: '/register',
    highlighted: false,
  },
];

// ---------------------------------------------------------------------------
// Feature Comparison Data
// ---------------------------------------------------------------------------

type FeatureValue = string | boolean;

interface ComparisonCategory {
  name: string;
  features: {
    name: string;
    free: FeatureValue;
    pro: FeatureValue;
    growth: FeatureValue;
    scale: FeatureValue;
  }[];
}

const comparisonData: ComparisonCategory[] = [
  {
    name: 'Contacts & Signals',
    features: [
      { name: 'Contacts', free: '1,000', pro: '25,000', growth: '100,000', scale: 'Unlimited' },
      { name: 'Signals per month', free: '5,000', pro: '100,000', growth: '500,000', scale: 'Unlimited' },
      { name: 'Users', free: '1', pro: '10', growth: '25', scale: 'Unlimited' },
      { name: 'Identity resolution', free: true, pro: true, growth: true, scale: true },
      { name: 'Account 360 profiles', free: true, pro: true, growth: true, scale: true },
    ],
  },
  {
    name: 'Signal Sources',
    features: [
      { name: 'GitHub', free: true, pro: true, growth: true, scale: true },
      { name: 'npm', free: true, pro: true, growth: true, scale: true },
      { name: 'PyPI', free: true, pro: true, growth: true, scale: true },
      { name: 'Segment', free: false, pro: true, growth: true, scale: true },
      { name: 'Discord', free: false, pro: true, growth: true, scale: true },
      { name: 'Product SDK events', free: false, pro: true, growth: true, scale: true },
      { name: 'Custom webhooks', free: false, pro: true, growth: true, scale: true },
      { name: 'All 13 sources', free: false, pro: true, growth: true, scale: true },
    ],
  },
  {
    name: 'Scoring & AI',
    features: [
      { name: 'Basic PQA scoring', free: true, pro: true, growth: true, scale: true },
      { name: 'Custom scoring rules', free: false, pro: true, growth: true, scale: true },
      { name: 'AI account briefs', free: false, pro: true, growth: true, scale: true },
      { name: 'AI next-best-actions', free: false, pro: true, growth: true, scale: true },
      { name: 'Advanced analytics', free: false, pro: false, growth: true, scale: true },
    ],
  },
  {
    name: 'Automation',
    features: [
      { name: 'Email sequences', free: false, pro: true, growth: true, scale: true },
      { name: 'Workflow automation', free: false, pro: true, growth: true, scale: true },
      { name: 'Pre-built playbooks', free: false, pro: true, growth: true, scale: true },
      { name: 'Zapier / Make', free: false, pro: false, growth: true, scale: true },
    ],
  },
  {
    name: 'Integrations',
    features: [
      { name: 'REST + GraphQL API', free: true, pro: true, growth: true, scale: true },
      { name: '@devsignal/node SDK', free: true, pro: true, growth: true, scale: true },
      { name: 'Slack integration', free: false, pro: true, growth: true, scale: true },
      { name: 'HubSpot sync', free: false, pro: false, growth: true, scale: true },
      { name: 'Salesforce sync', free: false, pro: false, growth: true, scale: true },
      { name: 'Clearbit enrichment', free: false, pro: false, growth: true, scale: true },
      { name: 'Custom integrations', free: false, pro: false, growth: false, scale: true },
    ],
  },
  {
    name: 'Admin & Security',
    features: [
      { name: 'RBAC', free: false, pro: true, growth: true, scale: true },
      { name: 'Saved views', free: false, pro: true, growth: true, scale: true },
      { name: 'Audit log', free: false, pro: false, growth: false, scale: true },
      { name: 'SAML / OIDC SSO', free: false, pro: false, growth: false, scale: true },
      { name: 'Custom SLA', free: false, pro: false, growth: false, scale: true },
    ],
  },
  {
    name: 'Support',
    features: [
      { name: 'Community support', free: true, pro: true, growth: true, scale: true },
      { name: 'Email support', free: false, pro: true, growth: true, scale: true },
      { name: 'Priority support', free: false, pro: false, growth: true, scale: true },
      { name: 'Dedicated support', free: false, pro: false, growth: false, scale: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// FAQ Data
// ---------------------------------------------------------------------------

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'Is there a free trial?',
    answer:
      'Yes, Pro and Growth include a 14-day free trial. No credit card required.',
  },
  {
    question: 'Can I switch plans?',
    answer:
      'Yes, upgrade or downgrade anytime. Changes take effect immediately. Your data is never deleted when downgrading -- you just lose access to premium features until you re-upgrade.',
  },
  {
    question: 'What happens if I exceed my limits?',
    answer:
      "We'll notify you at 80% and 100%. Signals over the limit are queued until next month. You can always upgrade mid-cycle to increase limits immediately.",
  },
  {
    question: 'Do you offer annual discounts?',
    answer:
      'Yes, save 20% with annual billing. Toggle to "Annual" above to see discounted prices.',
  },
  {
    question: 'What signal sources are included?',
    answer:
      'Free includes GitHub, npm, and PyPI. Pro and above include all 13 sources including Segment, Discord, product SDK events, custom webhooks, and more. Growth and Scale add Zapier/Make for additional sources.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. SOC 2 compliant infrastructure, encrypted at rest (AES-256) and in transit (TLS 1.3). RBAC on all plans, audit logging on Scale. We use row-level multi-tenancy so your data is logically isolated.',
  },
  {
    question: 'Can I self-host?',
    answer:
      "Yes. DevSignal ships with a Docker Compose configuration for self-hosting on your own infrastructure. The Scale plan includes priority support for self-hosted deployments.",
  },
  {
    question: 'How does billing work?',
    answer:
      'Monthly or annual billing via Stripe. Invoices are available in your billing settings. Annual plans are billed upfront. You can cancel anytime.',
  },
];

// ---------------------------------------------------------------------------
// Usage Estimator Logic
// ---------------------------------------------------------------------------

function getRecommendedTier(
  developers: number,
  repos: number,
  teamSize: number
): string {
  const estimatedContacts = developers * 5;
  const estimatedSignals = repos * 1000;

  if (
    estimatedContacts <= 1000 &&
    estimatedSignals <= 5000 &&
    teamSize <= 1
  ) {
    return 'Free';
  }
  if (
    estimatedContacts <= 25000 &&
    estimatedSignals <= 100000 &&
    teamSize <= 10
  ) {
    return 'Pro';
  }
  if (
    estimatedContacts <= 100000 &&
    estimatedSignals <= 500000 &&
    teamSize <= 25
  ) {
    return 'Growth';
  }
  return 'Scale';
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function BillingToggle({
  isAnnual,
  onToggle,
}: {
  isAnnual: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 mb-12">
      <span
        className={`text-sm font-medium transition-colors ${
          !isAnnual ? 'text-white' : 'text-gray-500'
        }`}
      >
        Monthly
      </span>
      <button
        onClick={onToggle}
        className="relative w-14 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        style={{ backgroundColor: isAnnual ? '#6366f1' : '#374151' }}
        aria-label="Toggle annual billing"
      >
        <span
          className="absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-300"
          style={{
            transform: isAnnual ? 'translateX(28px)' : 'translateX(0)',
          }}
        />
      </button>
      <span
        className={`text-sm font-medium transition-colors ${
          isAnnual ? 'text-white' : 'text-gray-500'
        }`}
      >
        Annual
      </span>
      {isAnnual && (
        <span className="ml-1 inline-flex items-center bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
          Save 20%
        </span>
      )}
    </div>
  );
}

function PricingCard({
  tier,
  isAnnual,
}: {
  tier: PricingTier;
  isAnnual: boolean;
}) {
  const price = isAnnual ? tier.annualPrice : tier.monthlyPrice;
  const isFree = tier.monthlyPrice === 0;

  return (
    <div
      className={`relative rounded-2xl p-8 flex flex-col ${
        tier.highlighted
          ? 'bg-gray-800 ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/10'
          : 'bg-gray-800/50 border border-gray-700/50'
      }`}
    >
      {tier.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap">
            {tier.badge}
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-lg font-bold text-white">{tier.name}</h3>
        <p className="mt-1 text-sm text-gray-400">{tier.description}</p>
      </div>

      <div className="mb-6">
        <span className="text-5xl font-extrabold text-white">
          ${price}
        </span>
        <span className="text-base text-gray-400">/mo</span>
        {isAnnual && !isFree && (
          <div className="mt-1 text-sm text-gray-500">
            ${price * 12}/yr billed annually
          </div>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex-shrink-0">
              <CheckIcon
                className={`w-5 h-5 ${
                  tier.highlighted ? 'text-indigo-400' : 'text-emerald-400'
                }`}
              />
            </span>
            <span className="text-sm text-gray-300">{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        to={tier.ctaLink}
        className={`block text-center font-semibold text-sm py-3.5 px-6 rounded-xl transition-colors ${
          tier.highlighted
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
            : tier.name === 'Scale'
            ? 'bg-gray-700 hover:bg-gray-600 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-white'
        }`}
      >
        {tier.cta}
      </Link>
    </div>
  );
}

function FeatureComparisonTable() {
  const tableRef = useRef<HTMLDivElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const headerRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!tableRef.current || !headerRef.current) return;
      const tableRect = tableRef.current.getBoundingClientRect();
      const tableBottom = tableRect.bottom;
      const headerHeight = headerRef.current.offsetHeight;
      setIsSticky(tableRect.top < 0 && tableBottom > headerHeight);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const renderCellValue = (value: FeatureValue) => {
    if (typeof value === 'boolean') {
      return value ? (
        <CheckIcon className="w-5 h-5 text-emerald-400 mx-auto" />
      ) : (
        <XMarkIcon className="w-5 h-5 text-gray-600 mx-auto" />
      );
    }
    return <span className="text-sm text-gray-300 font-medium">{value}</span>;
  };

  return (
    <div ref={tableRef} className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead
          ref={headerRef}
          className={`${
            isSticky
              ? 'fixed top-0 left-0 right-0 z-30 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700'
              : ''
          }`}
          style={isSticky ? { width: tableRef.current?.offsetWidth } : {}}
        >
          <tr>
            <th className="text-left py-4 px-4 text-sm font-semibold text-gray-400 w-[240px]">
              Feature
            </th>
            {['Free', 'Pro', 'Growth', 'Scale'].map((plan) => (
              <th
                key={plan}
                className={`text-center py-4 px-4 text-sm font-semibold w-[140px] ${
                  plan === 'Pro' ? 'text-indigo-400' : 'text-gray-400'
                }`}
              >
                {plan}
              </th>
            ))}
          </tr>
        </thead>
        {/* Spacer when header is sticky */}
        {isSticky && <tbody><tr><td style={{ height: headerRef.current?.offsetHeight }} colSpan={5} /></tr></tbody>}
        <tbody>
          {comparisonData.map((category) => (
            <>
              <tr key={`cat-${category.name}`}>
                <td
                  colSpan={5}
                  className="pt-8 pb-3 px-4 text-xs font-bold uppercase tracking-widest text-gray-500"
                >
                  {category.name}
                </td>
              </tr>
              {category.features.map((feature, idx) => (
                <tr
                  key={`${category.name}-${feature.name}`}
                  className={`${
                    idx % 2 === 0 ? 'bg-gray-800/30' : ''
                  } border-b border-gray-800/50`}
                >
                  <td className="py-3.5 px-4 text-sm text-gray-300">
                    {feature.name}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {renderCellValue(feature.free)}
                  </td>
                  <td className="py-3.5 px-4 text-center bg-indigo-500/5">
                    {renderCellValue(feature.pro)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {renderCellValue(feature.growth)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {renderCellValue(feature.scale)}
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UsageEstimator() {
  const [developers, setDevelopers] = useState(1000);
  const [repos, setRepos] = useState(5);
  const [teamSize, setTeamSize] = useState(3);

  const recommended = useMemo(
    () => getRecommendedTier(developers, repos, teamSize),
    [developers, repos, teamSize]
  );

  const estimatedContacts = developers * 5;
  const estimatedSignals = repos * 1000;

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-8 sm:p-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div>
          <div className="space-y-8">
            {/* Developers slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-300">
                  How many developers use your tool?
                </label>
                <span className="text-sm font-bold text-white tabular-nums">
                  {developers.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={100000}
                step={100}
                value={developers}
                onChange={(e) => setDevelopers(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>100</span>
                <span>100K</span>
              </div>
            </div>

            {/* Repos slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-300">
                  How many repos / packages?
                </label>
                <span className="text-sm font-bold text-white tabular-nums">
                  {repos}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={repos}
                onChange={(e) => setRepos(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span>
                <span>50</span>
              </div>
            </div>

            {/* Team size slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-300">
                  Team size?
                </label>
                <span className="text-sm font-bold text-white tabular-nums">
                  {teamSize}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span>
                <span>50</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendation */}
        <div className="flex flex-col items-center justify-center text-center">
          <p className="text-sm text-gray-400 mb-2">Estimated usage</p>
          <div className="flex items-center gap-6 mb-6">
            <div>
              <p className="text-2xl font-bold text-white">
                {estimatedContacts.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">contacts</p>
            </div>
            <div className="w-px h-10 bg-gray-700" />
            <div>
              <p className="text-2xl font-bold text-white">
                {estimatedSignals.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">signals/mo</p>
            </div>
          </div>
          <p className="text-sm text-gray-400 mb-3">We recommend</p>
          <span className="text-3xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {recommended}
          </span>
          <Link
            to="/register"
            className="mt-6 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
          >
            Get started with {recommended}
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}

function FAQItemComponent({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left py-5 flex items-start justify-between gap-4 hover:text-white transition-colors group"
      >
        <span className="text-base font-semibold text-gray-200 group-hover:text-white transition-colors">
          {item.question}
        </span>
        <span className="flex-shrink-0 mt-0.5 transition-transform duration-200">
          {open ? (
            <MinusIcon className="w-5 h-5 text-indigo-400" />
          ) : (
            <PlusIcon className="w-5 h-5 text-gray-500 group-hover:text-gray-400" />
          )}
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          open ? 'max-h-40 opacity-100 pb-5' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-sm text-gray-400 leading-relaxed pr-8">
          {item.answer}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing Page
// ---------------------------------------------------------------------------

export default function Pricing() {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <nav className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <Link to="/landing" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight">
                DevSignal
              </span>
            </Link>
            <div className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
              <Link
                to="/landing"
                className="hover:text-white transition-colors"
              >
                Home
              </Link>
              <Link
                to="/use-cases"
                className="hover:text-white transition-colors"
              >
                Use Cases
              </Link>
              <Link to="/pricing" className="text-white font-medium">
                Pricing
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline-block"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Get Started
                <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-12 sm:pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              Developer Signal Intelligence{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Pricing
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Start free. Scale when you are ready. No surprises, no hidden
              fees, no per-seat gotchas.
            </p>
          </div>
        </div>
      </section>

      {/* Billing Toggle + Pricing Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <BillingToggle
          isAnnual={isAnnual}
          onToggle={() => setIsAnnual(!isAnnual)}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {tiers.map((tier) => (
            <PricingCard key={tier.name} tier={tier} isAnnual={isAnnual} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            All plans include REST + GraphQL API, WebSocket real-time updates,
            and the @devsignal/node SDK.
          </p>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Compare plans in detail
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Find the right fit for your devtool team.
            </p>
          </div>

          <FeatureComparisonTable />
        </div>
      </section>

      {/* Usage Estimator */}
      <section className="border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Not sure which plan?
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Tell us about your usage and we will recommend the best plan.
            </p>
          </div>

          <UsageEstimator />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="border-t border-gray-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Everything you need to know about DevSignal pricing.
            </p>
          </div>

          <div className="divide-y divide-gray-800 border-t border-gray-800">
            {faqs.map((faq) => (
              <FAQItemComponent key={faq.question} item={faq} />
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="border-t border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <p className="text-center text-sm text-gray-500 uppercase tracking-widest font-medium mb-6">
            Built for devtool companies like
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {[
              'Resend',
              'Railway',
              'Neon',
              'Supabase',
              'Upstash',
              'Trigger.dev',
            ].map((company) => (
              <span
                key={company}
                className="text-lg font-semibold text-gray-600 hover:text-gray-400 transition-colors"
              >
                {company}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl px-8 sm:px-16 py-16 sm:py-20 text-center">
            <div className="absolute inset-0 opacity-10">
              <svg
                className="w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="grid-pricing"
                    width="40"
                    height="40"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 40 0 L 0 0 0 40"
                      fill="none"
                      stroke="white"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill="url(#grid-pricing)"
                />
              </svg>
            </div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Still not sure? Schedule a 15-minute demo
              </h2>
              <p className="text-lg text-indigo-100 max-w-xl mx-auto mb-10">
                Or start free -- no credit card required. Set up in minutes,
                see your first scored account in under an hour.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-indigo-50 transition-colors"
                >
                  Start Free
                  <ArrowRightIcon />
                </Link>
                <a
                  href="mailto:sales@devsignal.dev?subject=Demo%20request"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  Schedule a Demo
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-400">
                DevSignal
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link to="/landing" className="hover:text-gray-300 transition-colors">Home</Link>
              <Link to="/use-cases" className="hover:text-gray-300 transition-colors">Use Cases</Link>
              <Link to="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
              <Link to="/developers" className="hover:text-gray-300 transition-colors">Developers</Link>
              <Link to="/changelog" className="hover:text-gray-300 transition-colors">Changelog</Link>
              <Link to="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
              <Link to="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
              <Link to="/login" className="hover:text-gray-300 transition-colors">Sign in</Link>
            </div>
            <p className="text-xs text-gray-600">
              &copy; {new Date().getFullYear()} DevSignal. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
