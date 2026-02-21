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
// Filter & payload template types
// ---------------------------------------------------------------------------

export interface WebhookFilters {
  scoreAbove?: number;
  scoreBelow?: number;
  tiers?: string[];
  signalTypes?: string[];
  accountIds?: string[];
}

/**
 * Payload template is a JSON object where values can contain
 * {{variable}} placeholders that are resolved against the event data.
 */
export type PayloadTemplate = Record<string, unknown>;

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

export interface CreateSubscriptionInput {
  targetUrl: string;
  event: string;
  hookId?: string;
  filters?: WebhookFilters;
  payloadTemplate?: PayloadTemplate;
}

export interface UpdateSubscriptionInput {
  targetUrl?: string;
  event?: string;
  filters?: WebhookFilters | null;
  payloadTemplate?: PayloadTemplate | null;
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
      filters: data.filters
        ? (data.filters as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      payloadTemplate: data.payloadTemplate
        ? (data.payloadTemplate as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });
};

export const updateSubscription = async (
  organizationId: string,
  subscriptionId: string,
  data: UpdateSubscriptionInput,
) => {
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });

  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  if (data.event && !WEBHOOK_EVENT_TYPES.includes(data.event as WebhookEventType)) {
    throw new AppError(`Unsupported event type: ${data.event}. Supported: ${WEBHOOK_EVENT_TYPES.join(', ')}`, 400);
  }

  const updateData: Prisma.WebhookSubscriptionUpdateInput = {};

  if (data.targetUrl !== undefined) {
    updateData.targetUrl = data.targetUrl;
  }
  if (data.event !== undefined) {
    updateData.event = data.event;
  }
  if (data.filters !== undefined) {
    updateData.filters = data.filters
      ? (data.filters as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  }
  if (data.payloadTemplate !== undefined) {
    updateData.payloadTemplate = data.payloadTemplate
      ? (data.payloadTemplate as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;
  }

  return prisma.webhookSubscription.update({
    where: { id: subscriptionId },
    data: updateData,
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
// Filter evaluation
// ---------------------------------------------------------------------------

/**
 * Resolves a dot-notation path against a nested object.
 * e.g. resolveNestedValue({ account: { name: 'Acme' } }, 'account.name') => 'Acme'
 */
const resolveNestedValue = (
  data: Record<string, unknown>,
  path: string,
): unknown => {
  const segments = path.split('.');
  let current: unknown = data;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

/**
 * Parses a subscription's filters JSON into a typed WebhookFilters object.
 * Returns null if the subscription has no filters configured.
 */
const parseFilters = (filtersJson: Prisma.JsonValue | null): WebhookFilters | null => {
  if (!filtersJson || filtersJson === null || typeof filtersJson !== 'object' || Array.isArray(filtersJson)) {
    return null;
  }
  const raw = filtersJson as Record<string, unknown>;

  // Only return non-empty filters
  const filters: WebhookFilters = {};
  let hasFilter = false;

  if (typeof raw.scoreAbove === 'number') {
    filters.scoreAbove = raw.scoreAbove;
    hasFilter = true;
  }
  if (typeof raw.scoreBelow === 'number') {
    filters.scoreBelow = raw.scoreBelow;
    hasFilter = true;
  }
  if (Array.isArray(raw.tiers) && raw.tiers.length > 0) {
    filters.tiers = raw.tiers.filter((t): t is string => typeof t === 'string');
    if (filters.tiers.length > 0) hasFilter = true;
  }
  if (Array.isArray(raw.signalTypes) && raw.signalTypes.length > 0) {
    filters.signalTypes = raw.signalTypes.filter((t): t is string => typeof t === 'string');
    if (filters.signalTypes.length > 0) hasFilter = true;
  }
  if (Array.isArray(raw.accountIds) && raw.accountIds.length > 0) {
    filters.accountIds = raw.accountIds.filter((t): t is string => typeof t === 'string');
    if (filters.accountIds.length > 0) hasFilter = true;
  }

  return hasFilter ? filters : null;
};

/**
 * Evaluates all filter conditions against an event payload (AND logic).
 * Returns true if the event should be dispatched to the subscriber.
 * If no filters are set, always returns true (backward compatible).
 */
export const evaluateFilters = (
  filters: WebhookFilters | null,
  payload: Record<string, unknown>,
): boolean => {
  if (!filters) return true;

  // Score thresholds: check payload.score, payload.newScore, or payload.data.newScore
  const score =
    (typeof payload.score === 'number' ? payload.score : undefined) ??
    (typeof payload.newScore === 'number' ? payload.newScore : undefined) ??
    (typeof (payload.data as Record<string, unknown> | undefined)?.newScore === 'number'
      ? (payload.data as Record<string, unknown>).newScore as number
      : undefined) ??
    (typeof (payload.data as Record<string, unknown> | undefined)?.score === 'number'
      ? (payload.data as Record<string, unknown>).score as number
      : undefined);

  if (filters.scoreAbove !== undefined) {
    if (score === undefined || score <= filters.scoreAbove) return false;
  }
  if (filters.scoreBelow !== undefined) {
    if (score === undefined || score >= filters.scoreBelow) return false;
  }

  // Tier filter: check payload.tier, payload.newTier, or payload.data.newTier
  if (filters.tiers && filters.tiers.length > 0) {
    const tier =
      (typeof payload.tier === 'string' ? payload.tier : undefined) ??
      (typeof payload.newTier === 'string' ? payload.newTier : undefined) ??
      (typeof (payload.data as Record<string, unknown> | undefined)?.newTier === 'string'
        ? (payload.data as Record<string, unknown>).newTier as string
        : undefined) ??
      (typeof (payload.data as Record<string, unknown> | undefined)?.tier === 'string'
        ? (payload.data as Record<string, unknown>).tier as string
        : undefined);

    if (!tier || !filters.tiers.includes(tier)) return false;
  }

  // Signal type filter: check payload.type or payload.data.type
  if (filters.signalTypes && filters.signalTypes.length > 0) {
    const signalType =
      (typeof payload.type === 'string' ? payload.type : undefined) ??
      (typeof (payload.data as Record<string, unknown> | undefined)?.type === 'string'
        ? (payload.data as Record<string, unknown>).type as string
        : undefined);

    if (!signalType || !filters.signalTypes.includes(signalType)) return false;
  }

  // Account ID filter: check payload.accountId or payload.data.accountId
  if (filters.accountIds && filters.accountIds.length > 0) {
    const accountId =
      (typeof payload.accountId === 'string' ? payload.accountId : undefined) ??
      (typeof (payload.data as Record<string, unknown> | undefined)?.accountId === 'string'
        ? (payload.data as Record<string, unknown>).accountId as string
        : undefined) ??
      (typeof (payload.data as Record<string, unknown> | undefined)?.companyId === 'string'
        ? (payload.data as Record<string, unknown>).companyId as string
        : undefined);

    if (!accountId || !filters.accountIds.includes(accountId)) return false;
  }

  return true;
};

// ---------------------------------------------------------------------------
// Payload templating
// ---------------------------------------------------------------------------

/**
 * Interpolates {{variable}} placeholders in a string against event data.
 * Supports dot-notation paths: {{account.name}}, {{signal.type}}, {{score}}.
 * Unresolved placeholders are replaced with an empty string.
 */
const interpolateTemplateString = (
  template: string,
  eventData: Record<string, unknown>,
): string => {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_match, path: string) => {
    const value = resolveNestedValue(eventData, path);
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  });
};

/**
 * Recursively walks a payload template and interpolates all string values.
 * Non-string leaves, arrays, and nested objects are all handled.
 */
const interpolatePayloadTemplate = (
  template: unknown,
  eventData: Record<string, unknown>,
): unknown => {
  if (typeof template === 'string') {
    return interpolateTemplateString(template, eventData);
  }
  if (Array.isArray(template)) {
    return template.map((item) => interpolatePayloadTemplate(item, eventData));
  }
  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      result[k] = interpolatePayloadTemplate(v, eventData);
    }
    return result;
  }
  return template;
};

/**
 * Applies a payload template to event data, producing a custom-shaped payload.
 * If no template is configured, returns null so the caller uses the default envelope.
 */
export const applyPayloadTemplate = (
  templateJson: Prisma.JsonValue | null,
  eventData: Record<string, unknown>,
): Record<string, unknown> | null => {
  if (!templateJson || templateJson === null || typeof templateJson !== 'object' || Array.isArray(templateJson)) {
    return null;
  }
  return interpolatePayloadTemplate(templateJson, eventData) as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Event firing
// ---------------------------------------------------------------------------

/**
 * Delivers a webhook event payload to all active subscribers of that event type.
 * Each delivery is enqueued as a separate BullMQ job per subscription for
 * independent retry with exponential backoff (30s, 60s, 120s, 240s, 480s).
 *
 * Subscriptions with filters are evaluated before enqueuing -- only matching
 * events are dispatched. Subscriptions with a payloadTemplate get a custom
 * payload shape instead of the default envelope.
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

  const defaultEnvelope = {
    event,
    timestamp: new Date().toISOString(),
    organizationId,
    data: payload,
  };

  const enqueuePromises = subscriptions.map(async (sub) => {
    try {
      // Evaluate filters -- skip this subscription if conditions do not match
      const filters = parseFilters(sub.filters);
      if (!evaluateFilters(filters, payload)) {
        logger.debug('Webhook subscription skipped by filter', {
          subscriptionId: sub.id,
          event,
          filters,
        });
        return;
      }

      // Apply payload template if configured, otherwise use the default envelope
      const customPayload = applyPayloadTemplate(sub.payloadTemplate, {
        ...payload,
        event,
        organizationId,
        timestamp: defaultEnvelope.timestamp,
      });
      const finalPayload = customPayload ?? defaultEnvelope;

      await webhookDeliveryQueue.add(
        'deliver-subscription-webhook',
        {
          organizationId,
          event,
          payload: finalPayload,
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
        'X-Sigscore-Signature': `sha256=${signature}`,
        'X-Sigscore-Event': event,
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

// ---------------------------------------------------------------------------
// Send test webhook (synchronous, records delivery, returns timing)
// ---------------------------------------------------------------------------

export interface TestWebhookResult {
  success: boolean;
  statusCode: number | null;
  response: string | null;
  duration: number;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * Sends a test webhook to a subscription endpoint synchronously.
 * Records the delivery in WebhookSubscriptionDelivery and returns the full
 * result including status code, response body, request duration, and headers sent.
 */
export const sendTestWebhook = async (
  subscriptionId: string,
  organizationId: string,
): Promise<TestWebhookResult> => {
  const subscription = await prisma.webhookSubscription.findFirst({
    where: { id: subscriptionId, organizationId },
  });

  if (!subscription) {
    throw new AppError('Webhook subscription not found', 404);
  }

  const sampleData = getTestPayload(subscription.event);
  const envelope: Record<string, unknown> = {
    event: subscription.event,
    timestamp: new Date().toISOString(),
    organizationId,
    data: sampleData,
    _test: true,
  };

  const body = JSON.stringify(envelope);
  const signature = crypto
    .createHmac('sha256', subscription.secret)
    .update(body)
    .digest('hex');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Sigscore-Signature': `sha256=${signature}`,
    'X-Sigscore-Event': subscription.event,
  };

  let success = false;
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  const startTime = Date.now();

  try {
    const res = await fetch(subscription.targetUrl, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    statusCode = res.status;
    success = res.ok;

    try {
      responseBody = await res.text();
      // Truncate very long responses to avoid filling the DB
      if (responseBody.length > 4096) {
        responseBody = responseBody.slice(0, 4096) + '... (truncated)';
      }
    } catch {
      responseBody = '(unable to read response body)';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    responseBody = message;
    success = false;
  }

  const duration = Date.now() - startTime;

  // Record the delivery
  await recordSubscriptionDelivery({
    subscriptionId: subscription.id,
    event: subscription.event,
    payload: envelope,
    statusCode: statusCode ?? undefined,
    response: responseBody ?? undefined,
    success,
    attempt: 1,
    maxAttempts: 1,
    jobId: `test_${Date.now()}`,
  });

  return {
    success,
    statusCode,
    response: responseBody,
    duration,
    payload: envelope,
    headers,
  };
};
