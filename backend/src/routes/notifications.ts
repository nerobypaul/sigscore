import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../services/notifications';
import { logger } from '../utils/logger';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET /notifications — list notifications (cursor-paginated)
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List notifications
 *     description: Returns a cursor-paginated list of notifications for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, only return unread notifications
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of notifications per page (max 100)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor ID for pagination (last notification ID from previous page)
 *     responses:
 *       200:
 *         description: Paginated notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *                 hasMore:
 *                   type: boolean
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const cursor = req.query.cursor as string | undefined;

    const result = await getNotifications(userId, { unreadOnly, limit, cursor });
    res.json(result);
  } catch (error) {
    logger.error('Failed to list notifications', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /notifications/unread-count — get unread notification count
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Get unread notification count
 *     description: Returns the number of unread notifications for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: integer
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await getUnreadCount(userId);
    res.json({ count });
  } catch (error) {
    logger.error('Failed to get unread count', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /notifications/:id/read — mark a single notification as read
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark notification as read
 *     description: Marks a single notification as read for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 *       404:
 *         description: Notification not found
 */
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    const notification = await markAsRead(userId, notificationId);
    res.json(notification);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const appErr = error as { statusCode: number; message: string };
      res.status(appErr.statusCode).json({ error: appErr.message });
      return;
    }
    logger.error('Failed to mark notification as read', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /notifications/read-all — mark all notifications as read
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     description: Marks all unread notifications as read for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: All notifications marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 updated:
 *                   type: integer
 *                   description: Number of notifications marked as read
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await markAllAsRead(userId);
    res.json(result);
  } catch (error) {
    logger.error('Failed to mark all notifications as read', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
