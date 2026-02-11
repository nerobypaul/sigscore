import { Router } from 'express';
import { getWebhooks, createWebhook, deleteWebhook } from '../controllers/webhooks';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

const createWebhookSchema = z.object({
  url: z.string().url()
    .refine(url => url.startsWith('https://'), { message: 'Webhook URLs must use HTTPS' })
    .refine(url => {
      const hostname = new URL(url).hostname;
      return !hostname.match(/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/);
    }, { message: 'Webhook URLs must point to public endpoints' }),
  events: z.array(z.string()).min(1),
});

router.get('/', getWebhooks);
router.post('/', validate(createWebhookSchema), createWebhook);
router.delete('/:id', deleteWebhook);

export default router;
