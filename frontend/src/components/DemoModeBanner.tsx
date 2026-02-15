import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/**
 * Persistent banner shown at the top of the app when the user is in demo mode.
 * Detects demo mode by checking if the organization name is "DevSignal Demo".
 */
export default function DemoModeBanner() {
  const { user } = useAuth();

  // Check if the current org is the demo org
  const isDemo = user?.organizations?.some(
    (uo) => uo.organization?.name === 'DevSignal Demo',
  );

  if (!isDemo) return null;

  return (
    <div className="bg-indigo-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <p className="text-sm font-medium">
          You're exploring demo data.
        </p>
        <Link
          to="/register"
          onClick={() => {
            // Clear demo tokens so the user can register fresh
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('organizationId');
          }}
          className="inline-flex items-center gap-1 text-sm font-semibold text-white hover:text-indigo-100 transition-colors whitespace-nowrap"
        >
          Create free account
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
