import { Router } from 'express';
import {
  ingestSignal,
  ingestSignalBatch,
  getSignals,
  getAccountSignals,
  getAccountTimeline,
  getAccountScore,
  computeAccountScore,
  getTopAccounts,
} from '../controllers/signals';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// Signal ingest schemas
const ingestSignalSchema = z.object({
  sourceId: z.string().min(1),
  type: z.string().min(1),
  actorId: z.string().optional(),
  accountId: z.string().optional(),
  anonymousId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

const ingestBatchSchema = z.object({
  signals: z.array(ingestSignalSchema).min(1).max(1000),
});

// Signal ingest
router.post('/', validate(ingestSignalSchema), ingestSignal);
router.post('/batch', validate(ingestBatchSchema), ingestSignalBatch);

// Signal query
router.get('/', getSignals);

// Account-scoped signal endpoints
router.get('/accounts/top', getTopAccounts);
router.get('/accounts/:accountId/signals', getAccountSignals);
router.get('/accounts/:accountId/timeline', getAccountTimeline);
router.get('/accounts/:accountId/score', getAccountScore);
router.post('/accounts/:accountId/score', computeAccountScore);

export default router;
