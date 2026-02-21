import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import {
  signalProcessingQueue,
  scoreComputationQueue,
  webhookDeliveryQueue,
  enrichmentQueue,
  signalSyncQueue,
  workflowExecutionQueue,
} from '../jobs/queue';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

/**
 * GET /api/v1/workers/status
 *
 * Returns queue sizes and job counts for each BullMQ queue.
 * ADMIN only.
 */
router.get(
  '/status',
  requireOrgRole('ADMIN'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const queues = [
        { name: 'signal-processing', queue: signalProcessingQueue },
        { name: 'score-computation', queue: scoreComputationQueue },
        { name: 'webhook-delivery', queue: webhookDeliveryQueue },
        { name: 'enrichment', queue: enrichmentQueue },
        { name: 'signal-sync', queue: signalSyncQueue },
        { name: 'workflow-execution', queue: workflowExecutionQueue },
      ];

      const statuses = await Promise.all(
        queues.map(async ({ name, queue }) => {
          const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
          ]);

          return {
            name,
            waiting,
            active,
            completed,
            failed,
            delayed,
            total: waiting + active + delayed,
          };
        }),
      );

      res.json({
        queues: statuses,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      logger.error('Worker status endpoint error', { error: err });
      res.status(500).json({ error: 'Failed to retrieve worker status' });
    }
  },
);

export default router;
