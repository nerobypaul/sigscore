import { Router } from 'express';
import { createApiKey, listApiKeys, revokeApiKey, deleteApiKey } from '../controllers/api-keys';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All API key management routes require JWT authentication + organization context
// (only logged-in users can manage API keys, not API keys themselves)
router.use(authenticate);
router.use(requireOrganization);

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime().optional(),
});

// Routes
router.get('/', listApiKeys);
router.post('/', validate(createApiKeySchema), createApiKey);
router.put('/:id/revoke', revokeApiKey);
router.delete('/:id', deleteApiKey);

export default router;
