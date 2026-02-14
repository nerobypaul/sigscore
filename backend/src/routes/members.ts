import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as memberService from '../services/members';

const router = Router();

router.use(authenticate, requireOrganization);

// ---- Validation schemas ----

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).optional().default('MEMBER'),
});

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

// ---- Routes ----

/**
 * GET /api/v1/members
 * List all members of the current organization.
 * Requires: MEMBER or above
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const members = await memberService.listMembers(req.organizationId!);
      res.json({ members });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/members/invite
 * Invite a user by email to the organization.
 * Requires: ADMIN or above
 */
router.post(
  '/invite',
  requireOrgRole('ADMIN'),
  validate(inviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const member = await memberService.inviteMember(
        req.organizationId!,
        req.body.email,
        req.body.role,
        req.user!.id,
      );
      res.status(201).json(member);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/members/:userId/role
 * Update a member's role.
 * Requires: ADMIN or above
 */
router.put(
  '/:userId/role',
  requireOrgRole('ADMIN'),
  validate(updateRoleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const member = await memberService.updateMemberRole(
        req.organizationId!,
        req.params.userId,
        req.body.role,
        req.user!.id,
      );
      res.json(member);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/members/:userId
 * Remove a member from the organization.
 * Requires: ADMIN or above
 */
router.delete(
  '/:userId',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await memberService.removeMember(
        req.organizationId!,
        req.params.userId,
        req.user!.id,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/v1/members/transfer-ownership
 * Transfer organization ownership to another member.
 * Requires: OWNER
 */
router.post(
  '/transfer-ownership',
  requireOrgRole('OWNER'),
  validate(z.object({ userId: z.string().min(1) })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await memberService.transferOwnership(
        req.organizationId!,
        req.body.userId,
        req.user!.id,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
