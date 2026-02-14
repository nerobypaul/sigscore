import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { seedDemoData, clearDemoData, hasDemoData } from '../services/demo-data';
import { logger } from '../utils/logger';

const router = Router();

// All demo routes require authentication + organization + ADMIN role
router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// GET /demo/status — Check if demo data exists
// ---------------------------------------------------------------------------

router.get(
  '/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const seeded = await hasDemoData(organizationId);
      res.json({ hasDemoData: seeded });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /demo/seed — Seed demo data for the organization
// ---------------------------------------------------------------------------

router.post(
  '/seed',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      // Idempotency check
      const alreadySeeded = await hasDemoData(organizationId);
      if (alreadySeeded) {
        res.json({ alreadySeeded: true });
        return;
      }

      const counts = await seedDemoData(organizationId, userId);

      logger.info('Demo data seeded via API', { organizationId, counts });
      res.json({ seeded: true, counts });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /demo/seed — Clear demo data from the organization
// ---------------------------------------------------------------------------

router.delete(
  '/seed',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await clearDemoData(organizationId);

      logger.info('Demo data cleared via API', { organizationId });
      res.json({ cleared: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
