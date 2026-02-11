import { Request, Response, NextFunction } from 'express';
import * as apiKeyService from '../services/api-keys';
import { logger } from '../utils/logger';

export const createApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { name, scopes, expiresAt } = req.body;

    const result = await apiKeyService.generateApiKey(
      organizationId,
      name,
      scopes,
      expiresAt ? new Date(expiresAt) : undefined
    );

    logger.info(`API key created: ${result.apiKey.id} for org ${organizationId}`);

    res.status(201).json({
      key: result.key, // Only time the full key is returned
      apiKey: result.apiKey,
    });
  } catch (error) {
    next(error);
  }
};

export const listApiKeys = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const apiKeys = await apiKeyService.listApiKeys(organizationId);

    res.json({ apiKeys });
  } catch (error) {
    next(error);
  }
};

export const revokeApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const apiKey = await apiKeyService.revokeApiKey(organizationId, id);

    if (!apiKey) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    logger.info(`API key revoked: ${id}`);

    res.json({ apiKey });
  } catch (error) {
    next(error);
  }
};

export const deleteApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { id } = req.params;

    const result = await apiKeyService.deleteApiKey(organizationId, id);

    if (!result) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    logger.info(`API key deleted: ${id}`);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
