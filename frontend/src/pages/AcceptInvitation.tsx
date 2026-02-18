import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitationInfo {
  id: string;
  email: string;
  role: string;
  organization: {
    id: string;
    name: string;
    logo: string | null;
  };
  invitedBy: {
    name: string;
  };
  expiresAt: string;
  expired: boolean;
  accepted: boolean;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AcceptInvitation() {
  useEffect(() => { document.title = 'Accept Invitation — DevSignal'; }, []);
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, refreshUser, setOrganizationId } = useAuth();

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch invitation info (public endpoint, no auth needed)
  // ---------------------------------------------------------------------------

  const fetchInvitation = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await api.get(`/invitations/${token}/info`);
      setInvitation(data);
      if (data.accepted) {
        setAccepted(true);
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to load invitation details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  // ---------------------------------------------------------------------------
  // Redirect to login if not authenticated
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !loading && invitation && !invitation.expired && !invitation.accepted) {
      // Save the current URL so we can redirect back after login
      const currentPath = window.location.pathname;
      localStorage.setItem('redirectAfterLogin', currentPath);
      navigate('/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, loading, invitation, navigate]);

  // ---------------------------------------------------------------------------
  // Accept invitation
  // ---------------------------------------------------------------------------

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const { data } = await api.post(`/invitations/${token}/accept`);
      setAccepted(true);

      // Switch to the new organization
      if (data.organization?.id) {
        setOrganizationId(data.organization.id);
      }

      // Refresh user data to include new organization
      await refreshUser();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to accept invitation. Please try again.';
      setError(msg);
    } finally {
      setAccepting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 px-6 py-8 text-center">
            {invitation?.organization.logo ? (
              <img
                src={invitation.organization.logo}
                alt={invitation.organization.name}
                className="w-16 h-16 rounded-xl mx-auto mb-4 bg-white/20 object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>
            )}
            <h1 className="text-xl font-bold text-white">Team Invitation</h1>
            {invitation && (
              <p className="text-indigo-100 mt-1 text-sm">
                Join {invitation.organization.name} on DevSignal
              </p>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            {/* Error state */}
            {error && !invitation && (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Invitation Not Found</h3>
                <p className="text-sm text-gray-500 mb-6">{error}</p>
                <button
                  onClick={() => navigate('/')}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            )}

            {/* Expired state */}
            {invitation?.expired && !invitation.accepted && (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Invitation Expired</h3>
                <p className="text-sm text-gray-500 mb-6">
                  This invitation has expired. Please ask {invitation.invitedBy.name} to send a new one.
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            )}

            {/* Already accepted state */}
            {accepted && invitation && (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Welcome to {invitation.organization.name}!
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  You have joined as <span className="font-medium">{invitation.role}</span>. You now have access to the team workspace.
                </p>
                <button
                  onClick={() => navigate('/')}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Go to Dashboard
                </button>
              </div>
            )}

            {/* Accept state (invitation is valid, user is logged in) */}
            {invitation && !invitation.expired && !accepted && isAuthenticated && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  <span className="font-medium">{invitation.invitedBy.name}</span> has invited you to join{' '}
                  <span className="font-medium">{invitation.organization.name}</span> as a{' '}
                  <span className="font-medium">{invitation.role.toLowerCase()}</span>.
                </p>

                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-indigo-700 font-semibold text-sm">
                        {invitation.organization.name[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{invitation.organization.name}</p>
                      <p className="text-xs text-gray-500">
                        Invited to join as {invitation.role}
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="w-full px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {accepting ? 'Accepting...' : 'Accept Invitation'}
                  </button>
                  <button
                    onClick={() => navigate('/')}
                    className="w-full px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Not authenticated, waiting to redirect */}
            {invitation && !invitation.expired && !accepted && !isAuthenticated && (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Please log in to accept this invitation.
                </p>
                <Spinner size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-4">
          DevSignal -- Developer Signal Intelligence
        </p>
      </div>
    </div>
  );
}
