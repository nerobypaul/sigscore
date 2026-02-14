import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { getAuditLogs, getEntityHistory } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET /audit — List audit logs (paginated, cursor-based, filterable)
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /audit:
 *   get:
 *     tags: [Audit]
 *     summary: List audit logs
 *     description: Returns a cursor-paginated, filterable list of audit logs. Requires ADMIN role.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action (e.g., create, update, delete)
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type (e.g., contact, company, deal)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs created on or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs created on or before this date
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor ID for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *         description: Number of logs per page (max 200)
 *     responses:
 *       200:
 *         description: Paginated audit logs
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.organizationId!;

      const filters = {
        action: req.query.action as string | undefined,
        entityType: req.query.entityType as string | undefined,
        userId: req.query.userId as string | undefined,
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        cursor: req.query.cursor as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      };

      const result = await getAuditLogs(organizationId, filters);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list audit logs', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /audit/entity/:entityType/:entityId — Entity history
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /audit/entity/{entityType}/{entityId}:
 *   get:
 *     tags: [Audit]
 *     summary: Get entity audit history
 *     description: Returns the audit log history for a specific entity.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *         description: Entity type (e.g., contact, company, deal)
 *       - in: path
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entity ID
 *     responses:
 *       200:
 *         description: Entity audit history
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.get(
  '/entity/:entityType/:entityId',
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const { entityType, entityId } = req.params;

      const result = await getEntityHistory(organizationId, entityType, entityId);
      res.json(result);
    } catch (error) {
      logger.error('Failed to get entity audit history', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
