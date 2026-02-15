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
  discordSyncQueue,
  salesforceSyncQueue,
  stackoverflowSyncQueue,
  twitterSyncQueue,
  bulkEnrichmentQueue,
  SignalProcessingJobData,
  ScoreComputationJobData,
  WebhookDeliveryJobData,
  EnrichmentJobData,
  SignalSyncJobData,
  WorkflowExecutionJobData,
  EmailSendJobData,
  HubSpotSyncJobData,
  DiscordSyncJobData,
  SalesforceSyncJobData,
  StackOverflowSyncJobData,
  TwitterSyncJobData,
  BulkEnrichmentJobData,
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

// ---------------------------------------------------------------------------
// Discord Sync
// ---------------------------------------------------------------------------

/**
 * Enqueue a Discord sync job for a specific organization.
 */
export const enqueueDiscordSync = async (
  organizationId: string,
): Promise<Job<DiscordSyncJobData>> => {
  const job = await discordSyncQueue.add(
    'discord-sync',
    { organizationId },
    {
      // Deduplication: only one pending sync per org at a time
      jobId: `discord-sync-${organizationId}`,
    },
  );
  logger.debug('Enqueued Discord sync', { jobId: job.id, organizationId });
  return job;
};

// ---------------------------------------------------------------------------
// Salesforce Sync
// ---------------------------------------------------------------------------

/**
 * Enqueue a Salesforce sync job for a specific organization.
 */
export const enqueueSalesforceSync = async (
  organizationId: string,
  fullSync = false,
): Promise<Job<SalesforceSyncJobData>> => {
  const job = await salesforceSyncQueue.add(
    'salesforce-sync',
    { organizationId, fullSync },
    {
      // Deduplication: only one pending sync per org at a time
      jobId: `salesforce-sync-${organizationId}`,
    },
  );
  logger.debug('Enqueued Salesforce sync', { jobId: job.id, organizationId, fullSync });
  return job;
};

// ---------------------------------------------------------------------------
// Stack Overflow Sync
// ---------------------------------------------------------------------------

/**
 * Enqueue a Stack Overflow sync job for a specific organization.
 */
export const enqueueStackOverflowSync = async (
  organizationId: string,
  type: 'full' | 'incremental' = 'incremental',
): Promise<Job<StackOverflowSyncJobData>> => {
  const job = await stackoverflowSyncQueue.add(
    'stackoverflow-sync',
    { organizationId, type },
    {
      // Deduplication: only one pending sync per org at a time
      jobId: `stackoverflow-sync-${organizationId}`,
    },
  );
  logger.debug('Enqueued Stack Overflow sync', { jobId: job.id, organizationId, type });
  return job;
};

// ---------------------------------------------------------------------------
// Twitter Sync
// ---------------------------------------------------------------------------

/**
 * Enqueue a Twitter/X sync job for a specific organization.
 */
export const enqueueTwitterSync = async (
  organizationId: string,
): Promise<Job<TwitterSyncJobData>> => {
  const job = await twitterSyncQueue.add(
    'twitter-sync',
    { organizationId },
    {
      // Deduplication: only one pending sync per org at a time
      jobId: `twitter-sync-${organizationId}`,
    },
  );
  logger.debug('Enqueued Twitter sync', { jobId: job.id, organizationId });
  return job;
};

// ---------------------------------------------------------------------------
// Bulk Enrichment (Clearbit)
// ---------------------------------------------------------------------------

/**
 * Enqueue a bulk enrichment job for companies or contacts.
 * Per-org deduplication prevents duplicate bulk runs.
 */
export const enqueueBulkEnrichment = async (
  organizationId: string,
  type: 'companies' | 'contacts',
): Promise<Job<BulkEnrichmentJobData>> => {
  const job = await bulkEnrichmentQueue.add(
    `bulk-enrich-${type}`,
    { organizationId, type },
    {
      // Deduplication: only one pending bulk enrichment per org + type
      jobId: `bulk-enrich-${type}-${organizationId}`,
    },
  );
  logger.debug('Enqueued bulk enrichment', { jobId: job.id, organizationId, type });
  return job;
};
