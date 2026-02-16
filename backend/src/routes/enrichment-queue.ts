import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  startBulkEnrichment,
  getBatchStatus,
  getBatchHistory,
  retryFailedInBatch,
  cancelBatch,
  getEnrichmentQueueStats,
} from '../services/enrichment-queue';
import { logger } from '../utils/logger';

const router = Router();

// All enrichment-queue routes require JWT auth + org context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const startEnrichmentSchema = z.object({
  contactIds: z.union([
    z.literal('all'),
    z.array(z.string().uuid()).min(1, 'At least one contact ID is required'),
  ]),
  sources: z
    .array(z.enum(['clearbit', 'github', 'npm', 'email']))
    .optional(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment-queue/start
// Start bulk enrichment for selected contacts
// ---------------------------------------------------------------------------

router.post(
  '/start',
  requireOrgRole('MEMBER'),
  validate(startEnrichmentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { contactIds, sources } = req.body;

      const batch = await startBulkEnrichment(organizationId, contactIds, {
        sources,
      });

      logger.info('Enrichment batch started via API', {
        organizationId,
        batchId: batch.batchId,
        contactCount: batch.total,
      });

      res.status(201).json(batch);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/enrichment-queue/batches
// List enrichment batches for the organization
// ---------------------------------------------------------------------------

router.get(
  '/batches',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const batches = getBatchHistory(organizationId);

      res.json({ batches });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/enrichment-queue/stats
// Get aggregated enrichment queue stats
// ---------------------------------------------------------------------------

router.get(
  '/stats',
  requireOrgRole('MEMBER'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = getEnrichmentQueueStats();
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/enrichment-queue/:batchId
// Get batch detail with per-contact status
// ---------------------------------------------------------------------------

router.get(
  '/:batchId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { batchId } = req.params;
      const organizationId = req.organizationId!;
      const batch = getBatchStatus(batchId);

      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      // Verify the batch belongs to this organization by checking batch history
      const orgBatches = getBatchHistory(organizationId);
      const belongs = orgBatches.some((b) => b.batchId === batchId);
      if (!belongs) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      res.json(batch);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment-queue/:batchId/retry
// Retry failed contacts in a batch
// ---------------------------------------------------------------------------

router.post(
  '/:batchId/retry',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { batchId } = req.params;
      const organizationId = req.organizationId!;

      // Verify ownership
      const orgBatches = getBatchHistory(organizationId);
      const belongs = orgBatches.some((b) => b.batchId === batchId);
      if (!belongs) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      const batch = await retryFailedInBatch(batchId);

      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      logger.info('Enrichment batch retry triggered via API', {
        organizationId,
        batchId,
      });

      res.json(batch);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment-queue/:batchId/cancel
// Cancel an active batch
// ---------------------------------------------------------------------------

router.post(
  '/:batchId/cancel',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { batchId } = req.params;
      const organizationId = req.organizationId!;

      // Verify ownership
      const orgBatches = getBatchHistory(organizationId);
      const belongs = orgBatches.some((b) => b.batchId === batchId);
      if (!belongs) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      const batch = cancelBatch(batchId);

      if (!batch) {
        res.status(404).json({ error: 'Batch not found' });
        return;
      }

      logger.info('Enrichment batch cancelled via API', {
        organizationId,
        batchId,
      });

      res.json(batch);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
