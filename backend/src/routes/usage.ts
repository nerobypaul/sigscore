import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import { getUsage, getPlanForOrg, PLAN_LIMITS } from '../services/usage';
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
 *     description: Returns the organization's current resource usage alongside the plan limits.
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
 *                   enum: [free, pro, scale]
 *                 usage:
 *                   type: object
 *                   properties:
 *                     contacts:
 *                       type: integer
 *                     signals:
 *                       type: integer
 *                     users:
 *                       type: integer
 *                 limits:
 *                   type: object
 *                   properties:
 *                     contacts:
 *                       type: integer
 *                     signalsPerMonth:
 *                       type: integer
 *                     users:
 *                       type: integer
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

    const [plan, usage] = await Promise.all([
      getPlanForOrg(organizationId),
      getUsage(organizationId),
    ]);

    const limits = PLAN_LIMITS[plan];

    res.json({
      plan,
      usage,
      limits: {
        contacts: limits.contacts === Infinity ? null : limits.contacts,
        signalsPerMonth: limits.signalsPerMonth === Infinity ? null : limits.signalsPerMonth,
        users: limits.users === Infinity ? null : limits.users,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;
