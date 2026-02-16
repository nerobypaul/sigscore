import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import { logger } from '../utils/logger';
import * as scoreSnapshotService from '../services/score-snapshots';
import { enqueueScoreSnapshot } from '../jobs/producers';

const router = Router();

// All score snapshot routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET /overview — Org-level score trend overview
// Must be defined BEFORE /:companyId to avoid route collision
// ---------------------------------------------------------------------------

router.get(
  '/overview',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const days = parseInt(req.query.days as string, 10) || 30;

      const overview = await scoreSnapshotService.getOrgScoreOverview(
        organizationId,
        days,
      );

      res.json({ data: overview, days });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /capture — Manually trigger a score snapshot capture for the org
// ---------------------------------------------------------------------------

router.post(
  '/capture',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      // Enqueue the snapshot via BullMQ for async processing
      const job = await enqueueScoreSnapshot(organizationId);

      logger.info('Score snapshot capture triggered via API', {
        organizationId,
        jobId: job.id,
      });

      res.status(202).json({
        message: 'Score snapshot capture enqueued',
        jobId: job.id,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:companyId — Get score history for a specific company
// ---------------------------------------------------------------------------

router.get(
  '/:companyId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { companyId } = req.params;
      const days = parseInt(req.query.days as string, 10) || 30;

      const history = await scoreSnapshotService.getScoreHistory(
        companyId,
        organizationId,
        days,
      );

      res.json({ data: history, companyId, days });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
