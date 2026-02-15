import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueStackOverflowSync } from '../jobs/producers';
import {
  configureStackOverflow,
  getStackOverflowStatus,
  disconnectStackOverflow,
} from '../services/stackoverflow-connector';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  trackedTags: z
    .array(z.string().min(1))
    .min(1, 'At least one tag is required'),
  apiKey: z.string().optional().nullable(),
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /connect -- Save tracked tags and optional API key
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { trackedTags, apiKey } = req.body as z.infer<typeof connectSchema>;

      await configureStackOverflow(organizationId, {
        trackedTags,
        apiKey: apiKey ?? null,
      });

      res.json({
        ok: true,
        message: `Stack Overflow tracking configured for tags: ${trackedTags.join(', ')}`,
        trackedTags,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to configure Stack Overflow';
      logger.error('Stack Overflow connect error', { error: err });
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
      const status = await getStackOverflowStatus(organizationId);
      res.json(status);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get status';
      logger.error('Stack Overflow status error', { error: err });
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

      const job = await enqueueStackOverflowSync(organizationId);

      res.json({
        ok: true,
        message: 'Stack Overflow sync queued',
        jobId: job.id,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to queue sync';
      logger.error('Stack Overflow sync error', { error: err });
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

      await disconnectStackOverflow(organizationId);

      res.json({ ok: true, message: 'Stack Overflow disconnected' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to disconnect';
      logger.error('Stack Overflow disconnect error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

export default router;
