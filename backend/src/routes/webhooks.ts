import { Router } from 'express';
import { getWebhooks, createWebhook, deleteWebhook } from '../controllers/webhooks';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

router.get('/', getWebhooks);
router.post('/', validate(createWebhookSchema), createWebhook);
router.delete('/:id', deleteWebhook);

export default router;
