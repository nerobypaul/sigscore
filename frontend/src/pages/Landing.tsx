import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

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

function WorkflowIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
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

function CheckIcon({ className = 'w-5 h-5 text-emerald-500' }: { className?: string }) {
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

function PlayIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
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
    metric: 'Track 13 signal sources in real-time',
    description:
      'Ingest signals from npm, PyPI, GitHub, Segment, and your product API. Identity resolution ties anonymous developers to real accounts.',
  },
  {
    icon: ScoreIcon,
    title: 'PQA Scoring',
    metric: 'Score accounts 0-100 with customizable rules',
    description:
      'Product-Qualified Account scoring surfaces your hottest accounts. See who\'s expanding, who\'s evaluating, and who needs a nudge.',
  },
  {
    icon: PipelineIcon,
    title: 'PLG Pipeline',
    metric: 'See deals from first signal to close',
    description:
      'Track the developer journey from first install to team adoption to enterprise deal. Stages built for how devtools actually sell.',
  },
  {
    icon: AIIcon,
    title: 'AI Briefs',
    metric: 'One-click account intelligence powered by Claude',
    description:
      'AI-generated account intelligence before every conversation. Know their tech stack, growth trajectory, and the perfect opening message.',
  },
  {
    icon: APIIcon,
    title: 'API-first',
    metric: 'Full REST API + GraphQL + SDK',
    description:
      'REST + GraphQL APIs, API key auth, JWT auth, outbound webhooks, and WebSocket real-time updates. Build anything on top.',
  },
  {
    icon: WorkflowIcon,
    title: 'Workflows',
    metric: '10 pre-built playbooks for devtool growth',
    description:
      'Automated workflows for Slack alerts, HubSpot sync, email sequences, and more. Trigger actions based on signals, scores, and stages.',
  },
];

const integrations = [
  'GitHub', 'npm', 'PyPI', 'Slack', 'HubSpot', 'Salesforce', 'Discord',
  'Stack Overflow', 'Twitter/X', 'Reddit', 'PostHog', 'Clearbit', 'Segment', 'Zapier',
];

const testimonials = [
  {
    quote: 'Imagine discovering 5 engineers at one company are evaluating your CLI tool — and closing a deal in 2 weeks.',
    role: 'What devtool growth teams tell us they need',
    initials: 'DS',
  },
  {
    quote: 'Common Room costs $1,000+/mo. DevSignal starts free and onboards in 90 seconds via GitHub.',
    role: 'Why teams switch to DevSignal',
    initials: 'DS',
  },
  {
    quote: "Go from 'who's using us?' to 'here are your top 10 accounts' in one day with PQA scoring.",
    role: 'The DevSignal difference',
    initials: 'DS',
  },
];

const faqItems = [
  {
    q: 'How long does setup take?',
    a: '2 minutes. Connect GitHub, see results. No SDK installation required for GitHub and npm signals.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No SDK required for GitHub/npm signals. We crawl public data and match it to companies automatically. Optional SDK for custom product events.',
  },
  {
    q: 'How is this different from Common Room?',
    a: '12x cheaper ($79/mo vs $1,000+/mo), fully self-serve, and purpose-built for devtool companies. No sales calls, no 6-week onboarding.',
  },
  {
    q: 'What CRMs do you integrate with?',
    a: 'HubSpot and Salesforce bidirectional sync. Contacts, companies, deals, and signals flow both ways automatically.',
  },
  {
    q: 'Is there a free tier?',
    a: 'Yes. 1,000 contacts and 5,000 signals/month, forever free. No credit card required to start.',
  },
  {
    q: 'How does PQA scoring work?',
    a: '6-factor model: user count, usage velocity, feature breadth, engagement recency, seniority, and firmographic fit. Each factor is weighted and combined into a 0-100 score.',
  },
  {
    q: 'Can I customize the scoring?',
    a: 'Yes. No-code scoring builder with custom rules, weights, and conditions. Define what "hot" means for your specific product.',
  },
  {
    q: 'What data do you collect?',
    a: 'Only public signals (GitHub stars, npm downloads, forum posts) and data you explicitly send via SDK or webhooks. We never scrape private repos or inboxes.',
  },
];

// Comparison table data
const comparisonRows: { label: string; ds: string; cr: string; reo: string }[] = [
  { label: 'Price', ds: 'From $0/mo', cr: '$1,000+/mo', reo: '$500+/mo' },
  { label: 'Signal Sources', ds: '13 built-in', cr: '8-10', reo: '5-6' },
  { label: 'CRM Sync', ds: 'HubSpot + Salesforce', cr: 'Salesforce only', reo: 'HubSpot only' },
  { label: 'Setup Time', ds: '2 minutes', cr: '2-4 weeks', reo: '1-2 weeks' },
  { label: 'Self-serve', ds: 'Yes', cr: 'No (sales-led)', reo: 'No (demo required)' },
  { label: 'PQA Scoring', ds: 'Customizable, no-code', cr: 'Basic', reo: 'Limited' },
];

// ---------------------------------------------------------------------------
// FAQ Accordion Item
// ---------------------------------------------------------------------------

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors pr-4">
          {question}
        </span>
        <span className={`flex-shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <ChevronDownIcon />
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-40 pb-5' : 'max-h-0'}`}
      >
        <p className="text-gray-500 leading-relaxed">{answer}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product Mockup Component (pure CSS/HTML)
// ---------------------------------------------------------------------------

function ProductMockup() {
  const accounts = [
    { name: 'Acme Tools', score: 87, tier: 'HOT', tierColor: 'bg-red-100 text-red-700', signals: 24, users: 5 },
    { name: 'NovaCLI', score: 72, tier: 'WARM', tierColor: 'bg-amber-100 text-amber-700', signals: 15, users: 3 },
    { name: 'CloudForge', score: 45, tier: 'COLD', tierColor: 'bg-blue-100 text-blue-700', signals: 8, users: 1 },
  ];

  const signalFeed = [
    { icon: 'star', text: '3 engineers at Acme starred your repo', time: '2m ago', color: 'text-amber-500' },
    { icon: 'up', text: 'CloudForge npm downloads up 200%', time: '14m ago', color: 'text-emerald-500' },
    { icon: 'issue', text: 'NovaCLI opened 2 GitHub issues', time: '1h ago', color: 'text-indigo-500' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-2xl shadow-gray-900/10 border border-gray-200 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="w-3 h-3 rounded-full bg-red-400" />
        <span className="w-3 h-3 rounded-full bg-yellow-400" />
        <span className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-gray-400 font-medium">DevSignal - Account Intelligence</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5">
        {/* Account cards — left 3 cols */}
        <div className="md:col-span-3 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Top Accounts</span>
            <span className="text-xs text-gray-400">Sorted by PQA Score</span>
          </div>
          {accounts.map((acc) => (
            <div
              key={acc.name}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                  {acc.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{acc.name}</div>
                  <div className="text-xs text-gray-400">{acc.users} user{acc.users !== 1 ? 's' : ''} &middot; {acc.signals} signals</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${acc.tierColor}`}>
                  {acc.tier}
                </span>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">{acc.score}</div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide">PQA</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Signal feed — right 2 cols */}
        <div className="md:col-span-2 border-t md:border-t-0 md:border-l border-gray-100 p-4">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live Signal Feed</span>
          <div className="mt-3 space-y-3">
            {signalFeed.map((sig, i) => (
              <div key={i} className="flex gap-2.5">
                <div className={`mt-0.5 flex-shrink-0 ${sig.color}`}>
                  {sig.icon === 'star' && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  )}
                  {sig.icon === 'up' && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                    </svg>
                  )}
                  {sig.icon === 'issue' && (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-700 leading-snug">{sig.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sig.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing Page
// ---------------------------------------------------------------------------

export default function Landing() {
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const handleStartDemo = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      const { data } = await api.post('/demo/seed');
      // Store auth tokens so the app recognizes the session
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('organizationId', data.organizationId);
      // Navigate to dashboard - full reload so AuthProvider picks up the new tokens
      window.location.href = '/';
    } catch (err) {
      console.error('Demo seed failed:', err);
      setDemoError('Failed to load demo. Please try again.');
      setDemoLoading(false);
    }
  };

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
              <Link to="/developers" className="hover:text-white transition-colors">Developers</Link>
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

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-20 sm:pb-28">
          <div className="max-w-3xl mx-auto text-center">
            {/* Pill badge */}
            <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300">Developer Signal Intelligence</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
              Turn Developer Signals{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Into Pipeline
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              DevSignal tracks npm downloads, GitHub stars, API usage, and 10+
              developer signals to show you which companies are evaluating your
              tool — before they ever fill out a form.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-emerald-600/25"
              >
                Start Free — No Credit Card
                <ArrowRightIcon />
              </Link>
              <button
                onClick={handleStartDemo}
                disabled={demoLoading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-transparent hover:bg-gray-800 text-gray-200 font-semibold px-8 py-3.5 rounded-xl text-base transition-colors border border-gray-600 hover:border-gray-500 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {demoLoading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading demo...
                  </>
                ) : (
                  <>
                    <PlayIcon />
                    Explore Live Demo
                  </>
                )}
              </button>
            </div>

            {demoError && (
              <p className="mt-4 text-sm text-red-400">{demoError}</p>
            )}

            {/* Hero stats */}
            <div className="mt-10 flex items-center justify-center gap-6 sm:gap-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">14+</div>
                  <div className="text-xs text-gray-500">Integrations</div>
                </div>
              </div>
              <div className="w-px h-8 bg-gray-700" />
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">5 min</div>
                  <div className="text-xs text-gray-500">Setup</div>
                </div>
              </div>
              <div className="w-px h-8 bg-gray-700" />
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <svg className="w-4.5 h-4.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">12x</div>
                  <div className="text-xs text-gray-500">Cheaper</div>
                </div>
              </div>
            </div>

            {/* Social proof pills */}
            <div className="mt-10">
              <p className="text-sm text-gray-500 mb-4">Built for developer-first companies like</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {['CLI Tools', 'API Platforms', 'Open Source', 'SDKs', 'Dev Infrastructure'].map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center px-4 py-1.5 rounded-full bg-gray-800/60 border border-gray-700/60 text-sm text-gray-400 font-medium"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Product Screenshot / Mockup Section */}
      {/* ----------------------------------------------------------------- */}
      <section id="demo" className="bg-gray-900 pb-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              See who's evaluating your tool
            </h2>
            <p className="mt-3 text-gray-400">
              Real-time account intelligence, ranked by product-qualified signals
            </p>
          </div>
          <ProductMockup />
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* How It Works — 3 Steps */}
      {/* ----------------------------------------------------------------- */}
      <section id="how-it-works" className="bg-gray-50 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Three steps to hidden pipeline
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Go from zero to scored accounts in under 2 minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Connect in 2 minutes',
                description:
                  'Paste your GitHub token. We crawl your repos and find companies already using your tool. No SDK, no code changes.',
              },
              {
                step: '02',
                title: 'See the intelligence',
                description:
                  'PQA scores rank every account. See which companies have 3+ engineers evaluating, which are churning, and who just upgraded.',
              },
              {
                step: '03',
                title: 'Act on signals',
                description:
                  'Automated workflows notify your team in Slack, sync to HubSpot/Salesforce, and trigger email sequences — all hands-free.',
              },
            ].map((item, index) => (
              <div key={item.step} className="relative">
                {/* Connector line (desktop) */}
                {index < 2 && (
                  <div className="hidden md:block absolute top-12 left-full w-full h-px">
                    <div className="w-full border-t-2 border-dashed border-gray-300" />
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
      {/* Integration Logos Section */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-white text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Connects to everything you already use
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              13 signal sources + Zapier for 5,000+ apps
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 max-w-4xl mx-auto">
            {integrations.map((name) => (
              <div
                key={name}
                className="flex items-center justify-center px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Features Grid */}
      {/* ----------------------------------------------------------------- */}
      <section id="features" className="bg-gray-50 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Everything you need for developer signal intelligence
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              From signal ingestion to AI-powered account scoring, DevSignal
              gives your growth team the full picture — without the bloat of
              legacy sales tools.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-lg hover:border-indigo-200 transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                  <feature.icon />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm font-medium text-indigo-600 mb-2">
                  {feature.metric}
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Pricing Anchor */}
      {/* ----------------------------------------------------------------- */}
      <section id="pricing-preview" className="bg-white text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Start free. Scale when you're ready. No surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              {
                name: 'Free',
                price: '$0',
                period: '/mo',
                highlight: false,
                features: ['1,000 contacts', '5,000 signals/mo', '1 user'],
              },
              {
                name: 'Pro',
                price: '$79',
                period: '/mo',
                highlight: true,
                features: ['25,000 contacts', '100,000 signals/mo', '10 users'],
              },
              {
                name: 'Growth',
                price: '$199',
                period: '/mo',
                highlight: false,
                features: ['100,000 contacts', '500,000 signals/mo', '25 users'],
              },
              {
                name: 'Scale',
                price: '$299',
                period: '/mo',
                highlight: false,
                features: ['Unlimited contacts', 'Unlimited signals', 'SSO + SLA'],
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-2xl p-6 border ${
                  tier.highlight
                    ? 'border-indigo-300 bg-indigo-50/50 shadow-lg shadow-indigo-100'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-3 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-sm font-semibold text-gray-500 mb-3">{tier.name}</div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-extrabold text-gray-900">{tier.price}</span>
                  <span className="text-sm text-gray-400">{tier.period}</span>
                </div>
                <ul className="space-y-2">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3 rounded-xl text-base transition-colors"
            >
              Start Free — No Credit Card
              <ArrowRightIcon />
            </Link>
            <div className="mt-4">
              <Link
                to="/pricing"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                See full comparison &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Social Proof / Testimonials */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gray-50 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Loved by devtool growth teams
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-xl p-6 border border-gray-200"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, s) => (
                    <svg key={s} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-5 italic">
                  "{t.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold">
                    {t.initials}
                  </div>
                  <span className="text-sm text-gray-500">{t.role}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Metrics bar */}
          <div className="mt-14 max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 text-center">
              <div>
                <div className="text-2xl font-extrabold text-gray-900">47</div>
                <div className="text-sm text-gray-500">companies discovered on avg during onboarding</div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-gray-200" />
              <div>
                <div className="text-2xl font-extrabold text-gray-900">2 min</div>
                <div className="text-sm text-gray-500">average setup time</div>
              </div>
              <div className="hidden sm:block w-px h-10 bg-gray-200" />
              <div>
                <div className="text-2xl font-extrabold text-gray-900">13</div>
                <div className="text-sm text-gray-500">signal sources</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Competitive Comparison Table */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-white text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why DevSignal over the alternatives?
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Purpose-built developer GTM — not a generic sales tool with a plugin bolted on.
            </p>
          </div>

          <div className="max-w-4xl mx-auto overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-4 pr-6 text-sm font-semibold text-gray-500 w-1/4" />
                  <th className="py-4 px-6 text-sm font-bold text-indigo-600">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                      </div>
                      DevSignal
                    </div>
                  </th>
                  <th className="py-4 px-6 text-sm font-semibold text-gray-500">Common Room</th>
                  <th className="py-4 px-6 text-sm font-semibold text-gray-500">Reo.dev</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-gray-100">
                    <td className="py-4 pr-6 text-sm font-medium text-gray-700">{row.label}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-gray-900">{row.ds}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">{row.cr}</td>
                    <td className="py-4 px-6 text-sm text-gray-500">{row.reo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Why DevSignal — Build vs Buy vs DevSignal */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gray-50 text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why DevSignal?
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              You have three choices. Only one gets you live in 5 minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Build In-House */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-3.19m0 0A5.985 5.985 0 014.5 9a6 6 0 1111.076 3.18M15.563 9.74a6 6 0 01-4.143 5.43M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Build In-House</h3>
              <p className="text-sm text-red-600 font-medium mb-4">Not recommended</p>
              <ul className="space-y-3">
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  6+ months of engineering time
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  $200K+ in eng salary costs
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Ongoing maintenance burden
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Distracts from core product
                </li>
              </ul>
            </div>

            {/* Generic CRM */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-7">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Generic CRM</h3>
              <p className="text-sm text-amber-600 font-medium mb-4">Wrong tool for the job</p>
              <ul className="space-y-3">
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Not built for developer signals
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  No npm/PyPI/GitHub tracking
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Manual data entry still required
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  $50-150/user/mo for bloated features
                </li>
              </ul>
            </div>

            {/* DevSignal */}
            <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/60 p-7 shadow-lg shadow-indigo-100">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">DevSignal</h3>
              <p className="text-sm text-indigo-600 font-medium mb-4">Purpose-built for devtools</p>
              <ul className="space-y-3">
                <li className="flex items-start gap-2.5 text-sm text-gray-700 font-medium">
                  <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  Launch in 5 minutes flat
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-700 font-medium">
                  <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  14 connectors out of the box
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-700 font-medium">
                  <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  AI-powered PQA scoring
                </li>
                <li className="flex items-start gap-2.5 text-sm text-gray-700 font-medium">
                  <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  From $0/mo — 12x cheaper
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Founder Credibility */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-white text-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Built by developers, for developer tool companies
            </h2>
            <p className="mt-5 text-base sm:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
              We've been in the PLG trenches. Every PLG CRM startup died — Calixa, Koala, Toplyne, Endgame, Pocus. DevSignal is different: we're signal intelligence, not another CRM.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <a
                href="https://github.com/nerobypaul/headless-crm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Star on GitHub
              </a>
              <Link
                to="/changelog"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Read our story
                <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* FAQ Section */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gray-50 text-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              Everything you need to know about DevSignal.
            </p>
          </div>

          <div className="divide-y divide-gray-200 border-t border-gray-200">
            {faqItems.map((item) => (
              <FAQItem key={item.q} question={item.q} answer={item.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* Bottom CTA */}
      {/* ----------------------------------------------------------------- */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
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
                Start finding your hidden pipeline
              </h2>
              <p className="text-lg text-indigo-100 max-w-xl mx-auto mb-3">
                Join 50+ devtool companies using DevSignal to discover which
                developers are ready to buy.
              </p>
              <p className="text-sm text-indigo-200 mb-10">
                Free tier forever. No credit card. Setup in 2 minutes.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-indigo-50 transition-colors"
                >
                  Get Started Free — No Credit Card
                  <ArrowRightIcon />
                </Link>
              </div>
              <p className="mt-6 text-sm text-indigo-200">
                Or{' '}
                <a href="mailto:paul@devsignal.dev" className="underline hover:text-white transition-colors">
                  schedule a 15-min demo
                </a>
              </p>
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
