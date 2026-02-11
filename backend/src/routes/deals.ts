import { Router } from 'express';
import { getDeals, getDeal, createDeal, updateDeal, deleteDeal } from '../controllers/deals';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// Validation schemas
// PLG-native pipeline stages
const PLG_STAGES = [
  'ANONYMOUS_USAGE',
  'IDENTIFIED',
  'ACTIVATED',
  'TEAM_ADOPTION',
  'EXPANSION_SIGNAL',
  'SALES_QUALIFIED',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
] as const;

const createDealSchema = z.object({
  title: z.string().min(1),
  amount: z.number().optional(),
  currency: z.string().default('USD'),
  stage: z.enum(PLG_STAGES).default('ANONYMOUS_USAGE'),
  probability: z.number().min(0).max(100).optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  ownerId: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional(),
  description: z.string().optional(),
});

const updateDealSchema = z.object({
  title: z.string().min(1).optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  stage: z.enum(PLG_STAGES).optional(),
  probability: z.number().min(0).max(100).optional(),
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  ownerId: z.string().optional(),
  expectedCloseDate: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
  description: z.string().optional(),
});

// Routes
router.get('/', getDeals);
router.get('/:id', getDeal);
router.post('/', validate(createDealSchema), createDeal);
router.put('/:id', validate(updateDealSchema), updateDeal);
router.delete('/:id', deleteDeal);

export default router;
