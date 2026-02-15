import { logger } from '../utils/logger';
import { fireEvent } from './webhook-subscriptions';

/**
 * Webhook event firing functions.
 *
 * Each function is fire-and-forget: async, non-blocking, errors are logged
 * but never thrown to the caller. These are designed to be called with
 * `.catch(() => {})` or inside a try/catch that swallows the error.
 */

export const fireSignalCreated = async (
  organizationId: string,
  signal: Record<string, unknown>,
): Promise<void> => {
  try {
    await fireEvent(organizationId, 'signal.created', signal);
  } catch (err) {
    logger.error('fireSignalCreated webhook event failed', { organizationId, err });
  }
};

export const fireContactCreated = async (
  organizationId: string,
  contact: Record<string, unknown>,
): Promise<void> => {
  try {
    await fireEvent(organizationId, 'contact.created', contact);
  } catch (err) {
    logger.error('fireContactCreated webhook event failed', { organizationId, err });
  }
};

export const fireContactUpdated = async (
  organizationId: string,
  contact: Record<string, unknown>,
): Promise<void> => {
  try {
    await fireEvent(organizationId, 'contact.updated', contact);
  } catch (err) {
    logger.error('fireContactUpdated webhook event failed', { organizationId, err });
  }
};

export const fireCompanyCreated = async (
  organizationId: string,
  company: Record<string, unknown>,
): Promise<void> => {
  try {
    await fireEvent(organizationId, 'company.created', company);
  } catch (err) {
    logger.error('fireCompanyCreated webhook event failed', { organizationId, err });
  }
};

export const fireDealCreated = async (
  organizationId: string,
  deal: Record<string, unknown>,
): Promise<void> => {
  try {
    await fireEvent(organizationId, 'deal.created', deal);
  } catch (err) {
    logger.error('fireDealCreated webhook event failed', { organizationId, err });
  }
};

export const fireDealStageChanged = async (
  organizationId: string,
  deal: Record<string, unknown>,
  previousStage: string,
): Promise<void> => {
  try {
    await fireEvent(organizationId, 'deal.stage_changed', {
      ...deal,
      previousStage,
    });
  } catch (err) {
    logger.error('fireDealStageChanged webhook event failed', { organizationId, err });
  }
};

export const fireScoreChanged = async (
  organizationId: string,
  accountId: string,
  oldScore: number | null,
  newScore: number,
  oldTier: string | null,
  newTier: string,
): Promise<void> => {
  try {
    // Always fire score.changed
    await fireEvent(organizationId, 'score.changed', {
      accountId,
      oldScore,
      newScore,
      oldTier,
      newTier,
    });

    // Also fire tier.changed if tier actually differs
    if (oldTier && oldTier !== newTier) {
      await fireEvent(organizationId, 'tier.changed', {
        accountId,
        oldScore,
        newScore,
        oldTier,
        newTier,
      });
    }
  } catch (err) {
    logger.error('fireScoreChanged webhook event failed', { organizationId, err });
  }
};
