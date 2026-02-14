import { OrgRole } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// List members
// ---------------------------------------------------------------------------

export async function listMembers(organizationId: string) {
  const memberships = await prisma.userOrganization.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          lastLoginAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    joinedAt: m.createdAt,
    user: m.user,
  }));
}

// ---------------------------------------------------------------------------
// Invite a member by email
// ---------------------------------------------------------------------------

export async function inviteMember(
  organizationId: string,
  email: string,
  role: OrgRole = 'MEMBER',
  invitedBy: string,
) {
  // Cannot invite as OWNER — only one owner allowed
  if (role === 'OWNER') {
    throw new AppError('Cannot invite as OWNER. Transfer ownership instead.', 400);
  }

  // Find the user by email
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AppError('No user found with that email. They must register first.', 404);
  }

  // Check if already a member
  const existing = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId,
      },
    },
  });

  if (existing) {
    throw new AppError('User is already a member of this organization', 409);
  }

  const membership = await prisma.userOrganization.create({
    data: {
      userId: user.id,
      organizationId,
      role,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          lastLoginAt: true,
        },
      },
    },
  });

  logger.info(`Member invited: ${user.email} as ${role} to org ${organizationId} by ${invitedBy}`);

  return {
    id: membership.id,
    userId: membership.userId,
    role: membership.role,
    joinedAt: membership.createdAt,
    user: membership.user,
  };
}

// ---------------------------------------------------------------------------
// Update a member's role
// ---------------------------------------------------------------------------

export async function updateMemberRole(
  organizationId: string,
  memberUserId: string,
  newRole: OrgRole,
  requesterId: string,
) {
  if (newRole === 'OWNER') {
    throw new AppError('Cannot assign OWNER role directly. Use transfer ownership.', 400);
  }

  const membership = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: memberUserId,
        organizationId,
      },
    },
  });

  if (!membership) {
    throw new AppError('Member not found', 404);
  }

  // Prevent changing the owner's role
  if (membership.role === 'OWNER') {
    throw new AppError('Cannot change the owner\'s role', 403);
  }

  // Prevent self-demotion for safety
  if (memberUserId === requesterId) {
    throw new AppError('Cannot change your own role', 400);
  }

  const updated = await prisma.userOrganization.update({
    where: { id: membership.id },
    data: { role: newRole },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
    },
  });

  logger.info(
    `Member role updated: ${memberUserId} from ${membership.role} to ${newRole} in org ${organizationId}`,
  );

  return {
    id: updated.id,
    userId: updated.userId,
    role: updated.role,
    joinedAt: updated.createdAt,
    user: updated.user,
  };
}

// ---------------------------------------------------------------------------
// Remove a member
// ---------------------------------------------------------------------------

export async function removeMember(
  organizationId: string,
  memberUserId: string,
  requesterId: string,
) {
  const membership = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: memberUserId,
        organizationId,
      },
    },
  });

  if (!membership) {
    throw new AppError('Member not found', 404);
  }

  // Cannot remove the owner
  if (membership.role === 'OWNER') {
    throw new AppError('Cannot remove the organization owner', 403);
  }

  // Cannot remove yourself (use leave instead)
  if (memberUserId === requesterId) {
    throw new AppError('Cannot remove yourself. Use leave organization instead.', 400);
  }

  await prisma.userOrganization.delete({
    where: { id: membership.id },
  });

  logger.info(`Member removed: ${memberUserId} from org ${organizationId} by ${requesterId}`);

  return { removed: true };
}

// ---------------------------------------------------------------------------
// Transfer ownership
// ---------------------------------------------------------------------------

export async function transferOwnership(
  organizationId: string,
  newOwnerUserId: string,
  currentOwnerId: string,
) {
  if (newOwnerUserId === currentOwnerId) {
    throw new AppError('You are already the owner', 400);
  }

  const newOwnerMembership = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: newOwnerUserId,
        organizationId,
      },
    },
  });

  if (!newOwnerMembership) {
    throw new AppError('Target user is not a member of this organization', 404);
  }

  // Atomic transaction: demote current owner to ADMIN, promote new owner to OWNER
  await prisma.$transaction([
    prisma.userOrganization.update({
      where: {
        userId_organizationId: {
          userId: currentOwnerId,
          organizationId,
        },
      },
      data: { role: 'ADMIN' },
    }),
    prisma.userOrganization.update({
      where: { id: newOwnerMembership.id },
      data: { role: 'OWNER' },
    }),
  ]);

  logger.info(
    `Ownership transferred: ${currentOwnerId} → ${newOwnerUserId} in org ${organizationId}`,
  );

  return { transferred: true, newOwnerId: newOwnerUserId };
}
