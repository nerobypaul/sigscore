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
            8 accounts, 395 signals, AI briefs — all interactive
          </span>
        </p>

        {/* Right: CTAs + dismiss */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Primary CTA */}
          <Link
            to="/register"
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
            to="/register"
            onClick={clearDemoTokens}
            className="hidden sm:inline-flex items-center gap-1 text-sm text-indigo-200 hover:text-white transition-colors whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Connect GitHub
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
