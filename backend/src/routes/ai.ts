import { Router } from 'express';
import { generateBrief, getBrief, suggestActions, enrichContact } from '../controllers/ai';
import { authenticate, requireOrganization } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// Account briefs
router.get('/brief/:accountId', getBrief);
router.post('/brief/:accountId', generateBrief);

// Next-best-actions
router.post('/suggest/:accountId', suggestActions);

// Contact enrichment
router.post('/enrich/:contactId', enrichContact);

export default router;
