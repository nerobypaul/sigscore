import { Job } from 'bullmq';
import { logger } from '../utils/logger';
import {
  signalProcessingQueue,
  scoreComputationQueue,
  webhookDeliveryQueue,
  enrichmentQueue,
  SignalProcessingJobData,
  ScoreComputationJobData,
  WebhookDeliveryJobData,
  EnrichmentJobData,
} from './queue';

// ---------------------------------------------------------------------------
// Signal Processing
// ---------------------------------------------------------------------------

/**
 * Enqueue a raw signal for processing (identity resolution + account matching).
 */
export const enqueueSignalProcessing = async (
  organizationId: string,
  signalData: SignalProcessingJobData['signalData'],
): Promise<Job<SignalProcessingJobData>> => {
  const job = await signalProcessingQueue.add(
    'process-signal',
    { organizationId, signalData },
    {
      // Use idempotency key when available to prevent duplicate processing
      ...(signalData.idempotencyKey && {
        jobId: `sig-${organizationId}-${signalData.idempotencyKey}`,
      }),
    },
  );
  logger.debug('Enqueued signal processing', { jobId: job.id, organizationId, type: signalData.type });
  return job;
};

// ---------------------------------------------------------------------------
// Score Computation
// ---------------------------------------------------------------------------

/**
 * Enqueue an account score recomputation.
 * Uses accountId-based deduplication so rapid-fire requests for the same
 * account collapse into a single job.
 */
export const enqueueScoreComputation = async (
  organizationId: string,
  accountId: string,
): Promise<Job<ScoreComputationJobData>> => {
  const job = await scoreComputationQueue.add(
    'compute-score',
    { organizationId, accountId },
    {
      // Deduplication: only one pending job per account at a time
      jobId: `score-${accountId}`,
    },
  );
  logger.debug('Enqueued score computation', { jobId: job.id, organizationId, accountId });
  return job;
};

// ---------------------------------------------------------------------------
// Webhook Delivery
// ---------------------------------------------------------------------------

/**
 * Enqueue a webhook event for delivery to all matching endpoints.
 */
export const enqueueWebhookDelivery = async (
  organizationId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<Job<WebhookDeliveryJobData>> => {
  const job = await webhookDeliveryQueue.add(
    'deliver-webhook',
    { organizationId, event, payload },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  );
  logger.debug('Enqueued webhook delivery', { jobId: job.id, organizationId, event });
  return job;
};

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

/**
 * Enqueue a contact enrichment job.
 */
export const enqueueEnrichment = async (
  organizationId: string,
  contactId: string,
): Promise<Job<EnrichmentJobData>> => {
  const job = await enrichmentQueue.add(
    'enrich-contact',
    { organizationId, contactId },
    {
      // Deduplication by contact to avoid redundant enrichment calls
      jobId: `enrich-${contactId}`,
    },
  );
  logger.debug('Enqueued enrichment', { jobId: job.id, organizationId, contactId });
  return job;
};
