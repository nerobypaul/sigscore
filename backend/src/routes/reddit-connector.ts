import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueRedditSync } from '../jobs/producers';
import {
  configureReddit,
  getRedditStatus,
  disconnectReddit,
} from '../services/reddit-connector';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  keywords: z
    .array(z.string().min(1))
    .min(1, 'At least one keyword is required'),
  subreddits: z.array(z.string().min(1)).default([]),
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /connect -- Save keywords and subreddits
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { keywords, subreddits } = req.body as z.infer<typeof connectSchema>;

      await configureReddit(organizationId, { keywords, subreddits });

      res.json({
        ok: true,
        message: `Reddit tracking configured for keywords: ${keywords.join(', ')}`,
        keywords,
        subreddits,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to configure Reddit';
      logger.error('Reddit connect error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /status -- Get config + last sync + stats
// ---------------------------------------------------------------------------

router.get(
  '/status',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = await getRedditStatus(organizationId);
      res.json(status);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get status';
      logger.error('Reddit status error', { error: err });
      res.status(500).json({ error: message });
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

      const job = await enqueueRedditSync(organizationId);

      res.json({
        ok: true,
        message: 'Reddit sync queued',
        jobId: job.id,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to queue sync';
      logger.error('Reddit sync error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove config
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectReddit(organizationId);

      res.json({ ok: true, message: 'Reddit disconnected' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to disconnect';
      logger.error('Reddit disconnect error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

export default router;
