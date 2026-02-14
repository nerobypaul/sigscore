import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as savedViewsService from '../services/saved-views';
import type { Prisma } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// --- Zod Schemas ---

const createViewSchema = z.object({
  name: z.string().min(1).max(100),
  entityType: z.enum(['contact', 'company', 'deal']),
  filters: z.record(z.unknown()).default({}),
  sortField: z.string().max(50).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  isShared: z.boolean().optional(),
  icon: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
});

const updateViewSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  filters: z.record(z.unknown()).optional(),
  sortField: z.string().max(50).nullable().optional(),
  sortDirection: z.enum(['asc', 'desc']).nullable().optional(),
  isShared: z.boolean().optional(),
  icon: z.string().max(10).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

// --- Routes ---

/**
 * GET /api/v1/views?entityType=contact
 * List saved views for the user's org, optionally filtered by entity type.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const entityType = req.query.entityType as string | undefined;
    const views = await savedViewsService.listViews(
      req.organizationId!,
      req.user!.id,
      entityType
    );
    res.json({ views });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/views
 * Create a new saved view.
 */
router.post('/', validate(createViewSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const view = await savedViewsService.createView({
      organizationId: req.organizationId!,
      userId: req.user!.id,
      name: req.body.name,
      entityType: req.body.entityType,
      filters: req.body.filters as Prisma.InputJsonValue,
      sortField: req.body.sortField,
      sortDirection: req.body.sortDirection,
      isShared: req.body.isShared,
      icon: req.body.icon,
      color: req.body.color,
    });
    res.status(201).json({ view });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/views/:id
 * Update a saved view.
 */
router.put('/:id', validate(updateViewSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const view = await savedViewsService.updateView(
      req.params.id,
      req.organizationId!,
      req.user!.id,
      req.orgRole!,
      {
        name: req.body.name,
        filters: req.body.filters as Prisma.InputJsonValue | undefined,
        sortField: req.body.sortField,
        sortDirection: req.body.sortDirection,
        isShared: req.body.isShared,
        icon: req.body.icon,
        color: req.body.color,
      }
    );
    res.json({ view });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/views/:id
 * Delete a saved view.
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await savedViewsService.deleteView(
      req.params.id,
      req.organizationId!,
      req.user!.id,
      req.orgRole!
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/views/:id/default
 * Set a saved view as the default for its entity type.
 */
router.post('/:id/default', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const view = await savedViewsService.setDefault(
      req.params.id,
      req.organizationId!,
      req.user!.id
    );
    res.json({ view });
  } catch (error) {
    next(error);
  }
});

export default router;
