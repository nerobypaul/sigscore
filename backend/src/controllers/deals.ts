import { Request, Response, NextFunction } from 'express';
import * as dealService from '../services/deals';
import { processEvent } from '../services/workflows';
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

    // Trigger workflow if stage changed (fire-and-forget)
    if (oldStage && deal.stage !== oldStage) {
      processEvent(organizationId, 'deal_stage_changed', {
        dealId: deal.id,
        oldStage,
        newStage: deal.stage,
        title: deal.title,
        amount: deal.amount,
        companyId: deal.companyId,
        contactId: deal.contactId,
      }).catch((err) => logger.error('Workflow processing error:', err));
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

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
