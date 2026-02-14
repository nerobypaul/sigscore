import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  connectSalesforce,
  disconnectSalesforce,
  getSyncStatus,
} from '../services/salesforce-sync';
import { enqueueSalesforceSync } from '../jobs/producers';
import { logger } from '../utils/logger';

const router = Router();

// All Salesforce sync routes require JWT auth + org context + ADMIN role
router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().min(1, 'Refresh token is required'),
  instanceUrl: z.string().url('Instance URL must be a valid URL'),
});

const syncSchema = z.object({
  fullSync: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// POST /api/v1/integrations/salesforce/connect
// Store OAuth tokens + instance URL and register custom fields
// ---------------------------------------------------------------------------

router.post(
  '/salesforce/connect',
  validate(connectSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { accessToken, refreshToken, instanceUrl } = req.body;

      await connectSalesforce(organizationId, accessToken, refreshToken, instanceUrl);

      logger.info('Salesforce connected via API', { organizationId });

      res.json({
        connected: true,
        message: 'Salesforce connected successfully. Custom fields have been registered.',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/integrations/salesforce/sync
// Trigger a sync (full or incremental)
// ---------------------------------------------------------------------------

router.post(
  '/salesforce/sync',
  validate(syncSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { fullSync } = req.body;

      // Check if already syncing
      const status = await getSyncStatus(organizationId);
      if (!status.connected) {
        res.status(400).json({
          error: 'Salesforce is not connected. Connect Salesforce first.',
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
      await enqueueSalesforceSync(organizationId, fullSync);

      logger.info('Salesforce sync triggered', { organizationId, fullSync });

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
// GET /api/v1/integrations/salesforce/status
// Get current sync status
// ---------------------------------------------------------------------------

router.get(
  '/salesforce/status',
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
// DELETE /api/v1/integrations/salesforce/disconnect
// Remove tokens and stop syncing
// ---------------------------------------------------------------------------

router.delete(
  '/salesforce/disconnect',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectSalesforce(organizationId);

      logger.info('Salesforce disconnected via API', { organizationId });

      res.json({
        connected: false,
        message: 'Salesforce has been disconnected.',
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
