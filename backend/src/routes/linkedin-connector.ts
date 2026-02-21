import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireOrganization,
  requireOrgRole,
} from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueLinkedInSync } from '../jobs/producers';
import {
  configureLinkedIn,
  getLinkedInStatus,
  disconnectLinkedIn,
  handleLinkedInWebhook,
  importLinkedInEmployees,
  verifyWebhookSignature,
} from '../services/linkedin-connector';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { LinkedInConnectorConfig } from '../services/linkedin-connector';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  companyPageUrl: z
    .string()
    .min(1, 'Company page URL is required')
    .refine(
      (url) =>
        url.includes('linkedin.com/company/') ||
        url.includes('linkedin.com/showcase/'),
      'Must be a valid LinkedIn company or showcase page URL',
    ),
  trackEmployees: z.boolean().default(false),
});

const importSchema = z.object({
  employees: z
    .array(
      z.object({
        name: z.string().min(1, 'Name is required'),
        title: z.string().min(1, 'Title is required'),
        profileUrl: z.string().min(1, 'Profile URL is required'),
        email: z.string().email().optional(),
      }),
    )
    .min(1, 'At least one employee is required')
    .max(500, 'Maximum 500 employees per import'),
});

const webhookPayloadSchema = z.object({
  type: z.enum([
    'linkedin_page_view',
    'linkedin_post_engagement',
    'linkedin_employee_activity',
    'linkedin_company_follow',
  ]),
  actor: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    profileUrl: z.string().optional(),
    title: z.string().optional(),
    company: z.string().optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Public webhook endpoint (no JWT -- verified via HMAC)
// ---------------------------------------------------------------------------

router.post(
  '/webhook/:sourceId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sourceId } = req.params;

      // Look up the source to get org ID and webhook secret
      const source = await prisma.signalSource.findFirst({
        where: { id: sourceId, type: 'LINKEDIN', status: 'ACTIVE' },
        select: {
          id: true,
          organizationId: true,
          config: true,
        },
      });

      if (!source) {
        res.status(404).json({ error: 'LinkedIn source not found' });
        return;
      }

      const cfg = source.config as unknown as LinkedInConnectorConfig;

      // Verify HMAC signature if present
      const signature = req.headers['x-linkedin-signature'] as
        | string
        | undefined;
      if (signature && cfg.webhookSecret) {
        const rawBody = JSON.stringify(req.body);
        const valid = verifyWebhookSignature(
          cfg.webhookSecret,
          rawBody,
          signature,
        );
        if (!valid) {
          res.status(401).json({ error: 'Invalid webhook signature' });
          return;
        }
      }

      // Validate payload
      const parsed = webhookPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid webhook payload',
          details: parsed.error.flatten(),
        });
        return;
      }

      const result = await handleLinkedInWebhook(
        source.organizationId,
        sourceId,
        parsed.data,
      );

      res.json({ ok: true, signalId: result.signalId });
    } catch (err) {
      logger.error('LinkedIn webhook error', { error: err });
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
// POST /connect -- Configure LinkedIn company page
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { companyPageUrl, trackEmployees } = req.body as z.infer<
        typeof connectSchema
      >;

      await configureLinkedIn(organizationId, {
        companyPageUrl,
        trackEmployees,
      });

      // Fetch the newly created status (includes webhook URL)
      const status = await getLinkedInStatus(organizationId);

      res.json({
        ok: true,
        message: 'LinkedIn connected successfully',
        webhookUrl: status.webhookUrl,
        webhookSecret: status.webhookSecret,
      });
    } catch (err) {
      logger.error('LinkedIn connect error', { error: err });
      res.status(500).json({ error: 'Failed to connect LinkedIn' });
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
      const status = await getLinkedInStatus(organizationId);
      res.json(status);
    } catch (err) {
      logger.error('LinkedIn status error', { error: err });
      res.status(500).json({ error: 'Failed to get status' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /import -- Manual employee bulk import (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/import',
  requireOrgRole('ADMIN'),
  validate(importSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { employees } = req.body as z.infer<typeof importSchema>;

      const result = await importLinkedInEmployees(organizationId, employees);

      res.json({
        ok: true,
        message: `Imported ${result.employeesImported} new contacts, resolved ${result.contactsResolved} existing`,
        result,
      });
    } catch (err) {
      logger.error('LinkedIn import error', { error: err });
      res.status(500).json({ error: 'Failed to import employees' });
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

      const job = await enqueueLinkedInSync(organizationId);

      res.json({
        ok: true,
        message: 'LinkedIn sync queued',
        jobId: job.id,
      });
    } catch (err) {
      logger.error('LinkedIn sync error', { error: err });
      res.status(500).json({ error: 'Failed to queue sync' });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove LinkedIn config
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectLinkedIn(organizationId);

      res.json({ ok: true, message: 'LinkedIn disconnected' });
    } catch (err) {
      logger.error('LinkedIn disconnect error', { error: err });
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  },
);

export default router;
