import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

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

function ChevronDownIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Signal Flow Diagram Components (text-based)
// ---------------------------------------------------------------------------

function SignalFlowEvaluating() {
  return (
    <div className="mt-6 space-y-3">
      <div className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-4">Signal Flow</div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Signal Detected</div>
          <div className="text-sm text-orange-400 font-mono">npm install @acme/sdk</div>
          <div className="text-xs text-gray-500 mt-1">47 installs from 10.0.0.x/24</div>
        </div>
        <div className="hidden sm:block text-gray-600">
          <ArrowRightIcon className="w-5 h-5" />
        </div>
        <div className="sm:hidden text-gray-600 ml-6">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
          </svg>
        </div>
        <div className="flex-1 bg-gray-800 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Identity Resolution</div>
          <div className="text-sm text-blue-400 font-mono">IP range matched</div>
          <div className="text-xs text-gray-500 mt-1">10.0.0.x/24 = Acme Corp (Clearbit)</div>
        </div>
        <div className="hidden sm:block text-gray-600">
          <ArrowRightIcon className="w-5 h-5" />
        </div>
        <div className="sm:hidden text-gray-600 ml-6">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
          </svg>
        </div>
        <div className="flex-1 bg-gray-800 border border-indigo-500/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">Action</div>
          <div className="text-sm text-emerald-400 font-mono">Account Created</div>
          <div className="text-xs text-gray-500 mt-1">PQA Score: 72 -- Evaluating</div>
        </div>
      </div>
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 mt-4">
        <div className="text-xs text-gray-500 mb-2">Dashboard Alert</div>
        <div className="font-mono text-sm">
          <span className="text-emerald-400">Acme Corp</span>
          <span className="text-gray-400"> installed your SDK </span>
          <span className="text-orange-400">47 times</span>
          <span className="text-gray-400"> this week from </span>
          <span className="text-blue-400">3 different teams</span>
        </div>
      </div>
    </div>
  );
}

function SignalFlowGitHub() {
  return (
    <div className="mt-6 space-y-3">
      <div className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-4">Signal Flow</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: 'Day 1', event: 'CTO stars repo', color: 'text-yellow-400', icon: 'star' },
          { label: 'Day 3', event: 'Opens 3 issues', color: 'text-green-400', icon: 'issue' },
          { label: 'Day 5', event: 'Creates PR', color: 'text-purple-400', icon: 'pr' },
          { label: 'Day 5', event: 'Deal auto-created', color: 'text-indigo-400', icon: 'deal' },
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 min-w-[140px]">
              <div className="text-xs text-gray-500 mb-1">{step.label}</div>
              <div className={`text-sm font-mono ${step.color}`}>{step.event}</div>
            </div>
            {i < 3 && (
              <div className="hidden sm:block text-gray-600">
                <ArrowRightIcon className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
        <div className="text-xs text-gray-500 mb-2">AI Brief Generated</div>
        <div className="font-mono text-sm text-gray-300">
          <span className="text-indigo-400">Technical champion identified:</span>{' '}
          Sarah Chen (CTO, Acme Corp). Starred repo, filed integration issues, submitted PR with custom adapter.{' '}
          <span className="text-emerald-400">High-intent signal pattern.</span>{' '}
          Recommend direct outreach within 48 hours.
        </div>
      </div>
    </div>
  );
}

function SignalFlowExpansion() {
  return (
    <div className="mt-6 space-y-3">
      <div className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-4">Signal Flow</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">API Usage Trend</div>
          <div className="flex items-end gap-1 h-12">
            {[20, 25, 30, 35, 55, 70, 90].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm"
                style={{
                  height: `${h}%`,
                  backgroundColor: h > 60 ? '#10b981' : h > 40 ? '#f59e0b' : '#6366f1',
                }}
              />
            ))}
          </div>
          <div className="text-xs text-emerald-400 mt-2 font-mono">+300% this month</div>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Team Growth</div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Last month</span>
              <span className="text-gray-300 font-mono">3 users</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">This month</span>
              <span className="text-emerald-400 font-mono">12 users</span>
            </div>
          </div>
          <div className="text-xs text-emerald-400 mt-2 font-mono">+9 new members</div>
        </div>
        <div className="bg-gray-800 border border-indigo-500/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Workflow Triggered</div>
          <div className="text-sm text-indigo-400 font-mono">expansion_signal</div>
          <div className="text-xs text-gray-500 mt-1">Slack alert sent to #sales</div>
        </div>
      </div>
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
        <div className="text-xs text-gray-500 mb-2">Slack Alert</div>
        <div className="font-mono text-sm">
          <span className="text-yellow-400">#sales</span>{' '}
          <span className="text-gray-400">| DevSignal Bot:</span>{' '}
          <span className="text-emerald-400">Acme Corp</span>{' '}
          <span className="text-gray-300">ready for enterprise tier. API usage up 300%, 9 new team members onboarding this week. Current plan: Pro ($79/mo).</span>
        </div>
      </div>
    </div>
  );
}

function SignalFlowPQA() {
  return (
    <div className="mt-6 space-y-3">
      <div className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-4">Signal Flow</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-3">Signals Aggregated</div>
          <div className="space-y-2">
            {[
              { signal: 'npm installs', count: '47/week', weight: '+15' },
              { signal: 'GitHub stars', count: '3 team members', weight: '+12' },
              { signal: 'API calls', count: '12k/day', weight: '+20' },
              { signal: 'Docs visits', count: '89 pages', weight: '+8' },
              { signal: 'SDK version', count: 'latest (v2.1)', weight: '+5' },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{s.signal}</span>
                <span className="text-gray-300 font-mono">{s.count}</span>
                <span className="text-emerald-400 font-mono">{s.weight}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-gray-800 border border-indigo-500/50 rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-3">PQA Score Card</div>
          <div className="flex items-center gap-4 mb-3">
            <div className="text-4xl font-extrabold text-emerald-400">87</div>
            <div>
              <div className="text-sm font-semibold text-white">Acme Corp</div>
              <div className="text-xs text-gray-400">Series B / 120 employees</div>
            </div>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
            <div className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-2 rounded-full" style={{ width: '87%' }} />
          </div>
          <div className="flex gap-2">
            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Hot</span>
            <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">Expanding</span>
            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Multi-team</span>
          </div>
        </div>
      </div>
      <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4">
        <div className="text-xs text-gray-500 mb-2">AI Account Brief</div>
        <div className="font-mono text-sm text-gray-300">
          Acme Corp (PQA 87) shows strong expansion signals across 3 teams. Primary champion: Sarah Chen (CTO).
          Key pattern: progressed from evaluation to multi-team adoption in 2 weeks.{' '}
          <span className="text-emerald-400">Recommend enterprise pitch.</span>{' '}
          <span className="text-indigo-400">Estimated ACV: $15k-25k.</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Use Case Data
// ---------------------------------------------------------------------------

interface UseCase {
  id: string;
  title: string;
  subtitle: string;
  signal: string;
  result: string;
  accentColor: string;
  borderColor: string;
  iconBg: string;
  FlowComponent: React.FC;
}

const useCases: UseCase[] = [
  {
    id: 'evaluating',
    title: 'Know who\'s evaluating your tool',
    subtitle: 'Signal: npm download spikes from the same IP range',
    signal: 'npm downloads spike from same IP range --> Company identified',
    result: '"Acme Corp installed your SDK 47 times this week"',
    accentColor: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    iconBg: 'bg-orange-500/10',
    FlowComponent: SignalFlowEvaluating,
  },
  {
    id: 'github-stars',
    title: 'Convert GitHub stars to revenue',
    subtitle: 'Signal: CTO engagement pattern detected',
    signal: 'CTO stars repo --> Opens 3 issues --> Creates PR',
    result: 'Auto-create deal, AI brief: "Technical champion identified"',
    accentColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
    iconBg: 'bg-yellow-500/10',
    FlowComponent: SignalFlowGitHub,
  },
  {
    id: 'expansion',
    title: 'Catch expansion signals before churn',
    subtitle: 'Signal: API usage surge + new team members onboarding',
    signal: 'API usage up 300%, new team members onboarding',
    result: 'Workflow fires, Slack alert: "Acme ready for enterprise tier"',
    accentColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/10',
    FlowComponent: SignalFlowExpansion,
  },
  {
    id: 'pqa-scoring',
    title: 'Stop guessing, start knowing',
    subtitle: 'Signal: 50+ signals aggregated into PQA score',
    signal: '50+ signals aggregated into PQA score',
    result: 'Account 360 view with AI-generated brief',
    accentColor: 'text-indigo-400',
    borderColor: 'border-indigo-500/30',
    iconBg: 'bg-indigo-500/10',
    FlowComponent: SignalFlowPQA,
  },
];

// ---------------------------------------------------------------------------
// Use Case Card Component
// ---------------------------------------------------------------------------

function UseCaseCard({ useCase }: { useCase: UseCase }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-gray-800/50 border ${
        expanded ? useCase.borderColor : 'border-gray-700/50'
      } rounded-2xl overflow-hidden transition-all duration-200`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-6 sm:p-8 flex items-start justify-between gap-4 hover:bg-gray-800/80 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className={`text-xs uppercase tracking-widest ${useCase.accentColor} font-medium mb-2`}>
            {useCase.subtitle}
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
            {useCase.title}
          </h3>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Signal:</span>
              <span className="text-gray-300 font-mono text-xs">{useCase.signal}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm mt-1">
            <span className="text-gray-500">Result:</span>
            <span className={`${useCase.accentColor} font-mono text-xs`}>{useCase.result}</span>
          </div>
        </div>
        <div className={`flex-shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
          <ChevronDownIcon className="w-6 h-6 text-gray-500" />
        </div>
      </button>

      {expanded && (
        <div className="px-6 sm:px-8 pb-6 sm:pb-8 border-t border-gray-700/50">
          <useCase.FlowComponent />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Use Cases Page
// ---------------------------------------------------------------------------

export default function UseCases() {
  useEffect(() => { document.title = 'Use Cases — DevSignal'; }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <PublicNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-12 sm:pb-16">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300">Developer Signal Intelligence</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">
              See how DevSignal{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                turns signals into deals
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Real scenarios from devtool companies. Click each use case to see
              the full signal-to-action flow that DevSignal automates.
            </p>
          </div>
        </div>
      </section>

      {/* Use Case Cards */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
        <div className="space-y-4">
          {useCases.map((uc) => (
            <UseCaseCard key={uc.id} useCase={uc} />
          ))}
        </div>
      </section>

      {/* How It All Connects */}
      <section className="border-t border-gray-800 bg-gray-900/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              The DevSignal pipeline
            </h2>
            <p className="mt-4 text-lg text-gray-400">
              Every signal feeds into a single, scored view of your developer pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { step: '01', title: 'Ingest', desc: 'npm, PyPI, GitHub, API, Segment', color: 'text-orange-400', border: 'border-orange-500/20' },
              { step: '02', title: 'Resolve', desc: 'Map signals to companies and contacts', color: 'text-blue-400', border: 'border-blue-500/20' },
              { step: '03', title: 'Score', desc: 'PQA scoring + AI account briefs', color: 'text-purple-400', border: 'border-purple-500/20' },
              { step: '04', title: 'Act', desc: 'Deals, alerts, workflows, Slack', color: 'text-emerald-400', border: 'border-emerald-500/20' },
            ].map((s) => (
              <div key={s.step} className={`bg-gray-800/50 border ${s.border} rounded-xl p-5 text-center`}>
                <div className={`text-2xl font-extrabold ${s.color} mb-2`}>{s.step}</div>
                <div className="text-base font-bold text-white mb-1">{s.title}</div>
                <div className="text-xs text-gray-400">{s.desc}</div>
              </div>
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
                  <pattern id="grid-uc" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-uc)" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Ready to see your own signals?
              </h2>
              <p className="text-lg text-indigo-100 max-w-xl mx-auto mb-10">
                Start free. Connect your first signal source in under 2 minutes.
                No credit card required.
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
                  to="/pricing"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  View Pricing
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <PublicFooter />
    </div>
  );
}
