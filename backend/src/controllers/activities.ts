import { Request, Response, NextFunction } from 'express';
import * as activityService from '../services/activities';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';

export const getActivities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const filters = {
      type: req.query.type as string,
      status: req.query.status as string,
      userId: req.query.userId as string,
      contactId: req.query.contactId as string,
      companyId: req.query.companyId as string,
      dealId: req.query.dealId as string,
      page: parsePageInt(req.query.page),
      limit: parsePageInt(req.query.limit),
    };

    const result = await activityService.getActivities(organizationId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const activity = await activityService.getActivityById(id, organizationId);
    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    res.json(activity);
  } catch (error) {
    next(error);
  }
};

export const createActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;

    const activity = await activityService.createActivity(organizationId, userId, req.body);
    logger.info(`Activity created: ${activity.id}`);

    res.status(201).json(activity);
  } catch (error) {
    next(error);
  }
};

export const updateActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const activity = await activityService.updateActivity(id, organizationId, req.body);
    logger.info(`Activity updated: ${activity.id}`);

    res.json(activity);
  } catch (error) {
    next(error);
  }
};

export const deleteActivity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    await activityService.deleteActivity(id, organizationId);
    logger.info(`Activity deleted: ${id}`);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
