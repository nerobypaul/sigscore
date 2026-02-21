import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import { getRecentAnomalies } from '../services/signal-anomaly';
import { anomalyDetectionQueue } from '../jobs/queue';
import { logger } from '../utils/logger';

const router = Router();

// All anomaly routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET / — List recent anomalies for the organization (last 7 days by default)
// ---------------------------------------------------------------------------

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const days = parseInt(req.query.days as string, 10) || 7;
      const clampedDays = Math.min(Math.max(days, 1), 30);

      const anomalies = await getRecentAnomalies(organizationId, {
        days: clampedDays,
      });

      res.json({
        data: anomalies,
        meta: { days: clampedDays, count: anomalies.length },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /scan — Manually trigger an anomaly detection scan for the org
// ---------------------------------------------------------------------------

router.post(
  '/scan',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const job = await anomalyDetectionQueue.add(
        'detect-anomalies',
        { organizationId },
        { jobId: `anomaly-detect-manual-${organizationId}-${Date.now()}` },
      );

      logger.info('Anomaly detection scan triggered via API', {
        organizationId,
        jobId: job.id,
      });

      res.status(202).json({
        message: 'Anomaly detection scan enqueued',
        jobId: job.id,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:accountId — Get anomalies for a specific account
// ---------------------------------------------------------------------------

router.get(
  '/:accountId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { accountId } = req.params;
      const days = parseInt(req.query.days as string, 10) || 7;
      const clampedDays = Math.min(Math.max(days, 1), 30);

      const anomalies = await getRecentAnomalies(organizationId, {
        accountId,
        days: clampedDays,
      });

      res.json({
        data: anomalies,
        meta: { accountId, days: clampedDays, count: anomalies.length },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
