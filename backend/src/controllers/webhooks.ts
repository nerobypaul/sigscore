import { Request, Response, NextFunction } from 'express';
import * as webhookService from '../services/webhooks';
import { logger } from '../utils/logger';

export const getWebhooks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const webhooks = await webhookService.getWebhookEndpoints(organizationId);
    res.json({ webhooks });
  } catch (error) {
    next(error);
  }
};

export const createWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const webhook = await webhookService.createWebhookEndpoint(organizationId, req.body);
    logger.info(`Webhook created: ${webhook.id} → ${webhook.url}`);
    res.status(201).json(webhook);
  } catch (error) {
    next(error);
  }
};

export const deleteWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    await webhookService.deleteWebhookEndpoint(req.params.id, organizationId);
    logger.info(`Webhook deleted: ${req.params.id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
