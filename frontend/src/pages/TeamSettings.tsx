import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrgRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

interface MemberUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  lastLoginAt: string | null;
}

interface Member {
  id: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
  user: MemberUser;
}

interface InvitedByUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  expired: boolean;
  createdAt: string;
  invitedBy: InvitedByUser;
}

interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASSIGNABLE_ROLES: OrgRole[] = ['ADMIN', 'MEMBER', 'VIEWER'];

const ROLE_BADGE_COLORS: Record<OrgRole, string> = {
  OWNER: 'bg-purple-50 text-purple-700 border-purple-200',
  ADMIN: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MEMBER: 'bg-blue-50 text-blue-700 border-blue-200',
  VIEWER: 'bg-gray-100 text-gray-700 border-gray-200',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'Just now';
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function getInitials(user: MemberUser): string {
  const first = user.firstName?.[0] ?? '';
  const last = user.lastName?.[0] ?? '';
  if (first || last) return `${first}${last}`.toUpperCase();
  return user.email[0].toUpperCase();
}

function getDisplayName(user: MemberUser): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  }
  return user.email.split('@')[0];
}

function extractApiError(err: unknown): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data
      ?.error || 'An unexpected error occurred.'
  );
}

function getCurrentUser(): CurrentUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as CurrentUser;
  } catch {
    return null;
  }
}

function timeUntilExpiry(expiresAt: string): string {
  const now = Date.now();
  const exp = new Date(expiresAt).getTime();
  const diffMs = exp - now;
  if (diffMs <= 0) return 'Expired';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes}m left`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: OrgRole }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${ROLE_BADGE_COLORS[role]}`}
    >
      {role}
    </span>
  );
}

function Avatar({ user, size = 'md' }: { user: MemberUser; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={getDisplayName(user)}
        className={`${sizeClasses} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold`}
    >
      {getInitials(user)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TeamSettings() {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUser = getCurrentUser();

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('MEMBER');
  const [inviting, setInviting] = useState(false);

  // Revoke loading state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Current user's role
  const currentMember = members.find((m) => m.userId === currentUser?.id);
  const isOwner = currentMember?.role === 'OWNER';
  const isAdmin = currentMember?.role === 'ADMIN';
  const canManage = isOwner || isAdmin;

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await api.get('/members');
      setMembers(data.members);
    } catch {
      toast.error('Failed to load team members.');
    }
  }, [toast]);

  const fetchInvitations = useCallback(async () => {
    try {
      const { data } = await api.get('/invitations');
      setInvitations(data.invitations);
    } catch {
      // Silently fail for invitations if user lacks permission
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchMembers(), fetchInvitations()]);
    setLoading(false);
  }, [fetchMembers, fetchInvitations]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error('Please enter an email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setInviting(true);
    try {
      await api.post('/invitations', { email, role: inviteRole });
      setInviteEmail('');
      setInviteRole('MEMBER');
      await fetchInvitations();
      toast.success(`Invitation sent to ${email}.`);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(invitation: PendingInvitation) {
    setRevokingId(invitation.id);
    try {
      await api.delete(`/invitations/${invitation.id}`);
      await fetchInvitations();
      toast.success(`Invitation to ${invitation.email} revoked.`);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setRevokingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  // Sort members: OWNER first, then ADMIN, MEMBER, VIEWER
  const roleOrder: Record<OrgRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2, VIEWER: 3 };
  const sortedMembers = [...members].sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

  const pendingInvites = invitations.filter((inv) => !inv.expired);
  const expiredInvites = invitations.filter((inv) => inv.expired);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Team Settings</h1>
        <p className="text-sm text-gray-500">
          Manage your team members, send invitations, and control access to your organization.
        </p>
      </div>

      {/* Member count summary */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Team Size</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {members.length}
              <span className="text-sm font-normal text-gray-500 ml-1">
                {members.length === 1 ? 'member' : 'members'}
              </span>
            </p>
          </div>
          {pendingInvites.length > 0 && (
            <div className="text-right">
              <p className="text-sm text-gray-500">Pending invites</p>
              <p className="text-lg font-semibold text-amber-600">{pendingInvites.length}</p>
            </div>
          )}
        </div>
      </div>

      {/* Invite form */}
      {canManage && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Invite a Team Member</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleInvite();
                }}
              />
            </div>
            <div className="w-full sm:w-36">
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex items-center gap-2"
            >
              {inviting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Send Invite
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            An email invitation will be sent. The invite link expires in 7 days.
          </p>
        </div>
      )}

      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">
              Pending Invitations ({pendingInvites.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-sm font-semibold flex-shrink-0">
                    {inv.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-500">
                      Invited by {inv.invitedBy.firstName} {inv.invitedBy.lastName} -- {timeUntilExpiry(inv.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <RoleBadge role={inv.role} />
                  {canManage && (
                    <button
                      onClick={() => handleRevoke(inv)}
                      disabled={revokingId === inv.id}
                      className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                      {revokingId === inv.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired invitations (collapsed) */}
      {expiredInvites.length > 0 && (
        <details className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
            Expired Invitations ({expiredInvites.length})
          </summary>
          <div className="divide-y divide-gray-50 border-t border-gray-100">
            {expiredInvites.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between opacity-60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs font-semibold flex-shrink-0">
                    {inv.email[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600 truncate">{inv.email}</p>
                    <p className="text-xs text-gray-400">Expired</p>
                  </div>
                </div>
                <RoleBadge role={inv.role} />
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Current members table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            Team Members ({members.length})
          </h3>
        </div>
        {sortedMembers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <h4 className="text-sm font-semibold text-gray-900 mb-1">No team members yet</h4>
            <p className="text-sm text-gray-500">Invite your team to start collaborating.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Email
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Role
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Joined
                  </th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Last Active
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedMembers.map((member) => {
                  const isSelf = member.userId === currentUser?.id;
                  return (
                    <tr key={member.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar user={member.user} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {getDisplayName(member.user)}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-gray-400">(You)</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-600 truncate block max-w-[200px]">
                          {member.user.email}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <RoleBadge role={member.role} />
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-500">{relativeTime(member.joinedAt)}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-500">{relativeTime(member.user.lastLoginAt)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role permissions reference */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Role Permissions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as OrgRole[]).map((role) => (
            <div key={role} className="space-y-1">
              <RoleBadge role={role} />
              <p className="text-xs text-gray-500 mt-1">
                {role === 'OWNER' && 'Full access. Can transfer ownership and manage billing.'}
                {role === 'ADMIN' && 'Can manage members, settings, and all data.'}
                {role === 'MEMBER' && 'Can view and edit contacts, deals, and signals.'}
                {role === 'VIEWER' && 'Read-only access to all data.'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
