import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * OAuth Callback Page
 *
 * After a successful GitHub or Google OAuth login, the backend redirects here
 * with accessToken and refreshToken in the query string. We store them in
 * localStorage (same keys the app already uses) and redirect to the dashboard.
 */
export default function OAuthCallback() {
  useEffect(() => { document.title = 'Signing In — Sigscore'; }, []);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const oauthError = searchParams.get('oauth_error');

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!accessToken || !refreshToken) {
      setError('Invalid OAuth callback parameters. Please try logging in again.');
      return;
    }

    // Store auth tokens (same keys used by frontend/src/lib/api.ts and auth.tsx)
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // Navigate to dashboard — AuthProvider will fetch /auth/me and hydrate user
    navigate('/', { replace: true });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Login Failed</h2>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-600">Completing login...</p>
      </div>
    </div>
  );
}
