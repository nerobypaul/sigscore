import { Request, Response, NextFunction } from 'express';
import * as signalService from '../services/signals';
import * as accountScoreService from '../services/account-scores';
import * as webhookService from '../services/webhooks';
import { logger } from '../utils/logger';

export const ingestSignal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const signal = await signalService.ingestSignal(organizationId, req.body);
    logger.info(`Signal ingested: ${signal.id} (${signal.type})`);

    // Fire webhook asynchronously (don't block response)
    webhookService.dispatchWebhookEvent(organizationId, 'signal.received', {
      signalId: signal.id,
      type: signal.type,
      accountId: signal.accountId,
      actorId: signal.actorId,
    }).catch((err) => logger.error('Webhook dispatch error:', err));

    // Recompute score if signal matched to an account
    if (signal.accountId) {
      accountScoreService
        .computeAccountScore(organizationId, signal.accountId)
        .catch((err) => logger.error('Score recompute error:', err));
    }

    res.status(201).json(signal);
  } catch (error) {
    next(error);
  }
};

export const ingestSignalBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const { signals } = req.body;
    if (!Array.isArray(signals)) {
      res.status(400).json({ error: 'signals must be an array' });
      return;
    }

    const results = await signalService.ingestSignalBatch(organizationId, signals);
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(`Batch signal ingest: ${succeeded} succeeded, ${failed} failed`);

    res.status(201).json({
      results,
      summary: { total: results.length, succeeded, failed },
    });
  } catch (error) {
    next(error);
  }
};

export const getSignals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const filters = {
      type: req.query.type as string,
      sourceId: req.query.sourceId as string,
      accountId: req.query.accountId as string,
      actorId: req.query.actorId as string,
      from: req.query.from as string,
      to: req.query.to as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await signalService.getSignals(organizationId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getAccountSignals = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const signals = await signalService.getSignalsByAccount(organizationId, accountId, limit);
    res.json({ signals });
  } catch (error) {
    next(error);
  }
};

export const getAccountTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;

    const timeline = await signalService.getAccountTimeline(organizationId, accountId, limit);
    res.json({ timeline });
  } catch (error) {
    next(error);
  }
};

export const getAccountScore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;
    const score = await accountScoreService.getAccountScore(organizationId, accountId);

    if (!score) {
      res.status(404).json({ error: 'No score computed for this account yet' });
      return;
    }

    res.json(score);
  } catch (error) {
    next(error);
  }
};

export const computeAccountScore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;
    const score = await accountScoreService.computeAccountScore(organizationId, accountId);

    logger.info(`PQA score computed for account ${accountId}: ${score.score} (${score.tier})`);
    res.json(score);
  } catch (error) {
    next(error);
  }
};

export const getTopAccounts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const tier = req.query.tier as string | undefined;

    const accounts = await accountScoreService.getTopAccounts(
      organizationId,
      limit,
      tier as any
    );

    res.json({ accounts });
  } catch (error) {
    next(error);
  }
};
