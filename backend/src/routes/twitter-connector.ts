import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueTwitterSync } from '../jobs/producers';
import {
  configureTwitter,
  getTwitterConfig,
  disconnectTwitter,
} from '../services/twitter-connector';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  bearerToken: z.string().min(1, 'Bearer token is required'),
  keywords: z
    .array(z.string().min(1))
    .min(1, 'At least one keyword is required')
    .max(25, 'Maximum 25 keywords allowed'),
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /connect -- Save bearer token and keywords
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { bearerToken, keywords } = req.body as z.infer<typeof connectSchema>;

      await configureTwitter(organizationId, { bearerToken, keywords });

      res.json({
        ok: true,
        message: 'Twitter/X connected successfully',
        keywords,
      });
    } catch (err) {
      logger.error('Twitter connect error', { error: err });
      res.status(500).json({ error: 'Failed to connect Twitter/X' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /status -- Config + stats + last sync
// ---------------------------------------------------------------------------

router.get(
  '/status',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = await getTwitterConfig(organizationId);
      res.json(status);
    } catch (err) {
      logger.error('Twitter status error', { error: err });
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

      const job = await enqueueTwitterSync(organizationId);

      res.json({ ok: true, message: 'Twitter sync queued', jobId: job.id });
    } catch (err) {
      logger.error('Twitter sync error', { error: err });
      res.status(500).json({ error: 'Failed to queue sync' });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove Twitter config
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectTwitter(organizationId);

      res.json({ ok: true, message: 'Twitter/X disconnected' });
    } catch (err) {
      logger.error('Twitter disconnect error', { error: err });
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  },
);

export default router;
