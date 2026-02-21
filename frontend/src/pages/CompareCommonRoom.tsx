import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import PublicFooter from '../components/PublicFooter';

// ---------------------------------------------------------------------------
// SVG Icon Components (inline, no external deps)
// ---------------------------------------------------------------------------

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

function XMarkIcon({ className = 'w-5 h-5 text-gray-600' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ArrowLeftIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function GitHubIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Comparison Data
// ---------------------------------------------------------------------------

interface ComparisonRow {
  feature: string;
  devSignal: string;
  competitor: string;
  devSignalWins: boolean;
}

const comparisonRows: ComparisonRow[] = [
  { feature: 'Starting Price', devSignal: '$0/mo (free tier)', competitor: '$1,000+/mo', devSignalWins: true },
  { feature: 'Self-hostable', devSignal: 'Yes (MIT license)', competitor: 'No', devSignalWins: true },
  { feature: 'Setup time', devSignal: '2 minutes', competitor: '6+ weeks', devSignalWins: true },
  { feature: 'Signal sources', devSignal: '16 built-in', competitor: '10+ (varies by plan)', devSignalWins: true },
  { feature: 'AI account briefs', devSignal: 'BYOK (your API key)', competitor: 'Included (opaque pricing)', devSignalWins: true },
  { feature: 'Identity resolution', devSignal: 'Built-in', competitor: 'Built-in', devSignalWins: false },
  { feature: 'PQA scoring', devSignal: 'Customizable 0-100', competitor: 'Their own scoring', devSignalWins: true },
  { feature: 'CRM sync', devSignal: 'HubSpot + Salesforce', competitor: 'HubSpot + Salesforce + more', devSignalWins: false },
  { feature: 'Open source', devSignal: 'Yes (MIT)', competitor: 'No', devSignalWins: true },
  { feature: 'API / SDK', devSignal: 'Full REST + GraphQL + Node SDK', competitor: 'REST API', devSignalWins: true },
  { feature: 'Target market', devSignal: 'Series A-C devtools', competitor: 'Enterprise', devSignalWins: false },
];

const whyChoose = [
  {
    title: '12x cheaper than Common Room',
    description:
      'Common Room starts at $1,000+/mo and requires a sales call. DevSignal starts at $0/mo with self-serve onboarding. Even our Scale plan at $299/mo is a fraction of the cost.',
  },
  {
    title: 'Self-serve in 2 minutes, not 6 weeks',
    description:
      'Connect your GitHub, see scored accounts immediately. No implementation team, no onboarding calls, no waiting. Your growth team is up and running before lunch.',
  },
  {
    title: 'Open source and self-hostable',
    description:
      'MIT licensed. Run on your own infrastructure if you prefer. Full access to the codebase, no vendor lock-in, no data leaving your network.',
  },
  {
    title: 'Built for Series A-C devtools, not enterprises',
    description:
      'Common Room sells to large enterprises with dedicated teams. DevSignal is purpose-built for growing devtool companies who need signal intelligence without the enterprise overhead.',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompareCommonRoom() {
  useEffect(() => {
    document.title = 'DevSignal vs Common Room — Developer Signal Intelligence';
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <PublicNav />

      {/* Back link */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeftIcon />
          Back to home
        </Link>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-16 sm:pb-20">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-gray-300">Competitor Comparison</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
              DevSignal vs{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Common Room
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Common Room is great for large enterprises. DevSignal is built for
              Series A-C devtool companies who need signal intelligence without the
              enterprise price tag.
            </p>

            <div className="mt-10 flex items-center justify-center gap-6 sm:gap-10">
              <div className="text-center">
                <div className="text-3xl font-extrabold text-white">$0</div>
                <div className="text-sm text-gray-500 mt-1">DevSignal starts at</div>
              </div>
              <div className="text-2xl font-bold text-gray-600">vs</div>
              <div className="text-center">
                <div className="text-3xl font-extrabold text-gray-500">$1,000+</div>
                <div className="text-sm text-gray-500 mt-1">Common Room starts at</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="bg-gray-50 text-gray-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Feature-by-feature comparison
            </h2>
            <p className="mt-4 text-lg text-gray-500">
              See exactly where DevSignal and Common Room differ.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-4 pr-6 text-sm font-semibold text-gray-500 w-1/4">Feature</th>
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
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.feature} className="border-b border-gray-100">
                    <td className="py-4 pr-6 text-sm font-medium text-gray-700">{row.feature}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        {row.devSignalWins ? (
                          <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <span className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span className={`text-sm ${row.devSignalWins ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                          {row.devSignal}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        {!row.devSignalWins && row.competitor !== 'No' ? (
                          <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                        ) : row.competitor === 'No' ? (
                          <XMarkIcon className="w-4 h-4 text-red-400 flex-shrink-0" />
                        ) : (
                          <span className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-500">{row.competitor}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Why Choose DevSignal */}
      <section className="bg-white text-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Why choose DevSignal over Common Room?
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {whyChoose.map((item) => (
              <div
                key={item.title}
                className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-indigo-200 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckIcon className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
                </div>
                <p className="text-sm text-gray-500 leading-relaxed pl-11">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Numbers Section */}
      <section className="bg-gray-50 text-gray-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              The numbers speak for themselves
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center">
              <div className="text-4xl font-extrabold text-indigo-600 mb-2">12x</div>
              <div className="text-sm text-gray-500">cheaper than Common Room</div>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center">
              <div className="text-4xl font-extrabold text-indigo-600 mb-2">2 min</div>
              <div className="text-sm text-gray-500">setup vs 6+ weeks</div>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-gray-200 text-center">
              <div className="text-4xl font-extrabold text-indigo-600 mb-2">16</div>
              <div className="text-sm text-gray-500">signal sources built-in</div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl px-8 sm:px-16 py-16 sm:py-20 text-center">
            <div className="absolute inset-0 opacity-10">
              <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid-compare-cr" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-compare-cr)" />
              </svg>
            </div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
                Ready to switch from Common Room?
              </h2>
              <p className="text-lg text-indigo-100 max-w-xl mx-auto mb-3">
                Start free. See scored accounts in 2 minutes. No sales call required.
              </p>
              <p className="text-sm text-indigo-200 mb-10">
                Free tier forever. No credit card. MIT licensed.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-indigo-50 transition-colors"
                >
                  Try DevSignal Free
                  <ArrowRightIcon />
                </Link>
                <a
                  href="https://github.com/nerobypaul/headless-crm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition-colors"
                >
                  <GitHubIcon />
                  View on GitHub
                </a>
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
