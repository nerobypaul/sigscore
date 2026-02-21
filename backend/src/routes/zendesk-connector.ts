import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireOrganization,
  requireOrgRole,
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueZendeskSync } from '../jobs/producers';
import {
  configureZendesk,
  getZendeskStatus,
  disconnectZendesk,
  handleZendeskWebhook,
  verifyZendeskSignature,
} from '../services/zendesk-connector';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { ZendeskConnectorConfig } from '../services/zendesk-connector';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  subdomain: z.string().optional(),
  apiToken: z.string().optional(),
  email: z.string().email().optional(),
  webhookSecret: z.string().optional(),
  trackedEvents: z
    .array(
      z.enum([
        'zendesk_ticket_created',
        'zendesk_ticket_updated',
        'zendesk_ticket_solved',
        'zendesk_satisfaction_rated',
      ]),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Public webhook endpoint (no JWT -- verified via HMAC-SHA256)
// ---------------------------------------------------------------------------

router.post(
  '/webhook/:sourceId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourceId } = req.params;

      // Look up the source to get org ID and webhook secret
      const source = await prisma.signalSource.findFirst({
        where: { id: sourceId, type: 'ZENDESK', status: 'ACTIVE' },
        select: {
          id: true,
          organizationId: true,
          config: true,
        },
      });

      if (!source) {
        res.status(404).json({ error: 'Zendesk source not found' });
        return;
      }

      const cfg = source.config as unknown as ZendeskConnectorConfig;

      // Verify HMAC-SHA256 signature (Zendesk sends X-Zendesk-Webhook-Signature header)
      const signature = req.headers['x-zendesk-webhook-signature'] as string | undefined;
      if (cfg.webhookSecret) {
        if (!signature) {
          res.status(401).json({ error: 'Missing webhook signature' });
          return;
        }
        const rawBody = JSON.stringify(req.body);
        const valid = verifyZendeskSignature(
          cfg.webhookSecret,
          rawBody,
          signature,
        );
        if (!valid) {
          res.status(401).json({ error: 'Invalid webhook signature' });
          return;
        }
      }

      const result = await handleZendeskWebhook(
        source.organizationId,
        sourceId,
        req.body,
      );

      res.json({ ok: true, signalId: result.signalId });
    } catch (err) {
      logger.error('Zendesk webhook error', { error: err });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },
);

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /connect -- Configure Zendesk
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { subdomain, apiToken, email, webhookSecret, trackedEvents } = req.body as z.infer<
        typeof connectSchema
      >;

      await configureZendesk(organizationId, {
        subdomain,
        apiToken,
        email,
        webhookSecret,
        trackedEvents,
      });

      // Fetch the newly created status (includes webhook URL)
      const status = await getZendeskStatus(organizationId);

      res.json({
        ok: true,
        message: 'Zendesk connected successfully',
        webhookUrl: status.webhookUrl,
        webhookSecret: status.webhookSecret,
      });
    } catch (err) {
      logger.error('Zendesk connect error', { error: err });
      res.status(500).json({ error: 'Failed to connect Zendesk' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /status -- Config + stats + last sync
// ---------------------------------------------------------------------------

router.get(
  '/status',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = await getZendeskStatus(organizationId);
      res.json(status);
    } catch (err) {
      logger.error('Zendesk status error', { error: err });
      res.status(500).json({ error: 'Failed to get status' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /sync -- Trigger sync via BullMQ
// ---------------------------------------------------------------------------

router.post(
  '/sync',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const job = await enqueueZendeskSync(organizationId);

      res.json({
        ok: true,
        message: 'Zendesk sync queued',
        jobId: job.id,
      });
    } catch (err) {
      logger.error('Zendesk sync error', { error: err });
      res.status(500).json({ error: 'Failed to queue sync' });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove Zendesk config
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectZendesk(organizationId);

      res.json({ ok: true, message: 'Zendesk disconnected' });
    } catch (err) {
      logger.error('Zendesk disconnect error', { error: err });
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  },
);

export default router;
