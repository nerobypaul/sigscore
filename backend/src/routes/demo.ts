import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { seedDemoData, clearDemoData, hasDemoData } from '../services/demo-data';
import { createDemoEnvironment, getDemoStatus } from '../services/demo-seed';
import { logger } from '../utils/logger';

const router = Router();

const DEMO_SEED_TIMEOUT_MS = 45_000; // 45s — matches frontend step animation

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Demo seed timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// PUBLIC DEMO ENDPOINTS (no auth required — they create their own session)
// ---------------------------------------------------------------------------

/**
 * POST /demo/seed — Creates a standalone demo org + user, seeds all data,
 * and returns JWT tokens so the visitor can immediately explore the product.
 */
router.post(
  '/seed',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await withTimeout(createDemoEnvironment(), DEMO_SEED_TIMEOUT_MS);

      logger.info('Public demo environment created', {
        organizationId: result.organizationId,
        userId: result.userId,
        counts: result.counts,
      });

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        organizationId: result.organizationId,
        user: {
          id: result.userId,
          email: 'demo@sigscore.dev',
          firstName: 'Demo',
          lastName: 'User',
          role: 'ADMIN',
          organizations: [
            {
              organizationId: result.organizationId,
              role: 'OWNER',
              organization: {
                id: result.organizationId,
                name: 'Sigscore Demo',
                slug: 'sigscore-demo',
              },
            },
          ],
        },
        counts: result.counts,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        logger.warn('Demo seed timed out', { error: error.message });
        res.status(504).json({ error: 'Demo is taking longer than usual. Please try again.' });
        return;
      }
      logger.error('Failed to create demo environment', { error });
      next(error);
    }
  },
);

/**
 * GET /demo/status — Check if a demo org currently exists (public, no auth).
 */
router.get(
  '/status',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await getDemoStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// AUTHENTICATED DEMO ENDPOINTS (for logged-in users managing their own org)
// ---------------------------------------------------------------------------

/**
 * GET /demo/org-status — Check if demo data exists in the user's org.
 * Requires authentication + organization context.
 */
router.get(
  '/org-status',
  authenticate,
  requireOrganization,
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

/**
 * POST /demo/org-seed — Seed demo data for an authenticated user's org.
 * Requires ADMIN role.
 */
router.post(
  '/org-seed',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

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

/**
 * DELETE /demo/org-seed — Clear demo data from an authenticated user's org.
 * Requires ADMIN role.
 */
router.delete(
  '/org-seed',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
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
