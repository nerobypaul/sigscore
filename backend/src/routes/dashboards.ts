import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as dashboardsService from '../services/dashboards';
import type { Prisma } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('MEMBER'));

// --- Zod Schemas ---

const createDashboardSchema = z.object({
  name: z.string().min(1).max(100).default('My Dashboard'),
  layout: z.array(z.object({
    type: z.string(),
    position: z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      w: z.number().int().min(1),
      h: z.number().int().min(1),
    }),
    config: z.record(z.unknown()).default({}),
  })).optional(),
});

const updateDashboardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  layout: z.array(z.object({
    type: z.string(),
    position: z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      w: z.number().int().min(1),
      h: z.number().int().min(1),
    }),
    config: z.record(z.unknown()).default({}),
  })).optional(),
});

// --- Routes ---

/**
 * GET /api/v1/dashboards
 * List the current user's dashboards.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboards = await dashboardsService.getDashboards(
      req.organizationId!,
      req.user!.id
    );
    res.json({ dashboards });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/dashboards
 * Create a new dashboard.
 */
router.post(
  '/',
  validate(createDashboardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dashboard = await dashboardsService.createDashboard(
        req.organizationId!,
        req.user!.id,
        req.body.name,
        req.body.layout as unknown as Prisma.InputJsonValue
      );
      res.status(201).json({ dashboard });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/dashboards/widgets/:type
 * Fetch data for a specific widget type.
 * Must be defined BEFORE /:id to avoid route conflicts.
 */
router.get(
  '/widgets/:type',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = req.query as Record<string, unknown>;
      const data = await dashboardsService.getWidgetData(
        req.organizationId!,
        req.params.type,
        config
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/dashboards/:id
 * Get a single dashboard with its layout.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await dashboardsService.getDashboard(
      req.organizationId!,
      req.params.id
    );
    res.json({ dashboard });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/dashboards/:id
 * Update a dashboard's name and/or layout.
 */
router.put(
  '/:id',
  validate(updateDashboardSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dashboard = await dashboardsService.updateDashboard(
        req.organizationId!,
        req.params.id,
        req.user!.id,
        {
          name: req.body.name,
          layout: req.body.layout as unknown as Prisma.InputJsonValue | undefined,
        }
      );
      res.json({ dashboard });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/dashboards/:id
 * Delete a dashboard.
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dashboardsService.deleteDashboard(
      req.organizationId!,
      req.params.id,
      req.user!.id
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/dashboards/:id/default
 * Set a dashboard as the user's default.
 */
router.put('/:id/default', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dashboard = await dashboardsService.setDefault(
      req.organizationId!,
      req.user!.id,
      req.params.id
    );
    res.json({ dashboard });
  } catch (error) {
    next(error);
  }
});

export default router;
