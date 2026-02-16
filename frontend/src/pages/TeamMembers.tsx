import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

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
  role: Role;
  joinedAt: string;
  user: MemberUser;
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

const ROLES: Role[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
const ASSIGNABLE_ROLES: Role[] = ['ADMIN', 'MEMBER', 'VIEWER'];

const ROLE_BADGE_COLORS: Record<Role, string> = {
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
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
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

// ---------------------------------------------------------------------------
// Modal wrapper (matches Settings.tsx pattern)
// ---------------------------------------------------------------------------

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role Badge
// ---------------------------------------------------------------------------

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${ROLE_BADGE_COLORS[role]}`}
    >
      {role}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

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
// Confirm Modal
// ---------------------------------------------------------------------------

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmColor = 'red',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: 'red' | 'indigo';
  loading?: boolean;
}) {
  if (!open) return null;

  const btnColors =
    confirmColor === 'red'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-indigo-600 hover:bg-indigo-700 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4">
        <div className="px-6 py-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${btnColors}`}
          >
            {loading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TeamMembers() {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const currentUser = getCurrentUser();

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('MEMBER');
  const [inviting, setInviting] = useState(false);

  // Remove confirmation state
  const [removingMember, setRemovingMember] = useState<Member | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  // Transfer ownership state
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  // Role change loading
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // Current user's role in the org
  const currentMember = members.find((m) => m.userId === currentUser?.id);
  const isOwner = currentMember?.role === 'OWNER';
  const isAdmin = currentMember?.role === 'ADMIN';
  const canManage = isOwner || isAdmin;

  // ---- Fetch members ----

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await api.get('/members');
      setMembers(data.members);
    } catch {
      toast.error('Failed to load team members.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // ---- Invite ----

  async function handleInvite() {
    const email = inviteEmail.trim();
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
      await api.post('/members/invite', { email, role: inviteRole });
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('MEMBER');
      await fetchMembers();
      toast.success(`Invitation sent to ${email}.`);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setInviting(false);
    }
  }

  // ---- Change role ----

  async function handleRoleChange(member: Member, newRole: Role) {
    if (newRole === member.role) return;

    setChangingRoleId(member.userId);
    try {
      await api.put(`/members/${member.userId}/role`, { role: newRole });
      await fetchMembers();
      toast.success(`${getDisplayName(member.user)}'s role updated to ${newRole}.`);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setChangingRoleId(null);
    }
  }

  // ---- Remove member ----

  async function handleRemove() {
    if (!removingMember) return;

    setRemoveLoading(true);
    try {
      await api.delete(`/members/${removingMember.userId}`);
      setRemovingMember(null);
      await fetchMembers();
      toast.success(`${getDisplayName(removingMember.user)} has been removed.`);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setRemoveLoading(false);
    }
  }

  // ---- Transfer ownership ----

  async function handleTransfer() {
    if (!transferTarget) return;

    setTransferLoading(true);
    try {
      await api.post('/members/transfer-ownership', {
        userId: transferTarget.userId,
      });
      setTransferTarget(null);
      await fetchMembers();
      toast.success(`Ownership transferred to ${getDisplayName(transferTarget.user)}.`);
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setTransferLoading(false);
    }
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  // Sort: OWNER first, then ADMIN, then MEMBER, then VIEWER
  const roleOrder: Record<Role, number> = {
    OWNER: 0,
    ADMIN: 1,
    MEMBER: 2,
    VIEWER: 3,
  };
  const sortedMembers = [...members].sort(
    (a, b) => roleOrder[a.role] - roleOrder[b.role]
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Team</h1>
          <p className="text-sm text-gray-500">
            Manage your organization's members, roles, and permissions.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
              />
            </svg>
            Invite Member
          </button>
        )}
      </div>

      {/* Tab navigation */}
      <div className="mb-4 flex items-center gap-4 border-b border-gray-200 pb-3">
        <span className="text-sm font-medium text-indigo-600 border-b-2 border-indigo-600 pb-3 -mb-3">
          Members ({members.length})
        </span>
        <Link
          to="/team/settings"
          className="text-sm font-medium text-gray-500 hover:text-gray-700 pb-3 -mb-3 transition-colors"
        >
          Invitations
        </Link>
      </div>

      {/* Members table */}
      {sortedMembers.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
              />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-gray-900 mb-1">
            No team members yet
          </h4>
          <p className="text-sm text-gray-500 mb-4">
            Invite your team to start collaborating.
          </p>
          {canManage && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Invite your first member
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedMembers.map((member) => {
                  const isSelf = member.userId === currentUser?.id;
                  const isMemberOwner = member.role === 'OWNER';
                  const canChangeRole = canManage && !isMemberOwner && !isSelf;
                  const canRemove = canManage && !isMemberOwner && !isSelf;
                  const canTransfer = isOwner && !isSelf && !isMemberOwner;

                  return (
                    <tr
                      key={member.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Name + Avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar user={member.user} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {getDisplayName(member.user)}
                              {isSelf && (
                                <span className="ml-1.5 text-xs font-normal text-gray-400">
                                  (You)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-600 truncate block max-w-[200px]">
                          {member.user.email}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        {canChangeRole ? (
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleRoleChange(member, e.target.value as Role)
                            }
                            disabled={changingRoleId === member.userId}
                            className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 cursor-pointer"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <RoleBadge role={member.role} />
                        )}
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-500">
                          {relativeTime(member.joinedAt)}
                        </span>
                      </td>

                      {/* Last Active */}
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-gray-500">
                          {relativeTime(member.user.lastLoginAt)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canTransfer && (
                            <button
                              onClick={() => setTransferTarget(member)}
                              className="px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                              title="Transfer ownership"
                            >
                              Transfer
                            </button>
                          )}
                          {canRemove && (
                            <button
                              onClick={() => setRemovingMember(member)}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                          {isSelf && !isMemberOwner && (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                          {isMemberOwner && (
                            <span className="text-xs text-gray-400">--</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Role legend */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Role Permissions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ROLES.map((role) => (
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

      {/* ---- Invite Modal ---- */}
      <Modal
        open={showInviteModal}
        onClose={() => {
          setShowInviteModal(false);
          setInviteEmail('');
          setInviteRole('MEMBER');
        }}
        title="Invite Team Member"
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1.5">
              {inviteRole === 'ADMIN' && 'Admins can manage members and all organization settings.'}
              {inviteRole === 'MEMBER' && 'Members can view and edit contacts, deals, and signals.'}
              {inviteRole === 'VIEWER' && 'Viewers have read-only access to all data.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => {
                setShowInviteModal(false);
                setInviteEmail('');
                setInviteRole('MEMBER');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ---- Remove Confirmation ---- */}
      <ConfirmModal
        open={!!removingMember}
        onClose={() => setRemovingMember(null)}
        onConfirm={handleRemove}
        title="Remove Team Member"
        message={`Are you sure you want to remove ${removingMember ? getDisplayName(removingMember.user) : ''}? They will lose access to this organization immediately.`}
        confirmLabel="Remove Member"
        confirmColor="red"
        loading={removeLoading}
      />

      {/* ---- Transfer Ownership Confirmation ---- */}
      <ConfirmModal
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        onConfirm={handleTransfer}
        title="Transfer Ownership"
        message={`Are you sure you want to transfer ownership to ${transferTarget ? getDisplayName(transferTarget.user) : ''}? You will be demoted to Admin and this action cannot be easily undone.`}
        confirmLabel="Transfer Ownership"
        confirmColor="indigo"
        loading={transferLoading}
      />
    </div>
  );
}
