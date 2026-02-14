import { useState } from 'react';
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

function ChevronDownIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pricing Data
// ---------------------------------------------------------------------------

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaLink: string;
  highlighted: boolean;
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'For indie devtool builders exploring product-led growth.',
    features: [
      '1,000 contacts',
      '5,000 signals/month',
      '1 user',
      'npm + PyPI connectors',
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
    price: '$79',
    period: '/mo',
    description: 'For growing devtool teams turning signals into pipeline.',
    features: [
      '25,000 contacts',
      '100,000 signals/month',
      '10 users',
      'All connectors (npm, PyPI, GitHub, Segment)',
      'AI account briefs',
      'Workflow automation',
      'Slack integration',
      'Saved views',
      'Priority support',
    ],
    cta: 'Start Pro Trial',
    ctaLink: '/register',
    highlighted: true,
  },
  {
    name: 'Scale',
    price: '$299',
    period: '/mo',
    description: 'For devtool companies scaling growth across the organization.',
    features: [
      'Unlimited contacts',
      'Unlimited signals',
      'Unlimited users',
      'Everything in Pro',
      'SSO (SAML/OIDC)',
      'Audit log',
      'Custom integrations',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Talk to Us',
    ctaLink: '/register',
    highlighted: false,
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
    question: 'Can I self-host DevSignal?',
    answer:
      'Yes. DevSignal ships as a Docker image you can run on your own infrastructure. The self-hosted version includes the full API, webhook engine, and workflow automation. We provide Docker Compose files and Kubernetes Helm charts for easy deployment. The free tier works fully self-hosted; Pro and Scale features require a license key.',
  },
  {
    question: 'What signals do you track?',
    answer:
      'DevSignal tracks npm and PyPI download patterns (including IP-based company resolution), GitHub activity (stars, issues, PRs, forks), product API usage via our SDK, Segment events, and custom webhooks. Each signal is scored and attributed to a company account using our identity resolution engine. You can also send custom signals through the REST API or the @devsignal/node SDK.',
  },
  {
    question: 'How is this different from HubSpot?',
    answer:
      'HubSpot is built for marketing-led B2B sales. DevSignal is built for product-led growth at devtool companies. We natively understand developer signals -- npm downloads, GitHub engagement, API usage patterns -- that HubSpot simply cannot track. Our PQA (Product-Qualified Account) scoring replaces MQL scoring with signals that actually predict developer intent. Plus, DevSignal is API-first with a zero-dependency TypeScript SDK, so it fits naturally into engineering workflows.',
  },
  {
    question: 'Do I need a credit card for the Free plan?',
    answer:
      'No. The Free plan is completely free with no credit card required. You get 1,000 contacts, 5,000 signals per month, and full API access. When you are ready to upgrade, you can add a payment method from the billing settings page.',
  },
  {
    question: 'Can I switch plans anytime?',
    answer:
      'Yes. You can upgrade or downgrade at any time from your billing settings. Upgrades take effect immediately with prorated billing. Downgrades take effect at the end of your current billing cycle. Your data is never deleted when downgrading -- you just lose access to premium features until you re-upgrade.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. All data is encrypted at rest (AES-256) and in transit (TLS 1.3). We use row-level multi-tenancy so your data is logically isolated. The Scale plan adds SSO/SAML, audit logging, and SOC 2 compliance. For self-hosted deployments, your data never leaves your infrastructure. We also support data export at any time -- your data is always yours.',
  },
];

// ---------------------------------------------------------------------------
// FAQ Item Component
// ---------------------------------------------------------------------------

function FAQItemComponent({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left py-5 flex items-start justify-between gap-4 hover:text-white transition-colors"
      >
        <span className="text-base font-semibold text-gray-200">{item.question}</span>
        <span className={`flex-shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon className="w-5 h-5 text-gray-500" />
        </span>
      </button>
      {open && (
        <div className="pb-5 pr-8">
          <p className="text-sm text-gray-400 leading-relaxed">{item.answer}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing Page
// ---------------------------------------------------------------------------

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <nav className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <Link to="/landing" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight">DevSignal</span>
            </Link>
            <div className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
              <Link to="/landing" className="hover:text-white transition-colors">Home</Link>
              <Link to="/use-cases" className="hover:text-white transition-colors">Use Cases</Link>
              <Link to="/pricing" className="text-white font-medium">Pricing</Link>
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
              Simple,{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                transparent
              </span>{' '}
              pricing
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Start free. Scale when you are ready. No surprises, no hidden fees,
              no per-seat gotchas.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-8 flex flex-col ${
                tier.highlighted
                  ? 'bg-gray-800 ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/10'
                  : 'bg-gray-800/50 border border-gray-700/50'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                <p className="mt-1 text-sm text-gray-400">{tier.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-extrabold text-white">{tier.price}</span>
                <span className="text-base text-gray-400">{tier.period}</span>
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
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Feature Comparison Hint */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            All plans include REST + GraphQL API, WebSocket real-time updates, and the @devsignal/node SDK.
          </p>
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
              Everything you need to know about DevSignal.
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
            {['Resend', 'Railway', 'Neon', 'Supabase', 'Upstash', 'Trigger.dev'].map((company) => (
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
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid-pricing" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-pricing)" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Start turning developer signals into pipeline
              </h2>
              <p className="text-lg text-indigo-100 max-w-xl mx-auto mb-10">
                Join devtool growth teams using DevSignal. Set up in minutes,
                see your first scored account in under an hour.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-indigo-50 transition-colors"
                >
                  Get Started Free
                  <ArrowRightIcon />
                </Link>
                <Link
                  to="/use-cases"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  See Use Cases
                </Link>
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
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-400">DevSignal</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <Link to="/landing" className="hover:text-gray-300 transition-colors">Home</Link>
              <Link to="/use-cases" className="hover:text-gray-300 transition-colors">Use Cases</Link>
              <Link to="/pricing" className="hover:text-gray-300 transition-colors">Pricing</Link>
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
