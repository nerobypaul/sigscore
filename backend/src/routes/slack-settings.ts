import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { sendTestMessage } from '../services/slack-notifications';
import { logger } from '../utils/logger';

const router = Router();

// All Slack settings routes require JWT auth + org context + ADMIN role
router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// Validation schema
const updateSlackSettingsSchema = z.object({
  webhookUrl: z.string().url().startsWith('https://hooks.slack.com/', {
    message: 'Must be a valid Slack incoming webhook URL (https://hooks.slack.com/...)',
  }),
});

/**
 * GET /api/v1/settings/slack
 * Returns current Slack integration status
 */
router.get('/slack', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const settings = org?.settings as Record<string, unknown> | null;
    const webhookUrl = (settings?.slackWebhookUrl as string) || null;

    res.json({
      configured: !!webhookUrl,
      // Mask the webhook URL for security — only show the last 8 chars
      webhookUrl: webhookUrl
        ? `...${webhookUrl.slice(-8)}`
        : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/settings/slack
 * Save Slack webhook URL to organization settings
 */
router.put(
  '/slack',
  validate(updateSlackSettingsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { webhookUrl } = req.body;

      // Read existing settings so we don't overwrite other fields
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      });

      const existingSettings = (org?.settings as Record<string, unknown>) || {};

      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          settings: {
            ...existingSettings,
            slackWebhookUrl: webhookUrl,
          } as unknown as import('@prisma/client').Prisma.InputJsonValue,
        },
      });

      logger.info('Slack webhook URL updated', { organizationId });

      res.json({
        configured: true,
        webhookUrl: `...${webhookUrl.slice(-8)}`,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/settings/slack
 * Remove Slack webhook URL from organization settings
 */
router.delete('/slack', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const existingSettings = (org?.settings as Record<string, unknown>) || {};
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { slackWebhookUrl, ...rest } = existingSettings;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { settings: rest as unknown as import('@prisma/client').Prisma.InputJsonValue },
    });

    logger.info('Slack webhook URL removed', { organizationId });

    res.json({ configured: false, webhookUrl: null });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/settings/slack/test
 * Send a test message to the configured Slack webhook
 */
router.post('/slack/test', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const settings = org?.settings as Record<string, unknown> | null;
    const webhookUrl = (settings?.slackWebhookUrl as string) || null;

    if (!webhookUrl) {
      res.status(400).json({ error: 'Slack webhook URL is not configured. Save a webhook URL first.' });
      return;
    }

    const success = await sendTestMessage(webhookUrl);

    if (success) {
      res.json({ success: true, message: 'Test message sent to Slack successfully.' });
    } else {
      res.status(502).json({ success: false, error: 'Failed to send test message. Please verify your webhook URL.' });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
