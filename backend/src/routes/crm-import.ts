import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import {
  detectCsvFormat,
  importContactsCsv,
  importCompaniesCsv,
  importDealsCsv,
} from '../services/crm-import';
import type { CrmFormat } from '../services/crm-import';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// Multer setup — memory storage, 10 MB limit
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    // Accept CSV and plain text files
    const allowedMimes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
    if (allowedMimes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const formatSchema = z.object({
  format: z.enum(['hubspot', 'salesforce']),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /detect — Detect CSV format (HubSpot vs Salesforce) and entity type
 * Accepts multipart file upload (field: "file")
 */
router.post(
  '/detect',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
        return;
      }

      const csvContent = req.file.buffer.toString('utf-8');
      if (!csvContent.trim()) {
        res.status(400).json({ error: 'Uploaded file is empty' });
        return;
      }

      const result = detectCsvFormat(csvContent);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /contacts — Import contacts from a CRM CSV export
 * Accepts multipart file upload (field: "file") + query param format (hubspot|salesforce)
 */
router.post(
  '/contacts',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
        return;
      }

      const parsed = formatSchema.safeParse({ format: req.query.format });
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid or missing format query parameter. Must be "hubspot" or "salesforce".',
          details: parsed.error.errors,
        });
        return;
      }

      const format = parsed.data.format as CrmFormat;
      const csvContent = req.file.buffer.toString('utf-8');

      if (!csvContent.trim()) {
        res.status(400).json({ error: 'Uploaded file is empty' });
        return;
      }

      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const result = await importContactsCsv(organizationId, csvContent, format, userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /companies — Import companies from a CRM CSV export
 * Accepts multipart file upload (field: "file") + query param format (hubspot|salesforce)
 */
router.post(
  '/companies',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
        return;
      }

      const parsed = formatSchema.safeParse({ format: req.query.format });
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid or missing format query parameter. Must be "hubspot" or "salesforce".',
          details: parsed.error.errors,
        });
        return;
      }

      const format = parsed.data.format as CrmFormat;
      const csvContent = req.file.buffer.toString('utf-8');

      if (!csvContent.trim()) {
        res.status(400).json({ error: 'Uploaded file is empty' });
        return;
      }

      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const result = await importCompaniesCsv(organizationId, csvContent, format, userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /deals — Import deals from a CRM CSV export
 * Accepts multipart file upload (field: "file") + query param format (hubspot|salesforce)
 */
router.post(
  '/deals',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
        return;
      }

      const parsed = formatSchema.safeParse({ format: req.query.format });
      if (!parsed.success) {
        res.status(400).json({
          error: 'Invalid or missing format query parameter. Must be "hubspot" or "salesforce".',
          details: parsed.error.errors,
        });
        return;
      }

      const format = parsed.data.format as CrmFormat;
      const csvContent = req.file.buffer.toString('utf-8');

      if (!csvContent.trim()) {
        res.status(400).json({ error: 'Uploaded file is empty' });
        return;
      }

      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const result = await importDealsCsv(organizationId, csvContent, format, userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
