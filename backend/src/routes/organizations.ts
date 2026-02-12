import { Router } from 'express';
import {
  createOrganization,
  getOrganizations,
  getOrganization,
  updateOrganization,
} from '../controllers/organizations';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createOrganizationSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  logo: z.string().url().optional(),
  settings: z.record(z.unknown()).optional(),
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  logo: z.string().url().optional(),
  settings: z.record(z.unknown()).optional(),
});

router.post('/', validate(createOrganizationSchema), createOrganization);
router.get('/', getOrganizations);
router.get('/:id', getOrganization);
router.put('/:id', validate(updateOrganizationSchema), updateOrganization);

export default router;
