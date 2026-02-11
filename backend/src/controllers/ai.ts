import { Request, Response, NextFunction } from 'express';
import * as aiEngine from '../services/ai-engine';
import { logger } from '../utils/logger';

export const generateBrief = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;

    const brief = await aiEngine.generateAccountBrief(organizationId, accountId);

    logger.info(`AI brief generated for account ${accountId}`);
    res.status(201).json(brief);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const getBrief = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;

    const result = await aiEngine.getAccountBrief(organizationId, accountId);

    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const suggestActions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;

    const result = await aiEngine.suggestNextActions(organizationId, accountId);

    logger.info(`AI actions suggested for account ${accountId}`);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const enrichContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { contactId } = req.params;

    const result = await aiEngine.enrichContactFromSignals(organizationId, contactId);

    logger.info(`AI enrichment completed for contact ${contactId}`);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ANTHROPIC_API_KEY')) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};
