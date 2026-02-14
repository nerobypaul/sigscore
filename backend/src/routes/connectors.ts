import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { testNpmConnection } from '../services/npm-connector';
import { testPypiConnection } from '../services/pypi-connector';
import { enqueueSignalSync } from '../jobs/producers';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// --- Validation schemas ---

const testPackagesSchema = z.object({
  packages: z
    .array(z.string().min(1))
    .min(1, 'At least one package name is required')
    .max(50, 'Maximum 50 packages per test request'),
});

// --- Routes ---

/**
 * POST /connectors/npm/:sourceId/sync
 *
 * Enqueues a sync job for a specific npm signal source.
 * The actual sync runs asynchronously via BullMQ workers.
 */
router.post('/npm/:sourceId/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceId } = req.params;
    const organizationId = req.organizationId!;

    const job = await enqueueSignalSync('npm', sourceId, organizationId);

    res.json({ message: 'Sync job queued', jobId: job.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to enqueue sync';
    logger.error('npm sync enqueue error', { error: err });
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
router.post('/npm/test', validate(testPackagesSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { packages } = req.body as z.infer<typeof testPackagesSchema>;

    const result = await testNpmConnection(packages);

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Test failed';
    logger.error('npm test endpoint error', { error: err });
    res.status(500).json({ error: message });
  }
});

// =====================================================================
// PyPI Connector
// =====================================================================

/**
 * POST /connectors/pypi/:sourceId/sync
 *
 * Enqueues a sync job for a specific PyPI signal source.
 * The actual sync runs asynchronously via BullMQ workers.
 */
router.post('/pypi/:sourceId/sync', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sourceId } = req.params;
    const organizationId = req.organizationId!;

    const job = await enqueueSignalSync('pypi', sourceId, organizationId);

    res.json({ message: 'Sync job queued', jobId: job.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to enqueue sync';
    logger.error('PyPI sync enqueue error', { error: err });
    res.status(500).json({ error: message });
  }
});

/**
 * POST /connectors/pypi/test
 *
 * Tests PyPI API connectivity for the given package names.
 * Does not persist any data; returns per-package download counts or errors.
 *
 * Body: { packages: string[] }
 */
router.post('/pypi/test', validate(testPackagesSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { packages } = req.body as z.infer<typeof testPackagesSchema>;

    const result = await testPypiConnection(packages);

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Test failed';
    logger.error('PyPI test endpoint error', { error: err });
    res.status(500).json({ error: message });
  }
});

// =====================================================================
// Segment Connector
// =====================================================================

const createSegmentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

/**
 * POST /connectors/segment
 *
 * Creates a new Segment signal source with an auto-generated shared secret.
 * Requires ADMIN role.
 */
router.post(
  '/segment',
  requireOrgRole('ADMIN'),
  validate(createSegmentSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { name } = req.body as z.infer<typeof createSegmentSchema>;

      const sharedSecret = crypto.randomBytes(32).toString('hex');

      const source = await prisma.signalSource.create({
        data: {
          organizationId,
          type: 'SEGMENT',
          name,
          config: { sharedSecret } as unknown as Prisma.InputJsonValue,
          status: 'ACTIVE',
        },
      });

      const webhookUrl = `/api/v1/webhooks/segment/${source.id}`;

      res.status(201).json({
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          status: source.status,
          webhookUrl,
          sharedSecret,
          createdAt: source.createdAt,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create Segment source';
      logger.error('Segment create error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

/**
 * GET /connectors/segment/:sourceId
 *
 * Returns the Segment source configuration including webhook URL and shared secret.
 * Requires ADMIN role.
 */
router.get(
  '/segment/:sourceId',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { sourceId } = req.params;

      const source = await prisma.signalSource.findFirst({
        where: { id: sourceId, organizationId, type: 'SEGMENT' },
      });

      if (!source) {
        res.status(404).json({ error: 'Segment source not found' });
        return;
      }

      const config = source.config as Record<string, unknown> | null;
      const webhookUrl = `/api/v1/webhooks/segment/${source.id}`;

      res.json({
        source: {
          id: source.id,
          name: source.name,
          type: source.type,
          status: source.status,
          webhookUrl,
          sharedSecret: config?.sharedSecret || null,
          lastSyncAt: source.lastSyncAt,
          createdAt: source.createdAt,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to get Segment source';
      logger.error('Segment get error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /connectors/segment/:sourceId/rotate-secret
 *
 * Rotates the shared secret for a Segment source.
 * Requires ADMIN role.
 */
router.post(
  '/segment/:sourceId/rotate-secret',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { sourceId } = req.params;

      const source = await prisma.signalSource.findFirst({
        where: { id: sourceId, organizationId, type: 'SEGMENT' },
      });

      if (!source) {
        res.status(404).json({ error: 'Segment source not found' });
        return;
      }

      const newSecret = crypto.randomBytes(32).toString('hex');
      const existingConfig = (source.config as Record<string, unknown>) || {};

      await prisma.signalSource.update({
        where: { id: sourceId },
        data: {
          config: { ...existingConfig, sharedSecret: newSecret } as unknown as Prisma.InputJsonValue,
        },
      });

      res.json({ sharedSecret: newSecret });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to rotate secret';
      logger.error('Segment rotate-secret error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

/**
 * DELETE /connectors/segment/:sourceId
 *
 * Deletes a Segment signal source.
 * Requires ADMIN role.
 */
router.delete(
  '/segment/:sourceId',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { sourceId } = req.params;

      const source = await prisma.signalSource.findFirst({
        where: { id: sourceId, organizationId, type: 'SEGMENT' },
      });

      if (!source) {
        res.status(404).json({ error: 'Segment source not found' });
        return;
      }

      await prisma.signalSource.delete({
        where: { id: sourceId },
      });

      res.json({ ok: true, deleted: sourceId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete Segment source';
      logger.error('Segment delete error', { error: err });
      res.status(500).json({ error: message });
    }
  },
);

export default router;
