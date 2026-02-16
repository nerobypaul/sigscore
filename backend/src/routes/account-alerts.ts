import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { createNotification } from '../services/notifications';
import { logger } from '../utils/logger';
import type { Prisma } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const TRIGGER_TYPES = [
  'score_drop',
  'score_rise',
  'score_threshold',
  'engagement_drop',
  'new_hot_signal',
  'account_inactive',
] as const;

const channelsSchema = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(false),
  slack: z.boolean().default(false),
  slackChannel: z.string().max(100).default(''),
});

const conditionsSchema = z.object({
  threshold: z.number().min(0).max(100).optional(),
  dropPercent: z.number().min(1).max(100).optional(),
  risePercent: z.number().min(1).max(100).optional(),
  withinDays: z.number().min(1).max(365).optional(),
  inactiveDays: z.number().min(1).max(365).optional(),
  direction: z.enum(['above', 'below']).optional(),
  sourceTypes: z.array(z.string()).optional(),
});

const createAlertRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  triggerType: z.enum(TRIGGER_TYPES),
  conditions: conditionsSchema,
  channels: channelsSchema,
  enabled: z.boolean().default(true),
});

const updateAlertRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
  conditions: conditionsSchema.optional(),
  channels: channelsSchema.optional(),
  enabled: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/v1/account-alerts — List all alert rules for the organization
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.accountAlertRule.findMany({
      where: { organizationId: req.organizationId! },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/account-alerts — Create a new alert rule
// ---------------------------------------------------------------------------

router.post(
  '/',
  validate(createAlertRuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rule = await prisma.accountAlertRule.create({
        data: {
          organizationId: req.organizationId!,
          createdById: req.user!.id,
          name: req.body.name,
          description: req.body.description ?? null,
          triggerType: req.body.triggerType,
          conditions: req.body.conditions as unknown as Prisma.InputJsonValue,
          channels: req.body.channels as unknown as Prisma.InputJsonValue,
          enabled: req.body.enabled,
        },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      logger.info('Account alert rule created', {
        ruleId: rule.id,
        orgId: req.organizationId,
        triggerType: rule.triggerType,
      });

      res.status(201).json({ rule });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/v1/account-alerts/:id — Update an alert rule
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  validate(updateAlertRuleSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.accountAlertRule.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.organizationId!,
        },
      });

      if (!existing) {
        throw new AppError('Alert rule not found', 404);
      }

      const updateData: Record<string, unknown> = {};
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.description !== undefined) updateData.description = req.body.description;
      if (req.body.triggerType !== undefined) updateData.triggerType = req.body.triggerType;
      if (req.body.conditions !== undefined)
        updateData.conditions = req.body.conditions as unknown as Prisma.InputJsonValue;
      if (req.body.channels !== undefined)
        updateData.channels = req.body.channels as unknown as Prisma.InputJsonValue;
      if (req.body.enabled !== undefined) updateData.enabled = req.body.enabled;

      const rule = await prisma.accountAlertRule.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      logger.info('Account alert rule updated', {
        ruleId: rule.id,
        orgId: req.organizationId,
      });

      res.json({ rule });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/account-alerts/:id — Delete an alert rule
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.accountAlertRule.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organizationId!,
      },
    });

    if (!existing) {
      throw new AppError('Alert rule not found', 404);
    }

    await prisma.accountAlertRule.delete({
      where: { id: req.params.id },
    });

    logger.info('Account alert rule deleted', {
      ruleId: req.params.id,
      orgId: req.organizationId,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/account-alerts/:id/test — Test an alert rule (simulate trigger)
// ---------------------------------------------------------------------------

router.post('/:id/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rule = await prisma.accountAlertRule.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organizationId!,
      },
    });

    if (!rule) {
      throw new AppError('Alert rule not found', 404);
    }

    const channels = rule.channels as { inApp?: boolean; email?: boolean; slack?: boolean };

    // Simulate: create in-app notification if inApp channel is enabled
    if (channels.inApp) {
      await createNotification({
        organizationId: req.organizationId!,
        userId: req.user!.id,
        type: 'account_alert_test',
        title: `[TEST] Alert rule "${rule.name}" triggered`,
        body: `This is a test notification for the "${rule.triggerType}" alert rule. No actual event occurred.`,
        entityType: 'account_alert_rule',
        entityId: rule.id,
      });
    }

    logger.info('Account alert rule tested', {
      ruleId: rule.id,
      orgId: req.organizationId,
    });

    res.json({
      success: true,
      message: 'Test alert sent',
      channels: {
        inApp: channels.inApp ?? false,
        email: channels.email ?? false,
        slack: channels.slack ?? false,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/account-alerts/history — Recent alert firings (via notifications)
// ---------------------------------------------------------------------------

router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const cursor = req.query.cursor as string | undefined;

    const where: Prisma.NotificationWhereInput = {
      organizationId: req.organizationId!,
      type: { startsWith: 'account_alert' },
    };

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
    });

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({
      history: items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
