import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import { getUsageSummary, PLAN_LIMITS } from '../services/usage';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

/**
 * @openapi
 * /usage:
 *   get:
 *     tags: [Usage]
 *     summary: Get current usage and limits
 *     description: |
 *       Returns the organization's current resource usage alongside the plan limits
 *       and percentage utilization for each dimension.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Usage and limits for the authenticated organization
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 plan:
 *                   type: string
 *                   enum: [free, pro, growth, scale]
 *                 contacts:
 *                   $ref: '#/components/schemas/UsageDimension'
 *                 signals:
 *                   $ref: '#/components/schemas/UsageDimension'
 *                 users:
 *                   $ref: '#/components/schemas/UsageDimension'
 *                 usage:
 *                   type: object
 *                   description: Legacy format — prefer top-level dimension objects
 *                   properties:
 *                     contacts:
 *                       type: integer
 *                     signals:
 *                       type: integer
 *                     users:
 *                       type: integer
 *                 limits:
 *                   type: object
 *                   description: Legacy format — prefer top-level dimension objects
 *                   properties:
 *                     contacts:
 *                       type: integer
 *                       nullable: true
 *                     signalsPerMonth:
 *                       type: integer
 *                       nullable: true
 *                     users:
 *                       type: integer
 *                       nullable: true
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 *       500:
 *         description: Internal server error
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const summary = await getUsageSummary(organizationId);
    const limits = PLAN_LIMITS[summary.plan];

    res.json({
      // New structured format
      plan: summary.plan,
      contacts: summary.contacts,
      signals: summary.signals,
      users: summary.users,
      // Legacy format for backward compatibility with existing Billing page
      usage: {
        contacts: summary.contacts.current,
        signals: summary.signals.current,
        users: summary.users.current,
      },
      limits: {
        contacts: summary.contacts.limit,
        signalsPerMonth: isFinite(limits.signalsPerMonth) ? limits.signalsPerMonth : null,
        users: summary.users.limit,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;
