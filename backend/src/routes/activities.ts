import { Router } from 'express';
import { getActivities, getActivity, createActivity, updateActivity, deleteActivity } from '../controllers/activities';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createActivitySchema = z.object({
  type: z.enum(['TASK', 'CALL', 'MEETING', 'EMAIL', 'NOTE']),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PENDING'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().datetime().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
});

const updateActivitySchema = z.object({
  type: z.enum(['TASK', 'CALL', 'MEETING', 'EMAIL', 'NOTE']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
});

// Routes
router.get('/', getActivities);
router.get('/:id', getActivity);
router.post('/', validate(createActivitySchema), createActivity);
router.put('/:id', validate(updateActivitySchema), updateActivity);
router.delete('/:id', deleteActivity);

export default router;
