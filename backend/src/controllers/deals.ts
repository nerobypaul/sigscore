import { Request, Response, NextFunction } from 'express';
import * as dealService from '../services/deals';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { notifyOrgUsers } from '../services/notifications';
import { sendDealAlert } from '../services/slack-notifications';
import { logAudit } from '../services/audit';
import { fireDealCreated, fireDealStageChanged } from '../services/webhook-events';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';

export const getDeals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const filters = {
      stage: req.query.stage as string,
      ownerId: req.query.ownerId as string,
      companyId: req.query.companyId as string,
      page: parsePageInt(req.query.page),
      limit: parsePageInt(req.query.limit),
    };

    const result = await dealService.getDeals(organizationId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getDeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const deal = await dealService.getDealById(id, organizationId);
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    res.json(deal);
  } catch (error) {
    next(error);
  }
};

export const createDeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const deal = await dealService.createDeal(organizationId, req.body);
    logger.info(`Deal created: ${deal.id}`);

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'create',
      entityType: 'deal',
      entityId: deal.id,
      entityName: deal.title,
    }).catch(() => {});

    // Notify org users of new deal (fire-and-forget)
    notifyOrgUsers(organizationId, {
      type: 'deal_created',
      title: `New deal: ${deal.title}`,
      body: deal.amount ? `$${Number(deal.amount).toLocaleString()}` : undefined,
      entityType: 'deal',
      entityId: deal.id,
      excludeUserId: req.user?.id,
    }).catch((err) => logger.error('Notification error:', err));

    // Webhook event to Zapier/Make subscribers (fire-and-forget)
    fireDealCreated(organizationId, deal as unknown as Record<string, unknown>)
      .catch((err) => logger.error('Webhook fire error (deal.created):', err));

    res.status(201).json(deal);
  } catch (error) {
    next(error);
  }
};

export const updateDeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    // Capture old stage before update for workflow trigger
    const oldDeal = await dealService.getDealById(id, organizationId);
    const oldStage = oldDeal?.stage;

    const deal = await dealService.updateDeal(id, organizationId, req.body);
    logger.info(`Deal updated: ${deal.id}`);

    // Audit log (fire-and-forget)
    const dealChanges: Record<string, { from: unknown; to: unknown }> = {};
    if (oldStage && deal.stage !== oldStage) {
      dealChanges.stage = { from: oldStage, to: deal.stage };
    }
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'update',
      entityType: 'deal',
      entityId: deal.id,
      entityName: deal.title,
      changes: Object.keys(dealChanges).length > 0 ? dealChanges : undefined,
    }).catch(() => {});

    // Enqueue workflow processing via BullMQ if stage changed
    if (oldStage && deal.stage !== oldStage) {
      enqueueWorkflowExecution(organizationId, 'deal_stage_changed', {
        dealId: deal.id,
        oldStage,
        newStage: deal.stage,
        title: deal.title,
        amount: deal.amount,
        companyId: deal.companyId,
        contactId: deal.contactId,
      }).catch((err) => logger.error('Workflow enqueue error:', err));

      // Notify org users of stage change (fire-and-forget)
      notifyOrgUsers(organizationId, {
        type: 'deal_stage_changed',
        title: `Deal "${deal.title}" moved to ${deal.stage}`,
        body: deal.amount ? `$${Number(deal.amount).toLocaleString()}` : undefined,
        entityType: 'deal',
        entityId: deal.id,
        excludeUserId: req.user?.id,
      }).catch((err) => logger.error('Notification error:', err));

      // Rich Slack deal stage alert (fire-and-forget)
      sendDealAlert(organizationId, deal.id, oldStage, deal.stage)
        .catch((err) => logger.error('Slack deal alert failed', { err }));

      // Webhook event to Zapier/Make subscribers (fire-and-forget)
      fireDealStageChanged(organizationId, deal as unknown as Record<string, unknown>, oldStage)
        .catch((err) => logger.error('Webhook fire error (deal.stage_changed):', err));
    }

    res.json(deal);
  } catch (error) {
    next(error);
  }
};

export const deleteDeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    await dealService.deleteDeal(id, organizationId);
    logger.info(`Deal deleted: ${id}`);

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'delete',
      entityType: 'deal',
      entityId: id,
    }).catch(() => {});

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
