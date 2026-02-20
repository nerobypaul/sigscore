import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Conversion-focused banner shown at the top of the app when the user is in demo mode.
 * Highlights what the visitor is exploring and provides clear CTAs to register.
 * Dismissible per session (reappears on next visit).
 */
export default function DemoModeBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Check if the current org is the demo org
  const isDemo = user?.organizations?.some(
    (uo) => uo.organization?.name === 'DevSignal Demo',
  );

  if (!isDemo || dismissed) return null;

  const clearDemoTokens = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('organizationId');
  };

  return (
    <div className="bg-indigo-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
        {/* Left: what they're seeing */}
        <p className="text-sm font-medium">
          <span className="hidden sm:inline">Exploring demo: </span>
          <span className="sm:hidden">Demo: </span>
          <span className="text-indigo-200">
            8 accounts, 600 signals, AI briefs — all interactive
          </span>
        </p>

        {/* Right: CTAs + dismiss */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Primary CTA */}
          <Link
            to="/register?from=demo"
            onClick={clearDemoTokens}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-500 px-3 py-1 text-sm font-semibold text-white shadow-sm hover:bg-green-400 transition-colors whitespace-nowrap"
          >
            Start Free — 2 min setup
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>

          {/* Secondary CTA */}
          <Link
            to="/register?from=demo"
            onClick={clearDemoTokens}
            className="hidden sm:inline-flex items-center gap-1 text-sm text-indigo-200 hover:text-white transition-colors whitespace-nowrap"
          >
            See Pricing
          </Link>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-1 rounded p-0.5 text-indigo-300 hover:text-white hover:bg-indigo-500 transition-colors"
            aria-label="Dismiss banner"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
