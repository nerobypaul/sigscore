import { Request, Response, NextFunction } from 'express';
import { ScoreTier } from '@prisma/client';
import * as signalService from '../services/signals';
import * as accountScoreService from '../services/account-scores';
import { enqueueWebhookDelivery, enqueueWorkflowExecution } from '../jobs/producers';
import { notifyHighValueSignal } from '../services/slack-notifications';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';

export const ingestSignal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const signal = await signalService.ingestSignal(organizationId, req.body);

    // If deduplicated, return the existing signal with 200 instead of 201
    if ('deduplicated' in signal && signal.deduplicated) {
      logger.info(`Signal deduplicated: ${signal.id} (${signal.type})`);
      res.status(200).json(signal);
      return;
    }

    logger.info(`Signal ingested: ${signal.id} (${signal.type})`);

    // Enqueue webhook delivery via BullMQ (reliable retry)
    enqueueWebhookDelivery(organizationId, 'signal.received', {
      signalId: signal.id,
      type: signal.type,
      accountId: signal.accountId,
      actorId: signal.actorId,
    }).catch((err) => logger.error('Webhook enqueue error:', err));

    // Recompute score if signal matched to an account
    if (signal.accountId) {
      accountScoreService
        .computeAccountScore(organizationId, signal.accountId)
        .catch((err) => logger.error('Score recompute error:', err));
    }

    // Enqueue workflow processing via BullMQ (async with retries)
    enqueueWorkflowExecution(organizationId, 'signal_received', {
      signalId: signal.id,
      type: signal.type,
      accountId: signal.accountId,
      actorId: signal.actorId,
      metadata: req.body.metadata || {},
    }).catch((err) => logger.error('Workflow enqueue error:', err));

    // Notify Slack for high-value signals (fire-and-forget)
    const actorName = signal.actor
      ? `${signal.actor.firstName} ${signal.actor.lastName}`.trim()
      : null;
    notifyHighValueSignal(
      organizationId,
      signal.type,
      signal.account?.name || null,
      actorName,
      req.body.metadata || {},
    ).catch((err) => logger.error('Slack signal notification error:', err));

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
      sourceType: req.query.sourceType as string,
      accountId: req.query.accountId as string,
      actorId: req.query.actorId as string,
      from: req.query.from as string,
      to: req.query.to as string,
      search: req.query.search as string,
      page: parsePageInt(req.query.page),
      limit: parsePageInt(req.query.limit),
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
    const limit = parsePageInt(req.query.limit) ?? 50;

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
    const limit = parsePageInt(req.query.limit) ?? 100;

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

    const limit = parsePageInt(req.query.limit) ?? 20;
    const tierParam = req.query.tier as string | undefined;
    const validTiers: ScoreTier[] = ['HOT', 'WARM', 'COLD', 'INACTIVE'];
    const tier = tierParam && validTiers.includes(tierParam as ScoreTier)
      ? (tierParam as ScoreTier)
      : undefined;

    const accounts = await accountScoreService.getTopAccounts(
      organizationId,
      limit,
      tier
    );

    res.json({ accounts });
  } catch (error) {
    next(error);
  }
};

export const getDeduplicationStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const stats = await signalService.getDeduplicationStats(organizationId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
};
