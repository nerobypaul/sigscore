import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import type { Prisma } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const createFieldSchema = z.object({
  entityType: z.enum(['contact', 'company']),
  fieldName: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9_]*$/, 'Must start with a letter and contain only lowercase letters, numbers, and underscores'),
  displayName: z.string().min(1).max(200),
  fieldType: z.enum(['text', 'number', 'boolean', 'date', 'select']),
  options: z.array(z.string().min(1)).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updateFieldSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  fieldType: z.enum(['text', 'number', 'boolean', 'date', 'select']).optional(),
  options: z.array(z.string().min(1)).nullable().optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const setValuesSchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

// ---------------------------------------------------------------------------
// Routes — Field Definitions
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/custom-fields?entityType=contact
 * List custom field definitions for the organization.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const where: Prisma.CustomFieldDefinitionWhereInput = {
      organizationId: req.organizationId!,
    };
    if (entityType) {
      where.entityType = entityType;
    }

    const fields = await prisma.customFieldDefinition.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ fields });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/custom-fields
 * Create a new custom field definition. Requires ADMIN role.
 */
router.post(
  '/',
  requireOrgRole('ADMIN'),
  validate(createFieldSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, fieldName, displayName, fieldType, options, required, sortOrder } = req.body;

      // Validate that select type has options
      if (fieldType === 'select' && (!options || options.length === 0)) {
        res.status(400).json({ error: 'Select fields require at least one option' });
        return;
      }

      const field = await prisma.customFieldDefinition.create({
        data: {
          organizationId: req.organizationId!,
          entityType,
          fieldName,
          displayName,
          fieldType,
          options: options ? (options as unknown as Prisma.InputJsonValue) : undefined,
          required: required ?? false,
          sortOrder: sortOrder ?? 0,
        },
      });

      res.status(201).json({ field });
    } catch (error) {
      // Handle unique constraint violation
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        res.status(409).json({ error: 'A field with this name already exists for this entity type' });
        return;
      }
      next(error);
    }
  },
);

/**
 * PUT /api/v1/custom-fields/:id
 * Update a custom field definition. Requires ADMIN role.
 */
router.put(
  '/:id',
  requireOrgRole('ADMIN'),
  validate(updateFieldSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { displayName, fieldType, options, required, sortOrder } = req.body;

      // Verify the field belongs to this organization
      const existing = await prisma.customFieldDefinition.findFirst({
        where: { id, organizationId: req.organizationId! },
      });

      if (!existing) {
        res.status(404).json({ error: 'Custom field definition not found' });
        return;
      }

      // Validate select type has options
      const effectiveType = fieldType ?? existing.fieldType;
      const effectiveOptions = options === null ? null : options ?? existing.options;
      if (effectiveType === 'select' && (!effectiveOptions || (Array.isArray(effectiveOptions) && effectiveOptions.length === 0))) {
        res.status(400).json({ error: 'Select fields require at least one option' });
        return;
      }

      const data: Prisma.CustomFieldDefinitionUpdateInput = {};
      if (displayName !== undefined) data.displayName = displayName;
      if (fieldType !== undefined) data.fieldType = fieldType;
      if (options !== undefined) data.options = options as unknown as Prisma.InputJsonValue;
      if (required !== undefined) data.required = required;
      if (sortOrder !== undefined) data.sortOrder = sortOrder;

      const field = await prisma.customFieldDefinition.update({
        where: { id },
        data,
      });

      res.json({ field });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/v1/custom-fields/:id
 * Delete a custom field definition. Requires ADMIN role.
 */
router.delete(
  '/:id',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      // Verify the field belongs to this organization
      const existing = await prisma.customFieldDefinition.findFirst({
        where: { id, organizationId: req.organizationId! },
      });

      if (!existing) {
        res.status(404).json({ error: 'Custom field definition not found' });
        return;
      }

      await prisma.customFieldDefinition.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Routes — Custom Field Values (stored in entity's customFields JSONB)
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/custom-fields/values/:entityType/:entityId
 * Get custom field values for a specific entity.
 */
router.get(
  '/values/:entityType/:entityId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, entityId } = req.params;

      if (entityType !== 'contact' && entityType !== 'company') {
        res.status(400).json({ error: 'entityType must be "contact" or "company"' });
        return;
      }

      // Fetch the entity's customFields JSONB
      let customFields: Record<string, unknown> = {};

      if (entityType === 'contact') {
        const entity = await prisma.contact.findFirst({
          where: { id: entityId, organizationId: req.organizationId! },
          select: { customFields: true },
        });
        if (!entity) {
          res.status(404).json({ error: 'Contact not found' });
          return;
        }
        customFields = (entity.customFields as Record<string, unknown>) || {};
      } else {
        const entity = await prisma.company.findFirst({
          where: { id: entityId, organizationId: req.organizationId! },
          select: { customFields: true },
        });
        if (!entity) {
          res.status(404).json({ error: 'Company not found' });
          return;
        }
        customFields = (entity.customFields as Record<string, unknown>) || {};
      }

      res.json({ values: customFields });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/v1/custom-fields/values/:entityType/:entityId
 * Set custom field values for a specific entity.
 * Merges provided values into the existing customFields JSONB.
 */
router.put(
  '/values/:entityType/:entityId',
  validate(setValuesSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, entityId } = req.params;
      const { values } = req.body as { values: Record<string, unknown> };

      if (entityType !== 'contact' && entityType !== 'company') {
        res.status(400).json({ error: 'entityType must be "contact" or "company"' });
        return;
      }

      // Fetch field definitions for validation
      const definitions = await prisma.customFieldDefinition.findMany({
        where: { organizationId: req.organizationId!, entityType },
      });

      const defMap = new Map(definitions.map((d) => [d.fieldName, d]));

      // Validate values against definitions
      for (const [key, value] of Object.entries(values)) {
        const def = defMap.get(key);
        if (!def) {
          res.status(400).json({ error: `Unknown custom field: ${key}` });
          return;
        }

        // Skip null/empty values (clearing a field)
        if (value === null || value === '' || value === undefined) continue;

        // Type validation
        switch (def.fieldType) {
          case 'number':
            if (typeof value !== 'number' && isNaN(Number(value))) {
              res.status(400).json({ error: `Field "${def.displayName}" must be a number` });
              return;
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              res.status(400).json({ error: `Field "${def.displayName}" must be a boolean` });
              return;
            }
            break;
          case 'date':
            if (typeof value !== 'string' || isNaN(Date.parse(value))) {
              res.status(400).json({ error: `Field "${def.displayName}" must be a valid date string` });
              return;
            }
            break;
          case 'select':
            if (def.options && Array.isArray(def.options) && !def.options.includes(value as string)) {
              res.status(400).json({ error: `Field "${def.displayName}" must be one of: ${(def.options as string[]).join(', ')}` });
              return;
            }
            break;
        }
      }

      // Check required fields
      for (const def of definitions) {
        if (def.required && values[def.fieldName] !== undefined) {
          const val = values[def.fieldName];
          if (val === null || val === '') {
            res.status(400).json({ error: `Field "${def.displayName}" is required` });
            return;
          }
        }
      }

      // Fetch current customFields, merge, and save
      if (entityType === 'contact') {
        const entity = await prisma.contact.findFirst({
          where: { id: entityId, organizationId: req.organizationId! },
          select: { customFields: true },
        });
        if (!entity) {
          res.status(404).json({ error: 'Contact not found' });
          return;
        }

        const existing = (entity.customFields as Record<string, unknown>) || {};
        const merged = { ...existing, ...values };

        await prisma.contact.update({
          where: { id: entityId },
          data: { customFields: merged as unknown as Prisma.InputJsonValue },
        });

        res.json({ values: merged });
      } else {
        const entity = await prisma.company.findFirst({
          where: { id: entityId, organizationId: req.organizationId! },
          select: { customFields: true },
        });
        if (!entity) {
          res.status(404).json({ error: 'Company not found' });
          return;
        }

        const existing = (entity.customFields as Record<string, unknown>) || {};
        const merged = { ...existing, ...values };

        await prisma.company.update({
          where: { id: entityId },
          data: { customFields: merged as unknown as Prisma.InputJsonValue },
        });

        res.json({ values: merged });
      }
    } catch (error) {
      next(error);
    }
  },
);

export default router;
