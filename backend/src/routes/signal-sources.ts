import { Router } from 'express';
import {
  getSignalSources,
  getSignalSource,
  createSignalSource,
  updateSignalSource,
  deleteSignalSource,
  testSignalSource,
} from '../controllers/signal-sources';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

const createSourceSchema = z.object({
  type: z.enum(['GITHUB', 'NPM', 'WEBSITE', 'DOCS', 'PRODUCT_API', 'SEGMENT', 'CUSTOM_WEBHOOK']),
  name: z.string().min(1),
  config: z.record(z.unknown()),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ERROR']).optional(),
});

router.get('/', getSignalSources);
router.get('/:id', getSignalSource);
router.post('/', validate(createSourceSchema), createSignalSource);
router.put('/:id', validate(updateSourceSchema), updateSignalSource);
router.delete('/:id', deleteSignalSource);
router.post('/:id/test', testSignalSource);

export default router;
