import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { webhookDeliveryQueue } from '../jobs/queue';

// ---------------------------------------------------------------------------
// Supported event types
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENT_TYPES = [
  'signal.created',
  'contact.created',
  'contact.updated',
  'company.created',
  'deal.created',
  'deal.stage_changed',
  'score.changed',
  'tier.changed',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  targetUrl: string;
  event: string;
  hookId?: string;
}

export const createSubscription = async (
  organizationId: string,
  data: CreateSubscriptionInput,
) => {
  if (!WEBHOOK_EVENT_TYPES.includes(data.event as WebhookEventType)) {
    throw new AppError(`Unsupported event type: ${data.event}. Supported: ${WEBHOOK_EVENT_TYPES.join(', ')}`, 400);
  }

  const secret = crypto.randomBytes(32).toString('hex');

  return prisma.webhookSubscription.create({
    data: {
      organization: { connect: { id: organizationId } },
      targetUrl: data.targetUrl,
      event: data.event,
      hookId: data.hookId || null,
      secret,
    },
  });
};

export const deleteSubscription = async (
  organizationId: string,
  subscriptionId: string,
) => {
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });

  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  return prisma.webhookSubscription.delete({ where: { id: subscriptionId } });
};

export const listSubscriptions = async (organizationId: string) => {
  return prisma.webhookSubscription.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
  });
};

export const getSubscription = async (
  organizationId: string,
  id: string,
) => {
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id, organizationId },
  });

  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  return subscription;
};

export const toggleSubscription = async (
  organizationId: string,
  id: string,
  active: boolean,
) => {
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id, organizationId },
  });

  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  return prisma.webhookSubscription.update({
    where: { id },
    data: { active },
  });
};

// ---------------------------------------------------------------------------
// Event firing
// ---------------------------------------------------------------------------

/**
 * Delivers a webhook event payload to all active subscribers of that event type.
 * Each delivery is enqueued as a separate BullMQ job per subscription for
 * independent retry with exponential backoff (30s, 60s, 120s, 240s, 480s).
 */
export const fireEvent = async (
  organizationId: string,
  event: string,
  payload: Record<string, unknown>,
) => {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: {
      organizationId,
      event,
      active: true,
    },
  });

  if (subscriptions.length === 0) return;

  const envelope = {
    event,
    timestamp: new Date().toISOString(),
    organizationId,
    data: payload,
  };

  const enqueuePromises = subscriptions.map(async (sub) => {
    try {
      await webhookDeliveryQueue.add(
        'deliver-subscription-webhook',
        {
          organizationId,
          event,
          payload: envelope,
          subscriptionId: sub.id,
          targetUrl: sub.targetUrl,
          secret: sub.secret,
        },
      );
    } catch (err) {
      logger.error('Failed to enqueue webhook subscription delivery', {
        subscriptionId: sub.id,
        event,
        error: err,
      });
    }
  });

  await Promise.allSettled(enqueuePromises);
};

// ---------------------------------------------------------------------------
// Direct delivery (used for test endpoint and subscription delivery worker)
// ---------------------------------------------------------------------------

/**
 * Immediately delivers a payload to a specific subscription URL.
 * Returns the delivery result for logging.
 */
export const deliverToSubscription = async (
  targetUrl: string,
  secret: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; statusCode?: number; error?: string }> => {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DevSignal-Signature': `sha256=${signature}`,
        'X-DevSignal-Event': event,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    return { success: response.ok, statusCode: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
};

// ---------------------------------------------------------------------------
// Delivery log queries
// ---------------------------------------------------------------------------

/**
 * Returns recent delivery attempts for a subscription, most recent first.
 */
export const getSubscriptionDeliveries = async (
  organizationId: string,
  subscriptionId: string,
  limit = 20,
) => {
  // Verify ownership
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });
  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  return prisma.webhookSubscriptionDelivery.findMany({
    where: { subscriptionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
};

/**
 * Returns a subscription with delivery stats (total, succeeded, failed, failure rate)
 * computed over the last 7 days.
 */
export const getSubscriptionWithDeliveryStats = async (
  organizationId: string,
  subscriptionId: string,
) => {
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });
  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const deliveries = await prisma.webhookSubscriptionDelivery.findMany({
    where: {
      subscriptionId,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const total = deliveries.length;
  const succeeded = deliveries.filter((d) => d.success).length;
  const failed = total - succeeded;
  const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

  return {
    ...subscription,
    deliveryStats: {
      period: '7d',
      total,
      succeeded,
      failed,
      failureRate,
    },
    recentDeliveries: deliveries.slice(0, 10),
  };
};

// ---------------------------------------------------------------------------
// Subscription status management
// ---------------------------------------------------------------------------

/**
 * Mark a subscription as FAILING after exhausting all retry attempts.
 */
export const markSubscriptionFailing = async (subscriptionId: string) => {
  return prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: { status: 'FAILING' },
  });
};

/**
 * Clear the FAILING status back to HEALTHY after a successful delivery.
 */
export const markSubscriptionHealthy = async (subscriptionId: string) => {
  return prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: { status: 'HEALTHY' },
  });
};

/**
 * Record a delivery attempt for a subscription webhook.
 */
export const recordSubscriptionDelivery = async (data: {
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  success: boolean;
  attempt: number;
  maxAttempts: number;
  jobId?: string;
}) => {
  return prisma.webhookSubscriptionDelivery.create({
    data: {
      subscription: { connect: { id: data.subscriptionId } },
      event: data.event,
      payload: data.payload as unknown as Prisma.InputJsonValue,
      statusCode: data.statusCode,
      response: data.response,
      success: data.success,
      attempt: data.attempt,
      maxAttempts: data.maxAttempts,
      jobId: data.jobId,
    },
  });
};

// ---------------------------------------------------------------------------
// Test payload generation
// ---------------------------------------------------------------------------

const TEST_PAYLOADS: Record<string, Record<string, unknown>> = {
  'signal.created': {
    id: 'sig_test_123',
    type: 'repo_clone',
    actorId: 'contact_test_456',
    accountId: 'company_test_789',
    metadata: { repo: 'acme/sdk', action: 'clone' },
    timestamp: new Date().toISOString(),
  },
  'contact.created': {
    id: 'contact_test_456',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    companyId: 'company_test_789',
  },
  'contact.updated': {
    id: 'contact_test_456',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    title: 'Senior Engineer',
  },
  'company.created': {
    id: 'company_test_789',
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Technology',
  },
  'deal.created': {
    id: 'deal_test_101',
    title: 'Acme Corp - Pro Plan',
    amount: 9500,
    stage: 'IDENTIFIED',
    companyId: 'company_test_789',
  },
  'deal.stage_changed': {
    id: 'deal_test_101',
    title: 'Acme Corp - Pro Plan',
    amount: 9500,
    stage: 'SALES_QUALIFIED',
    previousStage: 'EXPANSION_SIGNAL',
    companyId: 'company_test_789',
  },
  'score.changed': {
    accountId: 'company_test_789',
    accountName: 'Acme Corp',
    oldScore: 45,
    newScore: 82,
    oldTier: 'WARM',
    newTier: 'HOT',
  },
  'tier.changed': {
    accountId: 'company_test_789',
    accountName: 'Acme Corp',
    oldScore: 45,
    newScore: 82,
    oldTier: 'WARM',
    newTier: 'HOT',
  },
};

export const getTestPayload = (event: string): Record<string, unknown> => {
  return TEST_PAYLOADS[event] || { message: 'Test event', event };
};
