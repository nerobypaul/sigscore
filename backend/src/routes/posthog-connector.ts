import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueuePostHogSync } from '../jobs/producers';
import {
  configurePostHog,
  getPostHogStatus,
  disconnectPostHog,
  handlePostHogWebhook,
} from '../services/posthog-connector';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  host: z.string().optional(),
  projectId: z.string().min(1, 'Project ID is required'),
  personalApiKey: z.string().min(1, 'Personal API key is required'),
  trackedEvents: z.array(z.string().min(1)).optional(),
  webhookSecret: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Inbound webhook (no auth -- PostHog sends events here)
// Must be defined BEFORE auth middleware
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/connectors/posthog/webhook/:sourceId
 *
 * Inbound endpoint for PostHog webhook events.
 * No authentication -- verified via sourceId + optional HMAC signature.
 */
router.post('/webhook/:sourceId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceId } = req.params;
    const signature = req.headers['x-posthog-signature'] as string | undefined;
    const payload = req.body;

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    const result = await handlePostHogWebhook(sourceId, payload, signature);

    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('PostHog webhook error', { error: err });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /connect -- Save PostHog config
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const body = req.body as z.infer<typeof connectSchema>;

      const result = await configurePostHog(organizationId, {
        host: body.host,
        projectId: body.projectId,
        personalApiKey: body.personalApiKey,
        trackedEvents: body.trackedEvents,
        webhookSecret: body.webhookSecret,
      });

      res.json({
        ok: true,
        sourceId: result.sourceId,
        webhookUrl: result.webhookUrl,
        message: 'PostHog connected successfully',
      });
    } catch (err) {
      logger.error('PostHog connect error', { error: err });
      res.status(500).json({ error: 'Failed to connect PostHog' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /status -- Get PostHog config + sync stats
// ---------------------------------------------------------------------------

router.get(
  '/status',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = await getPostHogStatus(organizationId);
      res.json(status);
    } catch (err) {
      logger.error('PostHog status error', { error: err });
      res.status(500).json({ error: 'Failed to get status' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /sync -- Trigger API pull via BullMQ
// ---------------------------------------------------------------------------

router.post(
  '/sync',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const job = await enqueuePostHogSync(organizationId);

      res.json({ ok: true, message: 'PostHog sync queued', jobId: job.id });
    } catch (err) {
      logger.error('PostHog sync error', { error: err });
      res.status(500).json({ error: 'Failed to queue sync' });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove PostHog connection
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectPostHog(organizationId);

      res.json({ ok: true, message: 'PostHog disconnected' });
    } catch (err) {
      logger.error('PostHog disconnect error', { error: err });
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  },
);

export default router;
