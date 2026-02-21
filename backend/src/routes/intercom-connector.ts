import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireOrganization,
  requireOrgRole,
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueIntercomSync } from '../jobs/producers';
import {
  configureIntercom,
  getIntercomStatus,
  disconnectIntercom,
  handleIntercomWebhook,
  verifyIntercomSignature,
} from '../services/intercom-connector';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { IntercomConnectorConfig } from '../services/intercom-connector';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  accessToken: z.string().optional(),
  webhookSecret: z.string().optional(),
  trackedEvents: z
    .array(
      z.enum([
        'intercom_conversation_open',
        'intercom_conversation_reply',
        'intercom_conversation_closed',
        'intercom_conversation_rated',
      ]),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Public webhook endpoint (no JWT -- verified via HMAC-SHA1)
// ---------------------------------------------------------------------------

router.post(
  '/webhook/:sourceId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourceId } = req.params;

      // Look up the source to get org ID and webhook secret
      const source = await prisma.signalSource.findFirst({
        where: { id: sourceId, type: 'INTERCOM', status: 'ACTIVE' },
        select: {
          id: true,
          organizationId: true,
          config: true,
        },
      });

      if (!source) {
        res.status(404).json({ error: 'Intercom source not found' });
        return;
      }

      const cfg = source.config as unknown as IntercomConnectorConfig;

      // Verify HMAC-SHA1 signature (Intercom sends X-Hub-Signature header)
      const signature = req.headers['x-hub-signature'] as string | undefined;
      if (cfg.webhookSecret) {
        if (!signature) {
          res.status(401).json({ error: 'Missing webhook signature' });
          return;
        }
        // Intercom sends signature as "sha1=<hex>"
        const sigHex = signature.startsWith('sha1=')
          ? signature.slice(5)
          : signature;
        const rawBody = JSON.stringify(req.body);
        const valid = verifyIntercomSignature(
          cfg.webhookSecret,
          rawBody,
          sigHex,
        );
        if (!valid) {
          res.status(401).json({ error: 'Invalid webhook signature' });
          return;
        }
      }

      const result = await handleIntercomWebhook(
        source.organizationId,
        sourceId,
        req.body,
      );

      res.json({ ok: true, signalId: result.signalId });
    } catch (err) {
      logger.error('Intercom webhook error', { error: err });
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
// POST /connect -- Configure Intercom
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { accessToken, webhookSecret, trackedEvents } = req.body as z.infer<
        typeof connectSchema
      >;

      await configureIntercom(organizationId, {
        accessToken,
        webhookSecret,
        trackedEvents,
      });

      // Fetch the newly created status (includes webhook URL)
      const status = await getIntercomStatus(organizationId);

      res.json({
        ok: true,
        message: 'Intercom connected successfully',
        webhookUrl: status.webhookUrl,
        webhookSecret: status.webhookSecret,
      });
    } catch (err) {
      logger.error('Intercom connect error', { error: err });
      res.status(500).json({ error: 'Failed to connect Intercom' });
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
      const status = await getIntercomStatus(organizationId);
      res.json(status);
    } catch (err) {
      logger.error('Intercom status error', { error: err });
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

      const job = await enqueueIntercomSync(organizationId);

      res.json({
        ok: true,
        message: 'Intercom sync queued',
        jobId: job.id,
      });
    } catch (err) {
      logger.error('Intercom sync error', { error: err });
      res.status(500).json({ error: 'Failed to queue sync' });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove Intercom config
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectIntercom(organizationId);

      res.json({ ok: true, message: 'Intercom disconnected' });
    } catch (err) {
      logger.error('Intercom disconnect error', { error: err });
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  },
);

export default router;
