import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getNotificationPreferences,
  upsertNotificationPreferences,
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

// ---------------------------------------------------------------------------
// GET /notifications/preferences — get notification preferences
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notifications/preferences:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notification preferences
 *     description: Returns the notification preferences for the authenticated user.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 emailDigest:
 *                   type: string
 *                   enum: [DAILY, WEEKLY, NEVER]
 *                 signalAlerts:
 *                   type: string
 *                   enum: [ALL, HOT_ONLY, NONE]
 *                 workflowNotifications:
 *                   type: boolean
 *                 teamMentions:
 *                   type: boolean
 *                 usageLimitWarnings:
 *                   type: boolean
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const preferences = await getNotificationPreferences(userId);
    res.json(preferences);
  } catch (error) {
    logger.error('Failed to get notification preferences', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PUT /notifications/preferences — update notification preferences
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notifications/preferences:
 *   put:
 *     tags: [Notifications]
 *     summary: Update notification preferences
 *     description: Updates notification preferences for the authenticated user. All fields are optional — only provided fields are updated.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailDigest:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, NEVER]
 *               signalAlerts:
 *                 type: string
 *                 enum: [ALL, HOT_ONLY, NONE]
 *               workflowNotifications:
 *                 type: boolean
 *               teamMentions:
 *                 type: boolean
 *               usageLimitWarnings:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated notification preferences
 *       400:
 *         description: Invalid preference value
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      emailDigest,
      signalAlerts,
      workflowNotifications,
      teamMentions,
      usageLimitWarnings,
    } = req.body;

    // Validate enum values if provided
    const validDigest = ['DAILY', 'WEEKLY', 'NEVER'];
    const validAlerts = ['ALL', 'HOT_ONLY', 'NONE'];

    if (emailDigest !== undefined && !validDigest.includes(emailDigest)) {
      res.status(400).json({
        error: `Invalid emailDigest value. Must be one of: ${validDigest.join(', ')}`,
      });
      return;
    }

    if (signalAlerts !== undefined && !validAlerts.includes(signalAlerts)) {
      res.status(400).json({
        error: `Invalid signalAlerts value. Must be one of: ${validAlerts.join(', ')}`,
      });
      return;
    }

    if (
      workflowNotifications !== undefined &&
      typeof workflowNotifications !== 'boolean'
    ) {
      res.status(400).json({ error: 'workflowNotifications must be a boolean' });
      return;
    }

    if (teamMentions !== undefined && typeof teamMentions !== 'boolean') {
      res.status(400).json({ error: 'teamMentions must be a boolean' });
      return;
    }

    if (usageLimitWarnings !== undefined && typeof usageLimitWarnings !== 'boolean') {
      res.status(400).json({ error: 'usageLimitWarnings must be a boolean' });
      return;
    }

    const preferences = await upsertNotificationPreferences(userId, {
      emailDigest,
      signalAlerts,
      workflowNotifications,
      teamMentions,
      usageLimitWarnings,
    });

    res.json(preferences);
  } catch (error) {
    logger.error('Failed to update notification preferences', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
