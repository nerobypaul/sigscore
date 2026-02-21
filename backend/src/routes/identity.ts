import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  findDuplicates,
  mergeContacts,
  enrichContact,
  getIdentityGraph,
  getAutoMergeStats,
} from '../services/identity-resolution';
import { logger } from '../utils/logger';

const router = Router();

// All identity routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const mergeSchema = z.object({
  primaryId: z.string().min(1),
  duplicateIds: z.array(z.string().min(1)).min(1).max(50),
});

// ---------------------------------------------------------------------------
// GET /api/v1/identity/duplicates
// Find potential duplicate contacts based on shared identities
// Requires: MEMBER+
// ---------------------------------------------------------------------------

router.get(
  '/duplicates',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const duplicates = await findDuplicates(orgId);

      res.json({
        duplicates,
        count: duplicates.length,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/identity/merge
// Merge duplicate contacts into a primary contact
// Requires: ADMIN+
// ---------------------------------------------------------------------------

router.post(
  '/merge',
  requireOrgRole('ADMIN'),
  validate(mergeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const { primaryId, duplicateIds } = req.body;

      const result = await mergeContacts(orgId, primaryId, duplicateIds);

      logger.info('Contact merge completed', {
        organizationId: orgId,
        primaryId,
        duplicateCount: duplicateIds.length,
        merged: result.merged,
        errors: result.errors.length,
      });

      res.json({
        merged: result.merged,
        errors: result.errors,
        primaryId,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/identity/enrich/:contactId
// Trigger enrichment for a specific contact
// Requires: MEMBER+
// ---------------------------------------------------------------------------

router.post(
  '/enrich/:contactId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const { contactId } = req.params;

      const result = await enrichContact(orgId, contactId);

      res.json({
        contactId,
        identitiesAdded: result.identitiesAdded,
        companyResolved: result.companyResolved,
        enrichments: result.enrichments,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/identity/graph/:contactId
// View the full identity graph for a contact
// Requires: MEMBER+
// ---------------------------------------------------------------------------

router.get(
  '/graph/:contactId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const { contactId } = req.params;

      const graph = await getIdentityGraph(orgId, contactId);

      res.json(graph);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/identity/auto-merge-stats
// View auto-merge statistics for the organization
// Requires: MEMBER+
// ---------------------------------------------------------------------------

router.get(
  '/auto-merge-stats',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const stats = await getAutoMergeStats(orgId);

      res.json(stats);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
