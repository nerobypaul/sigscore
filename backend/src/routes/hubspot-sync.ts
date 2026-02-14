import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  connectHubSpot,
  disconnectHubSpot,
  getSyncStatus,
} from '../services/hubspot-sync';
import { enqueueHubSpotSync } from '../jobs/producers';
import { logger } from '../utils/logger';

const router = Router();

// All HubSpot sync routes require JWT auth + org context + ADMIN role
router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().min(1, 'Refresh token is required'),
  portalId: z.string().optional(),
});

const syncSchema = z.object({
  fullSync: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// POST /api/v1/integrations/hubspot/connect
// Store OAuth tokens and register custom properties in HubSpot
// ---------------------------------------------------------------------------

router.post(
  '/hubspot/connect',
  validate(connectSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { accessToken, refreshToken, portalId } = req.body;

      await connectHubSpot(organizationId, accessToken, refreshToken, portalId);

      logger.info('HubSpot connected via API', { organizationId });

      res.json({
        connected: true,
        message: 'HubSpot connected successfully. Custom properties have been registered.',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/integrations/hubspot/sync
// Trigger a sync (full or incremental)
// ---------------------------------------------------------------------------

router.post(
  '/hubspot/sync',
  validate(syncSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { fullSync } = req.body;

      // Check if already syncing
      const status = await getSyncStatus(organizationId);
      if (!status.connected) {
        res.status(400).json({
          error: 'HubSpot is not connected. Connect HubSpot first.',
        });
        return;
      }
      if (status.syncInProgress) {
        res.status(409).json({
          error: 'A sync is already in progress. Please wait for it to complete.',
        });
        return;
      }

      // Enqueue the sync job
      await enqueueHubSpotSync(organizationId, fullSync);

      logger.info('HubSpot sync triggered', { organizationId, fullSync });

      res.json({
        message: fullSync
          ? 'Full sync has been queued and will begin shortly.'
          : 'Incremental sync has been queued and will begin shortly.',
        syncInProgress: true,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/integrations/hubspot/status
// Get current sync status
// ---------------------------------------------------------------------------

router.get(
  '/hubspot/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = await getSyncStatus(organizationId);
      res.json(status);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/integrations/hubspot/disconnect
// Remove tokens and stop syncing
// ---------------------------------------------------------------------------

router.delete(
  '/hubspot/disconnect',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectHubSpot(organizationId);

      logger.info('HubSpot disconnected via API', { organizationId });

      res.json({
        connected: false,
        message: 'HubSpot has been disconnected.',
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
