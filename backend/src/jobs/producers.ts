import { Job } from 'bullmq';
import { logger } from '../utils/logger';
import {
  signalProcessingQueue,
  scoreComputationQueue,
  webhookDeliveryQueue,
  enrichmentQueue,
  signalSyncQueue,
  workflowExecutionQueue,
  emailSendQueue,
  hubspotSyncQueue,
  SignalProcessingJobData,
  ScoreComputationJobData,
  WebhookDeliveryJobData,
  EnrichmentJobData,
  SignalSyncJobData,
  WorkflowExecutionJobData,
  EmailSendJobData,
  HubSpotSyncJobData,
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

// ---------------------------------------------------------------------------
// Signal Sync
// ---------------------------------------------------------------------------

/**
 * Enqueue a sync job for a specific npm or pypi source.
 */
export const enqueueSignalSync = async (
  type: 'npm' | 'pypi',
  sourceId: string,
  organizationId: string,
): Promise<Job<SignalSyncJobData>> => {
  const job = await signalSyncQueue.add(
    `sync-${type}-source`,
    { sourceId, organizationId, type },
  );
  logger.debug('Enqueued signal sync', { jobId: job.id, type, sourceId, organizationId });
  return job;
};

/**
 * Enqueue a sync-all job for all sources of the given type.
 */
export const enqueueSignalSyncAll = async (
  type: 'npm' | 'pypi',
): Promise<Job<SignalSyncJobData>> => {
  const job = await signalSyncQueue.add(
    `sync-all-${type}`,
    { type },
  );
  logger.debug('Enqueued signal sync all', { jobId: job.id, type });
  return job;
};

// ---------------------------------------------------------------------------
// Workflow Execution
// ---------------------------------------------------------------------------

/**
 * Enqueue a workflow event for asynchronous processing.
 */
export const enqueueWorkflowExecution = async (
  organizationId: string,
  eventType: string,
  data: Record<string, unknown>,
): Promise<Job<WorkflowExecutionJobData>> => {
  const job = await workflowExecutionQueue.add(
    'process-event',
    { organizationId, eventType, data },
  );
  logger.debug('Enqueued workflow execution', { jobId: job.id, organizationId, eventType });
  return job;
};

// ---------------------------------------------------------------------------
// Email Send
// ---------------------------------------------------------------------------

/**
 * Enqueue an email send for a specific enrollment step.
 */
export const enqueueEmailSend = async (
  enrollmentId: string,
  stepId: string,
  scheduledFor?: Date,
): Promise<Job<EmailSendJobData>> => {
  const delay = scheduledFor
    ? Math.max(0, scheduledFor.getTime() - Date.now())
    : 0;

  const job = await emailSendQueue.add(
    'send-email',
    { enrollmentId, stepId },
    {
      delay,
      jobId: `email-${enrollmentId}-${stepId}`,
    },
  );
  logger.debug('Enqueued email send', { jobId: job.id, enrollmentId, stepId, delay });
  return job;
};

// ---------------------------------------------------------------------------
// HubSpot Sync
// ---------------------------------------------------------------------------

/**
 * Enqueue a HubSpot sync job for a specific organization.
 */
export const enqueueHubSpotSync = async (
  organizationId: string,
  fullSync = false,
): Promise<Job<HubSpotSyncJobData>> => {
  const job = await hubspotSyncQueue.add(
    'hubspot-sync',
    { organizationId, fullSync },
    {
      // Deduplication: only one pending sync per org at a time
      jobId: `hubspot-sync-${organizationId}`,
    },
  );
  logger.debug('Enqueued HubSpot sync', { jobId: job.id, organizationId, fullSync });
  return job;
};
