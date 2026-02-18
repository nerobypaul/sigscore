import { Router } from 'express';
import {
  getSchemas,
  getSchema,
  createSchema,
  updateSchema,
  deleteSchema,
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
} from '../controllers/custom-objects';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ============================================================
// Validation Schemas
// ============================================================

const fieldDefinitionSchema = z.object({
  name: z.string().min(1, 'Field name is required'),
  type: z.enum(['string', 'number', 'boolean', 'date']),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
});

const createSchemaValidation = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  fields: z.array(fieldDefinitionSchema).min(1, 'At least one field is required'),
});

const updateSchemaValidation = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  fields: z.array(fieldDefinitionSchema).min(1).optional(),
});

// ============================================================
// Schema Routes
// ============================================================

router.get('/', getSchemas);
router.post('/', validate(createSchemaValidation), createSchema);
router.get('/:slug', getSchema);
router.put('/:slug', validate(updateSchemaValidation), updateSchema);
router.delete('/:slug', deleteSchema);

// ============================================================
// Record Routes
// ============================================================

const recordDataSchema = z.record(z.unknown()).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'Record data must have at least one field' },
);

router.get('/:slug/records', getRecords);
router.post('/:slug/records', validate(recordDataSchema), createRecord);
router.get('/:slug/records/:id', getRecord);
router.put('/:slug/records/:id', validate(recordDataSchema), updateRecord);
router.delete('/:slug/records/:id', deleteRecord);

export default router;
