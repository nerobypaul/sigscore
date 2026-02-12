import { Request, Response, NextFunction } from 'express';
import * as organizationService from '../services/organizations';
import { logger } from '../utils/logger';

export const createOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const org = await organizationService.createOrganization(userId, req.body);
    logger.info(`Organization created: ${org.id}`);
    res.status(201).json(org);
  } catch (error) {
    next(error);
  }
};

export const getOrganizations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const organizations = await organizationService.getOrganizations(userId);
    res.json({ organizations });
  } catch (error) {
    next(error);
  }
};

export const getOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const org = await organizationService.getOrganization(userId, id);
    res.json(org);
  } catch (error) {
    next(error);
  }
};

export const updateOrganization = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const org = await organizationService.updateOrganization(userId, id, req.body);
    logger.info(`Organization updated: ${org.id}`);
    res.json(org);
  } catch (error) {
    next(error);
  }
};
