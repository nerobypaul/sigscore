import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// SVG Icon Components (inline, no external deps)
// ---------------------------------------------------------------------------

function SignalIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function ScoreIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
    </svg>
  );
}

function AIIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  );
}

function APIIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function SDKIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ArrowRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const features = [
  {
    icon: SignalIcon,
    title: 'Signal Engine',
    description:
      'Ingest signals from npm, PyPI, GitHub, Segment, and your product API. Identity resolution ties anonymous developers to real accounts.',
  },
  {
    icon: ScoreIcon,
    title: 'PQA Scoring',
    description:
      'Product-Qualified Account scoring surfaces your hottest accounts. See who\'s expanding, who\'s evaluating, and who needs a nudge.',
  },
  {
    icon: PipelineIcon,
    title: 'PLG Pipeline',
    description:
      'Track the developer journey from first install to team adoption to enterprise deal. Stages built for how devtools actually sell.',
  },
  {
    icon: AIIcon,
    title: 'AI Briefs',
    description:
      'AI-generated account intelligence before every conversation. Know their tech stack, growth trajectory, and the perfect opening message.',
  },
  {
    icon: APIIcon,
    title: 'API-first',
    description:
      'REST + GraphQL APIs, API key auth, JWT auth, outbound webhooks, and WebSocket real-time updates. Build anything on top.',
  },
  {
    icon: SDKIcon,
    title: 'SDK-native',
    description:
      '@devsignal/node TypeScript SDK with zero dependencies. Instrument your product in minutes, not days.',
  },
];

const steps = [
  {
    step: '01',
    title: 'Connect Signals',
    description:
      'Drop in the SDK or configure webhooks. DevSignal starts ingesting usage data from GitHub, npm, PyPI, Segment, your app, and more.',
  },
  {
    step: '02',
    title: 'Score Accounts',
    description:
      'Our PQA engine scores every account in real time. See who is heating up, who is expanding, and who needs attention.',
  },
  {
    step: '03',
    title: 'Grow Revenue',
    description:
      'Surface product-qualified accounts to your growth team with AI briefs, Slack alerts, and automated workflows. Convert developers into customers.',
  },
];

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

const pricing: PricingTier[] = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'For indie devtool builders exploring product-led growth.',
    features: [
      'Up to 1,000 contacts',
      '5,000 signals / month',
      '1 user',
      'REST + GraphQL API',
      'Community support',
    ],
    cta: 'Get Started Free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/mo',
    description: 'For growing devtool teams turning signals into pipeline.',
    features: [
      'Up to 25,000 contacts',
      '100,000 signals / month',
      '10 users',
      'Slack alerts',
      'AI account briefs',
      'Priority support',
    ],
    cta: 'Start Pro Trial',
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
      'SSO / SAML',
      'Dedicated support',
      'SLA guarantee',
    ],
    cta: 'Talk to Us',
    highlighted: false,
  },
];

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------

export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* ----------------------------------------------------------------- */}
      {/* Navigation */}
      {/* ----------------------------------------------------------------- */}
      <nav className="relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight">DevSignal</span>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
              <Link to="/use-cases" className="hover:text-white transition-colors">Use Cases</Link>
              <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
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

      {/* ----------------------------------------------------------------- */}
      {/* Hero Section */}
      {/* ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        {/* Gradient orb decorations */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-20 sm:pb-32">
          <div className="max-w-3xl mx-auto text-center">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300">Developer Signal Intelligence</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Developer Signal Intelligence{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                for Devtool Companies
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Track npm downloads, GitHub activity, and product signals -- then
              surface which developers are ready to buy. Purpose-built for
              devtool companies running PLG.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-indigo-600/25"
              >
                Get Started Free
                <ArrowRightIcon />
              </Link>
              <a
                href="#features"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors border border-gray-700"
              >
                View Docs
              </a>
            </div>

            {/* Code snippet teaser */}
            <div className="mt-14 max-w-lg mx-auto">
              <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/60 rounded-xl overflow-hidden text-left">
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-gray-700/60">
                  <span className="w-3 h-3 rounded-full bg-red-500/60" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <span className="w-3 h-3 rounded-full bg-green-500/60" />
                  <span className="ml-3 text-xs text-gray-500 font-mono">instrument.ts</span>
                </div>
                <pre className="px-4 py-4 text-sm font-mono leading-relaxed overflow-x-auto">
                  <code>
                    <span className="text-purple-400">import</span>{' '}
                    <span className="text-gray-300">{'{ DevSignal }'}</span>{' '}
                    <span className="text-purple-400">from</span>{' '}
                    <span className="text-emerald-400">'@devsignal/node'</span>
                    {'\n\n'}
                    <span className="text-purple-400">const</span>{' '}
                    <span className="text-blue-300">ds</span>{' '}
                    <span className="text-gray-500">=</span>{' '}
                    <span className="text-purple-400">new</span>{' '}
                    <span className="text-yellow-300">DevSignal</span>
                    <span className="text-gray-300">{'({ apiKey: '}</span>
                    <span className="text-emerald-400">process.env.DS_KEY</span>
                    <span className="text-gray-300">{' })'}</span>
                    {'\n\n'}
                    <span className="text-gray-500">{'// Track product usage signals'}</span>
                    {'\n'}
                    <span className="text-blue-300">ds</span>
                    <span className="text-gray-300">.</span>
                    <span className="text-yellow-300">signal</span>
                    <span className="text-gray-300">{'('}</span>
                    <span className="text-emerald-400">'repo.cloned'</span>
                    <span className="text-gray-300">{', { user, repo })'}</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Social Proof Bar */}
      {/* ----------------------------------------------------------------- */}
      <section className="border-y border-gray-800 bg-gray-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <p className="text-center text-sm text-gray-500 uppercase tracking-widest font-medium mb-2">
            Built for companies like Resend, Railway, Neon, Supabase, and Upstash
          </p>
          <p className="text-center text-xs text-gray-600 mb-6">
            Developer signal intelligence for devtool teams shipping PLG
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">GitHub-native signals</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Identity resolution</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Real-time WebSocket updates</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Zero-dependency SDK</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">Append-only event log</span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Features Grid */}
      {/* ----------------------------------------------------------------- */}
      <section id="features" className="bg-white text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Everything you need for developer signal intelligence
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              From signal ingestion to AI-powered account scoring, DevSignal
              gives your growth team the full picture -- without the bloat of
              legacy sales tools.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative bg-gray-50 rounded-2xl p-6 hover:bg-white hover:shadow-lg hover:shadow-gray-200/60 border border-transparent hover:border-gray-200 transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                  <feature.icon />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* How It Works */}
      {/* ----------------------------------------------------------------- */}
      <section id="how-it-works" className="bg-gray-50 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Three steps to product-led revenue
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Go from zero to scored pipeline in under an hour.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((item, index) => (
              <div key={item.step} className="relative">
                {/* Connector line (desktop) */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-full w-full h-px">
                    <div className="w-full border-t-2 border-dashed border-gray-300 relative top-0">
                      <div className="absolute right-0 -top-1.5">
                        <ChevronIcon />
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl p-8 border border-gray-200 h-full">
                  <div className="text-4xl font-extrabold text-indigo-100 mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">
                    {item.title}
                  </h3>
                  <p className="text-gray-500 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Pricing */}
      {/* ----------------------------------------------------------------- */}
      <section id="pricing" className="bg-white text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Start free. Scale when you are ready. No surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricing.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-8 flex flex-col ${
                  tier.highlighted
                    ? 'bg-gray-900 text-white ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/10'
                    : 'bg-gray-50 border border-gray-200'
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
                  <h3
                    className={`text-lg font-bold ${
                      tier.highlighted ? 'text-white' : 'text-gray-900'
                    }`}
                  >
                    {tier.name}
                  </h3>
                  <p
                    className={`mt-1 text-sm ${
                      tier.highlighted ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    {tier.description}
                  </p>
                </div>

                <div className="mb-6">
                  <span className="text-4xl font-extrabold">{tier.price}</span>
                  <span
                    className={`text-base ${
                      tier.highlighted ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    {tier.period}
                  </span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex-shrink-0">
                        {tier.highlighted ? (
                          <CheckIcon />
                        ) : (
                          <svg
                            className="w-5 h-5 text-indigo-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        )}
                      </span>
                      <span
                        className={`text-sm ${
                          tier.highlighted ? 'text-gray-300' : 'text-gray-600'
                        }`}
                      >
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className={`block text-center font-semibold text-sm py-3 px-6 rounded-xl transition-colors ${
                    tier.highlighted
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-gray-900 hover:bg-gray-800 text-white'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Competitive Positioning */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gray-50 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why DevSignal over the alternatives?
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Purpose-built developer GTM -- not a generic sales tool with a plugin bolted on.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl p-8 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-2">vs HubSpot / Salesforce</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Native developer signals -- npm downloads, GitHub engagement,
                API usage patterns -- that generic sales tools simply cannot
                track. PQA scoring replaces MQL with signals that predict
                developer intent.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-2">vs Common Room</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                12x cheaper and devtool-specific. DevSignal focuses on the
                signals that matter for PLG conversion -- package installs,
                API adoption curves, team expansion -- without the enterprise
                bloat and six-figure contracts.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-2">vs Reo.dev</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Self-serve in 10 minutes, $79/mo transparent pricing. No sales
                calls, no custom quotes. API-first architecture with a
                zero-dependency TypeScript SDK so your engineering team actually
                wants to use it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Bottom CTA */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl px-8 sm:px-16 py-16 sm:py-20 text-center">
            {/* Decorative grid */}
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Stop guessing. Start converting developers.
              </h2>
              <p className="text-lg text-indigo-100 max-w-xl mx-auto mb-10">
                Join devtool growth teams using DevSignal to turn product usage
                into pipeline. Set up in minutes -- no credit card required.
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
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Footer */}
      {/* ----------------------------------------------------------------- */}
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
              <a href="#features" className="hover:text-gray-300 transition-colors">Features</a>
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
