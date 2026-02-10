import { Router } from 'express';
import { getDeals, getDeal, createDeal, updateDeal, deleteDeal } from '../controllers/deals';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createDealSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    amount: z.number().optional(),
    currency: z.string().default('USD'),
    stage: z.enum(['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']).default('LEAD'),
    probability: z.number().min(0).max(100).optional(),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    ownerId: z.string().optional(),
    expectedCloseDate: z.string().datetime().optional(),
    description: z.string().optional(),
  }),
});

const updateDealSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    stage: z.enum(['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']).optional(),
    probability: z.number().min(0).max(100).optional(),
    contactId: z.string().optional(),
    companyId: z.string().optional(),
    ownerId: z.string().optional(),
    expectedCloseDate: z.string().datetime().optional(),
    closedAt: z.string().datetime().optional(),
    description: z.string().optional(),
  }),
});

// Routes
router.get('/', getDeals);
router.get('/:id', getDeal);
router.post('/', validate(createDealSchema), createDeal);
router.put('/:id', validate(updateDealSchema), updateDeal);
router.delete('/:id', deleteDeal);

export default router;
