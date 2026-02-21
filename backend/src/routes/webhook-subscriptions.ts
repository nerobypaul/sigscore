import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { apiKeyAuth } from '../middleware/api-key-auth';
import { validate } from '../middleware/validate';
import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  getSubscription,
  toggleSubscription,
  updateSubscription,
  sendTestWebhook,
  getSubscriptionDeliveries,
  getSubscriptionWithDeliveryStats,
  WEBHOOK_EVENT_TYPES,
} from '../services/webhook-subscriptions';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Auth: Support both API key (Zapier) and JWT (UI) authentication.
// apiKeyAuth runs first — if an API key is found and valid, it sets
// req.organizationId and skips JWT auth. Otherwise, falls through to
// authenticate + requireOrganization.
// ---------------------------------------------------------------------------

const flexAuth = [
  apiKeyAuth,
  (req: Request, res: Response, next: NextFunction): void => {
    // If already authenticated via API key, skip JWT auth
    if (req.apiKeyAuth && req.organizationId) {
      next();
      return;
    }
    authenticate(req, res, next);
  },
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.apiKeyAuth && req.organizationId) {
      next();
      return;
    }
    requireOrganization(req, res, next);
  },
];

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const webhookFiltersSchema = z.object({
  scoreAbove: z.number().optional(),
  scoreBelow: z.number().optional(),
  tiers: z.array(z.string()).optional(),
  signalTypes: z.array(z.string()).optional(),
  accountIds: z.array(z.string()).optional(),
}).optional();

const createSubscriptionSchema = z.object({
  targetUrl: z.string().url('targetUrl must be a valid URL'),
  event: z.enum(WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]], {
    errorMap: () => ({
      message: `event must be one of: ${WEBHOOK_EVENT_TYPES.join(', ')}`,
    }),
  }),
  hookId: z.string().optional(),
  filters: webhookFiltersSchema,
  payloadTemplate: z.record(z.unknown()).optional(),
});

const updateSubscriptionSchema = z.object({
  targetUrl: z.string().url('targetUrl must be a valid URL').optional(),
  event: z.enum(WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]], {
    errorMap: () => ({
      message: `event must be one of: ${WEBHOOK_EVENT_TYPES.join(', ')}`,
    }),
  }).optional(),
  active: z.boolean().optional(),
  filters: webhookFiltersSchema.nullable(),
  payloadTemplate: z.record(z.unknown()).nullable().optional(),
});

const toggleActiveSchema = z.object({
  active: z.boolean(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /webhooks/subscribe — list all subscriptions for the org
 */
router.get('/', ...flexAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const subscriptions = await listSubscriptions(organizationId);
    res.json({ subscriptions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /webhooks/subscribe/events — list supported event types
 */
router.get('/events', (_req: Request, res: Response): void => {
  res.json({ events: WEBHOOK_EVENT_TYPES });
});

/**
 * GET /webhooks/subscribe/:id — get a single subscription
 */
router.get('/:id', ...flexAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const subscription = await getSubscription(organizationId, req.params.id);
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /webhooks/subscribe — create a new subscription (Zapier REST Hook pattern)
 * Supports optional filters and payloadTemplate for conditional dispatch.
 */
router.post('/', ...flexAuth, validate(createSubscriptionSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const subscription = await createSubscription(organizationId, req.body);
    logger.info(`Webhook subscription created: ${subscription.id} -> ${subscription.targetUrl} [${subscription.event}]`);
    res.status(201).json(subscription);
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /webhooks/subscribe/:id — update subscription (URL, event, filters, payloadTemplate)
 */
router.put('/:id', ...flexAuth, validate(updateSubscriptionSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { active, ...updateData } = req.body;

    // Handle active toggle alongside other updates
    if (active !== undefined) {
      await toggleSubscription(organizationId, req.params.id, active);
    }

    const subscription = await updateSubscription(organizationId, req.params.id, updateData);
    logger.info(`Webhook subscription updated: ${subscription.id}`);
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /webhooks/subscribe/:id — toggle active status
 */
router.patch('/:id', ...flexAuth, validate(toggleActiveSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const subscription = await toggleSubscription(organizationId, req.params.id, req.body.active);
    logger.info(`Webhook subscription ${subscription.active ? 'activated' : 'deactivated'}: ${subscription.id}`);
    res.json(subscription);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /webhooks/subscribe/:id — remove a subscription
 */
router.delete('/:id', ...flexAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    await deleteSubscription(organizationId, req.params.id);
    logger.info(`Webhook subscription deleted: ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /webhooks/subscribe/:id/status — get subscription with delivery stats and failure rate
 */
router.get('/:id/status', ...flexAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const result = await getSubscriptionWithDeliveryStats(organizationId, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /webhooks/subscribe/:id/deliveries — list recent delivery attempts
 */
router.get('/:id/deliveries', ...flexAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const deliveries = await getSubscriptionDeliveries(organizationId, req.params.id, limit);
    res.json({ deliveries });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /webhooks/subscribe/:id/test — send a test payload synchronously
 * Records the delivery in WebhookSubscriptionDelivery and returns full result.
 */
router.post('/:id/test', ...flexAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const result = await sendTestWebhook(req.params.id, organizationId);

    logger.info(`Webhook test delivery: ${result.success ? 'OK' : 'FAILED'} (${result.duration}ms)`, {
      subscriptionId: req.params.id,
      statusCode: result.statusCode,
      duration: result.duration,
    });

    res.json({
      success: result.success,
      statusCode: result.statusCode,
      response: result.response,
      duration: result.duration,
      payload: result.payload,
      headers: result.headers,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
