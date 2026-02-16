import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { enforceUserLimit } from '../middleware/usage-limits';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logAudit } from '../services/audit';
import { sendTransactionalEmail } from '../services/email-sender';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const sendInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
});

// ---------------------------------------------------------------------------
// POST /api/v1/invitations — Send invite (requires OWNER/ADMIN)
// ---------------------------------------------------------------------------

router.post(
  '/',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  enforceUserLimit,
  validate(sendInviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, role } = req.body;
      const organizationId = req.organizationId!;
      const invitedById = req.user!.id;

      // Check if user is already a member of the org
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        const existingMembership = await prisma.userOrganization.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId,
            },
          },
        });
        if (existingMembership) {
          throw new AppError('This user is already a member of the organization.', 409);
        }
      }

      // Check for existing pending invitation to same email + org
      const existingInvite = await prisma.invitation.findFirst({
        where: {
          email,
          organizationId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (existingInvite) {
        throw new AppError('A pending invitation already exists for this email.', 409);
      }

      // Create invitation with 7-day expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await prisma.invitation.create({
        data: {
          email,
          role: role as 'ADMIN' | 'MEMBER' | 'VIEWER',
          organizationId,
          invitedById,
          expiresAt,
        },
        include: {
          organization: { select: { name: true } },
          invitedBy: { select: { firstName: true, lastName: true } },
        },
      });

      // Send invitation email
      const inviteUrl = `${config.frontend.url}/invitations/${invitation.token}/accept`;
      const inviterName = `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`.trim();

      try {
        await sendTransactionalEmail('invite', email, {
          name: email.split('@')[0],
          inviterName,
          orgName: invitation.organization.name,
          inviteUrl,
        });
      } catch (emailErr) {
        logger.error('Failed to send invitation email', { emailErr, email });
        // Continue even if email fails -- invitation is still valid
      }

      logger.info(`Invitation sent: ${email} as ${role} to org ${organizationId} by ${invitedById}`);

      // Audit log
      logAudit({
        organizationId,
        userId: invitedById,
        action: 'invite',
        entityType: 'invitation',
        entityId: invitation.id,
        entityName: email,
        metadata: { email, role },
      }).catch(() => {});

      res.status(201).json({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/invitations — List pending invitations for org
// ---------------------------------------------------------------------------

router.get(
  '/',
  authenticate,
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitations = await prisma.invitation.findMany({
        where: {
          organizationId: req.organizationId!,
          acceptedAt: null,
        },
        include: {
          invitedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const result = invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt,
        expired: inv.expiresAt < new Date(),
        createdAt: inv.createdAt,
        invitedBy: inv.invitedBy,
      }));

      res.json({ invitations: result });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/invitations/:id — Revoke invitation (requires OWNER/ADMIN)
// ---------------------------------------------------------------------------

router.delete(
  '/:id',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await prisma.invitation.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.organizationId!,
        },
      });

      if (!invitation) {
        throw new AppError('Invitation not found.', 404);
      }

      if (invitation.acceptedAt) {
        throw new AppError('Cannot revoke an already accepted invitation.', 400);
      }

      await prisma.invitation.delete({ where: { id: invitation.id } });

      logger.info(`Invitation revoked: ${invitation.email} from org ${req.organizationId}`);

      // Audit log
      logAudit({
        organizationId: req.organizationId!,
        userId: req.user!.id,
        action: 'revoke_invitation',
        entityType: 'invitation',
        entityId: invitation.id,
        entityName: invitation.email,
      }).catch(() => {});

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/invitations/:token/info — Get invitation info (public)
// ---------------------------------------------------------------------------

router.get(
  '/:token/info',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await prisma.invitation.findUnique({
        where: { token: req.params.token },
        include: {
          organization: { select: { id: true, name: true, logo: true } },
          invitedBy: { select: { firstName: true, lastName: true } },
        },
      });

      if (!invitation) {
        throw new AppError('Invitation not found.', 404);
      }

      const expired = invitation.expiresAt < new Date();
      const accepted = !!invitation.acceptedAt;

      res.json({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        organization: invitation.organization,
        invitedBy: {
          name: `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`.trim(),
        },
        expiresAt: invitation.expiresAt,
        expired,
        accepted,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/invitations/:token/accept — Accept invitation
// ---------------------------------------------------------------------------

router.post(
  '/:token/accept',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invitation = await prisma.invitation.findUnique({
        where: { token: req.params.token },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
      });

      if (!invitation) {
        throw new AppError('Invitation not found.', 404);
      }

      if (invitation.acceptedAt) {
        throw new AppError('This invitation has already been accepted.', 400);
      }

      if (invitation.expiresAt < new Date()) {
        throw new AppError('This invitation has expired.', 410);
      }

      // Verify the authenticated user's email matches the invitation
      if (req.user!.email !== invitation.email) {
        throw new AppError(
          'This invitation was sent to a different email address. Please log in with the correct account.',
          403,
        );
      }

      // Check if already a member
      const existingMembership = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user!.id,
            organizationId: invitation.organizationId,
          },
        },
      });

      if (existingMembership) {
        // Mark invitation as accepted even if already a member
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        res.json({
          message: 'You are already a member of this organization.',
          organization: invitation.organization,
          alreadyMember: true,
        });
        return;
      }

      // Create membership and mark invitation accepted in a transaction
      await prisma.$transaction([
        prisma.userOrganization.create({
          data: {
            userId: req.user!.id,
            organizationId: invitation.organizationId,
            role: invitation.role,
          },
        }),
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        }),
      ]);

      logger.info(
        `Invitation accepted: ${req.user!.email} joined org ${invitation.organizationId} as ${invitation.role}`,
      );

      // Audit log
      logAudit({
        organizationId: invitation.organizationId,
        userId: req.user!.id,
        action: 'accept_invitation',
        entityType: 'invitation',
        entityId: invitation.id,
        entityName: req.user!.email,
        metadata: { role: invitation.role },
      }).catch(() => {});

      res.json({
        message: 'Invitation accepted successfully.',
        organization: invitation.organization,
        role: invitation.role,
        alreadyMember: false,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
