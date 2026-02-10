import { Request, Response, NextFunction } from 'express';
import * as dealService from '../services/deals';
import { logger } from '../utils/logger';

export const getDeals = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const filters = {
      stage: req.query.stage as string,
      ownerId: req.query.ownerId as string,
      companyId: req.query.companyId as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await dealService.getDeals(organizationId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getDeal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const deal = await dealService.getDealById(id, organizationId);
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(deal);
  } catch (error) {
    next(error);
  }
};

export const createDeal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const deal = await dealService.createDeal(organizationId, req.body);
    logger.info(`Deal created: ${deal.id}`);

    res.status(201).json(deal);
  } catch (error) {
    next(error);
  }
};

export const updateDeal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const deal = await dealService.updateDeal(id, organizationId, req.body);
    logger.info(`Deal updated: ${deal.id}`);

    res.json(deal);
  } catch (error) {
    next(error);
  }
};

export const deleteDeal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    await dealService.deleteDeal(id, organizationId);
    logger.info(`Deal deleted: ${id}`);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
