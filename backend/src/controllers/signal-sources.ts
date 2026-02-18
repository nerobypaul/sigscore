import { Request, Response, NextFunction } from 'express';
import * as signalSourceService from '../services/signal-sources';
import { logger } from '../utils/logger';

export const getSignalSources = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const sources = await signalSourceService.getSignalSources(organizationId);
    res.json({ sources });
  } catch (error) {
    next(error);
  }
};

export const getSignalSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const source = await signalSourceService.getSignalSourceById(req.params.id, organizationId);
    if (!source) {
      res.status(404).json({ error: 'Signal source not found' });
      return;
    }
    res.json(source);
  } catch (error) {
    next(error);
  }
};

export const createSignalSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const source = await signalSourceService.createSignalSource(organizationId, req.body);
    logger.info(`Signal source created: ${source.id} (${source.type})`);
    res.status(201).json(source);
  } catch (error) {
    next(error);
  }
};

export const updateSignalSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const source = await signalSourceService.updateSignalSource(req.params.id, organizationId, req.body);
    logger.info(`Signal source updated: ${source.id}`);
    res.json(source);
  } catch (error) {
    next(error);
  }
};

export const deleteSignalSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    await signalSourceService.deleteSignalSource(req.params.id, organizationId);
    logger.info(`Signal source deleted: ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const testSignalSource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const result = await signalSourceService.testSignalSource(req.params.id, organizationId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getCatalog = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const catalog = signalSourceService.getIntegrationCatalog();
    res.json({ integrations: catalog });
  } catch (error) {
    next(error);
  }
};

export const getSyncHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const history = await signalSourceService.getSyncHistory(req.params.id, organizationId);
    res.json({ history });
  } catch (error) {
    next(error);
  }
};
