import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { enqueueDataExport } from '../jobs/producers';
import { getExportStatus, getExportHistory, setExportStatus } from '../services/data-export';
import { logger } from '../utils/logger';

const router = Router();

// All export routes require authentication + organization + ADMIN role
router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const VALID_ENTITIES = ['contacts', 'companies', 'signals', 'deals', 'activities'];
const VALID_FORMATS = ['json', 'csv'] as const;

const startExportSchema = z.object({
  format: z.enum(VALID_FORMATS),
  entities: z
    .array(z.enum(['contacts', 'companies', 'signals', 'deals', 'activities']))
    .min(1, 'At least one entity must be selected')
    .max(VALID_ENTITIES.length),
  filters: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// POST /exports — Start a new data export job
// ---------------------------------------------------------------------------

router.post(
  '/',
  validate(startExportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { format, entities, filters } = req.body as z.infer<typeof startExportSchema>;
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const job = await enqueueDataExport({
        organizationId,
        userId,
        format,
        entities,
        filters,
      });

      const jobId = job.id ?? `unknown-${Date.now()}`;

      // Initialize status in the in-memory store
      setExportStatus(jobId, {
        jobId,
        organizationId,
        userId,
        format,
        entities,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      res.status(202).json({
        jobId,
        status: 'pending',
        message: 'Data export job has been queued',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /exports — List export history for the current organization
// ---------------------------------------------------------------------------

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const history = getExportHistory(organizationId);

      // Strip filePath from the response (internal detail)
      const sanitized = history.map(({ filePath: _filePath, ...rest }) => rest);

      res.json({ exports: sanitized });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /exports/:jobId/status — Check export job status
// ---------------------------------------------------------------------------

router.get(
  '/:jobId/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = req.params;
      const organizationId = req.organizationId!;
      const status = getExportStatus(jobId);

      if (!status || status.organizationId !== organizationId) {
        res.status(404).json({ error: 'Export job not found' });
        return;
      }

      // Strip filePath from the response
      const { filePath: _filePath, ...sanitized } = status;

      res.json(sanitized);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /exports/:jobId/download — Download completed export file
// ---------------------------------------------------------------------------

router.get(
  '/:jobId/download',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = req.params;
      const organizationId = req.organizationId!;
      const status = getExportStatus(jobId);

      if (!status || status.organizationId !== organizationId) {
        res.status(404).json({ error: 'Export job not found' });
        return;
      }

      if (status.status !== 'completed') {
        res.status(400).json({
          error: 'Export is not yet completed',
          status: status.status,
        });
        return;
      }

      if (!status.filePath || !fs.existsSync(status.filePath)) {
        logger.warn('Export file not found on disk', { jobId, filePath: status.filePath });
        res.status(410).json({ error: 'Export file has expired or been removed' });
        return;
      }

      const ext = status.format === 'csv' ? 'csv' : 'json';
      const downloadName = status.fileName || `sigscore-export.${ext}`;
      const contentType = status.format === 'csv' ? 'text/csv' : 'application/json';

      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(status.sizeBytes ?? 0));

      const readStream = fs.createReadStream(status.filePath);
      readStream.pipe(res);

      readStream.on('error', (err) => {
        logger.error('Error streaming export file', { jobId, error: err.message });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream export file' });
        }
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
