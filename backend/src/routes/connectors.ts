import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { syncNpmSource, testNpmConnection } from '../services/npm-connector';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// --- Validation schemas ---

const testNpmSchema = z.object({
  packages: z
    .array(z.string().min(1))
    .min(1, 'At least one package name is required')
    .max(50, 'Maximum 50 packages per test request'),
});

// --- Routes ---

/**
 * POST /connectors/npm/:sourceId/sync
 *
 * Triggers a sync for a specific npm signal source.
 * Fetches download stats and registry metadata for all configured packages,
 * creates idempotent signals, and updates the source status.
 */
router.post('/npm/:sourceId/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceId } = req.params;
    const organizationId = req.organizationId!;

    const result = await syncNpmSource(organizationId, sourceId);

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    logger.error('npm sync endpoint error', { error: err });

    // Surface "not found" errors as 404
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    res.status(500).json({ error: message });
  }
});

/**
 * POST /connectors/npm/test
 *
 * Tests npm API connectivity for the given package names.
 * Does not persist any data; returns per-package download counts or errors.
 *
 * Body: { packages: string[] }
 */
router.post('/npm/test', validate(testNpmSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { packages } = req.body as z.infer<typeof testNpmSchema>;

    const result = await testNpmConnection(packages);

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Test failed';
    logger.error('npm test endpoint error', { error: err });
    res.status(500).json({ error: message });
  }
});

export default router;
