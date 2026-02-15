import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  configureClearbit,
  getClearbitConfig,
  disconnectClearbit,
  enrichCompany,
  enrichContact,
  getEnrichmentStats,
} from '../services/clearbit-enrichment';
import { enqueueBulkEnrichment } from '../jobs/producers';
import { logger } from '../utils/logger';

const router = Router();

// All enrichment routes require JWT auth + org context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  apiKey: z.string().min(1, 'Clearbit API key is required'),
});

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/connect
// Save Clearbit API key (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { apiKey } = req.body;

      await configureClearbit(organizationId, apiKey);

      logger.info('Clearbit connected via API', { organizationId });

      res.json({
        connected: true,
        message: 'Clearbit connected successfully. You can now enrich company and contact records.',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/enrichment/status
// Get Clearbit config + enrichment stats (ADMIN only)
// ---------------------------------------------------------------------------

router.get(
  '/status',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const [config, stats] = await Promise.all([
        getClearbitConfig(organizationId),
        getEnrichmentStats(organizationId),
      ]);

      res.json({
        ...config,
        ...stats,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/companies/:companyId
// Enrich a single company (MEMBER+)
// ---------------------------------------------------------------------------

router.post(
  '/companies/:companyId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { companyId } = req.params;

      const result = await enrichCompany(organizationId, companyId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/contacts/:contactId
// Enrich a single contact (MEMBER+)
// ---------------------------------------------------------------------------

router.post(
  '/contacts/:contactId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { contactId } = req.params;

      const result = await enrichContact(organizationId, contactId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/bulk/companies
// Trigger bulk company enrichment via BullMQ (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/bulk/companies',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      // Verify Clearbit is connected
      const config = await getClearbitConfig(organizationId);
      if (!config.connected) {
        res.status(400).json({ error: 'Clearbit is not connected. Add your API key first.' });
        return;
      }

      await enqueueBulkEnrichment(organizationId, 'companies');

      logger.info('Bulk company enrichment triggered', { organizationId });

      res.json({
        message: 'Bulk company enrichment has been queued and will begin shortly.',
        type: 'companies',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/bulk/contacts
// Trigger bulk contact enrichment via BullMQ (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/bulk/contacts',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const config = await getClearbitConfig(organizationId);
      if (!config.connected) {
        res.status(400).json({ error: 'Clearbit is not connected. Add your API key first.' });
        return;
      }

      await enqueueBulkEnrichment(organizationId, 'contacts');

      logger.info('Bulk contact enrichment triggered', { organizationId });

      res.json({
        message: 'Bulk contact enrichment has been queued and will begin shortly.',
        type: 'contacts',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/enrichment/disconnect
// Remove Clearbit config (ADMIN only)
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectClearbit(organizationId);

      logger.info('Clearbit disconnected via API', { organizationId });

      res.json({
        connected: false,
        message: 'Clearbit has been disconnected. Existing enrichment data remains.',
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
