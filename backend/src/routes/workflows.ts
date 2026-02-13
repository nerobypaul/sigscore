import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';
import * as workflowService from '../services/workflows';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  trigger: z.object({
    event: z.enum(['signal_received', 'contact_created', 'deal_stage_changed', 'score_changed']),
    filters: z.record(z.unknown()).optional(),
  }),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
        value: z.unknown(),
      }),
    )
    .optional(),
  actions: z
    .array(
      z.object({
        type: z.enum([
          'create_deal',
          'update_deal_stage',
          'send_webhook',
          'send_slack',
          'add_tag',
          'log',
        ]),
        params: z.record(z.unknown()),
      }),
    )
    .min(1),
  enabled: z.boolean().optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  trigger: z
    .object({
      event: z.enum(['signal_received', 'contact_created', 'deal_stage_changed', 'score_changed']),
      filters: z.record(z.unknown()).optional(),
    })
    .optional(),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in']),
        value: z.unknown(),
      }),
    )
    .optional(),
  actions: z
    .array(
      z.object({
        type: z.enum([
          'create_deal',
          'update_deal_stage',
          'send_webhook',
          'send_slack',
          'add_tag',
          'log',
        ]),
        params: z.record(z.unknown()),
      }),
    )
    .min(1)
    .optional(),
  enabled: z.boolean().optional(),
});

const processEventSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.unknown()),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST / - Create a new workflow
 */
router.post(
  '/',
  validate(createWorkflowSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const workflow = await workflowService.createWorkflow(organizationId, req.body);
      logger.info(`Workflow created: ${workflow.id}`);
      res.status(201).json(workflow);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET / - List workflows
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const enabledParam = req.query.enabled;
    const enabled =
      enabledParam === 'true' ? true : enabledParam === 'false' ? false : undefined;

    const result = await workflowService.listWorkflows(organizationId, {
      enabled,
      page: parsePageInt(req.query.page),
      limit: parsePageInt(req.query.limit),
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:id - Get a single workflow with recent runs
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const workflow = await workflowService.getWorkflow(req.params.id, organizationId);
    res.json(workflow);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /:id - Update a workflow
 */
router.put(
  '/:id',
  validate(updateWorkflowSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const workflow = await workflowService.updateWorkflow(
        req.params.id,
        organizationId,
        req.body,
      );
      logger.info(`Workflow updated: ${workflow.id}`);
      res.json(workflow);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /:id - Delete a workflow
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    await workflowService.deleteWorkflow(req.params.id, organizationId);
    logger.info(`Workflow deleted: ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:id/runs - Get workflow runs
 */
router.get(
  '/:id/runs',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const limit = parsePageInt(req.query.limit);
      const result = await workflowService.getWorkflowRuns(req.params.id, organizationId, {
        limit,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /process-event - Manually trigger event processing (for testing)
 */
router.post(
  '/process-event',
  validate(processEventSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { event, data } = req.body as { event: string; data: Record<string, unknown> };
      await workflowService.processEvent(organizationId, event, data);
      res.json({ ok: true, event });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
