import { Queue } from 'bullmq';
import { bullConnection } from '../config/redis';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Queue names (exported as a const for type-safe references)
// ---------------------------------------------------------------------------
export const QUEUE_NAMES = {
  SIGNAL_PROCESSING: 'signal-processing',
  SCORE_COMPUTATION: 'score-computation',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  ENRICHMENT: 'enrichment',
  SIGNAL_SYNC: 'signal-sync',
  WORKFLOW_EXECUTION: 'workflow-execution',
  EMAIL_SEND: 'email-send',
  HUBSPOT_SYNC: 'hubspot-sync',
  DISCORD_SYNC: 'discord-sync',
  SALESFORCE_SYNC: 'salesforce-sync',
  STACKOVERFLOW_SYNC: 'stackoverflow-sync',
  TWITTER_SYNC: 'twitter-sync',
  REDDIT_SYNC: 'reddit-sync',
  ENRICHMENT_BULK: 'enrichment-bulk',
  POSTHOG_SYNC: 'posthog-sync',
  LINKEDIN_SYNC: 'linkedin-sync',
  INTERCOM_SYNC: 'intercom-sync',
  ZENDESK_SYNC: 'zendesk-sync',
  SCORE_SNAPSHOT: 'score-snapshot',
  WEEKLY_DIGEST: 'weekly-digest',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------
export interface SignalProcessingJobData {
  organizationId: string;
  signalData: {
    sourceId: string;
    type: string;
    actorId?: string;
    accountId?: string;
    anonymousId?: string;
    metadata: Record<string, unknown>;
    idempotencyKey?: string;
    timestamp?: string;
  };
}

export interface ScoreComputationJobData {
  organizationId: string;
  accountId: string;
}

export interface WebhookDeliveryJobData {
  organizationId: string;
  event: string;
  payload: Record<string, unknown>;
  /** Per-subscription delivery fields (set by fireEvent in webhook-subscriptions service) */
  subscriptionId?: string;
  targetUrl?: string;
  secret?: string;
}

export interface EnrichmentJobData {
  organizationId: string;
  contactId: string;
}

export interface SignalSyncJobData {
  sourceId?: string;
  organizationId?: string;
  type: 'npm' | 'pypi';
}

export interface WorkflowExecutionJobData {
  organizationId: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface EmailSendJobData {
  enrollmentId: string;
  stepId: string;
}

export interface HubSpotSyncJobData {
  organizationId: string;
  fullSync?: boolean;
}

export interface DiscordSyncJobData {
  organizationId: string;
}

export interface SalesforceSyncJobData {
  organizationId: string;
  fullSync?: boolean;
}

export interface StackOverflowSyncJobData {
  organizationId: string;
  type: 'full' | 'incremental';
}

export interface TwitterSyncJobData {
  organizationId: string;
}

export interface RedditSyncJobData {
  organizationId: string;
}

export interface PostHogSyncJobData {
  organizationId: string;
}

export interface LinkedInSyncJobData {
  organizationId: string;
}

export interface IntercomSyncJobData {
  organizationId: string;
}

export interface ZendeskSyncJobData {
  organizationId: string;
}

export interface BulkEnrichmentJobData {
  organizationId: string;
  type: 'companies' | 'contacts';
}

export interface ScoreSnapshotJobData {
  organizationId: string;
}

export interface WeeklyDigestJobData {
  organizationId: string;
}

// ---------------------------------------------------------------------------
// Queue instances
// ---------------------------------------------------------------------------
const defaultQueueOpts = {
  connection: bullConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 1000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
};

export const signalProcessingQueue = new Queue<SignalProcessingJobData>(
  QUEUE_NAMES.SIGNAL_PROCESSING,
  defaultQueueOpts,
);

export const scoreComputationQueue = new Queue<ScoreComputationJobData>(
  QUEUE_NAMES.SCORE_COMPUTATION,
  defaultQueueOpts,
);

export const webhookDeliveryQueue = new Queue<WebhookDeliveryJobData>(
  QUEUE_NAMES.WEBHOOK_DELIVERY,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 5,
      backoff: { type: 'exponential' as const, delay: 30_000 },
      removeOnComplete: { count: 2000 },
      removeOnFail: { count: 10_000 },
    },
  },
);

export const enrichmentQueue = new Queue<EnrichmentJobData>(
  QUEUE_NAMES.ENRICHMENT,
  defaultQueueOpts,
);

export const signalSyncQueue = new Queue<SignalSyncJobData>(
  QUEUE_NAMES.SIGNAL_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
    },
  },
);

export const workflowExecutionQueue = new Queue<WorkflowExecutionJobData>(
  QUEUE_NAMES.WORKFLOW_EXECUTION,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000 },
    },
  },
);

export const emailSendQueue = new Queue<EmailSendJobData>(
  QUEUE_NAMES.EMAIL_SEND,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
    },
  },
);

export const hubspotSyncQueue = new Queue<HubSpotSyncJobData>(
  QUEUE_NAMES.HUBSPOT_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 10_000 },
    },
  },
);

export const discordSyncQueue = new Queue<DiscordSyncJobData>(
  QUEUE_NAMES.DISCORD_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const salesforceSyncQueue = new Queue<SalesforceSyncJobData>(
  QUEUE_NAMES.SALESFORCE_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 10_000 },
    },
  },
);

export const stackoverflowSyncQueue = new Queue<StackOverflowSyncJobData>(
  QUEUE_NAMES.STACKOVERFLOW_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const twitterSyncQueue = new Queue<TwitterSyncJobData>(
  QUEUE_NAMES.TWITTER_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 10_000 },
    },
  },
);

export const redditSyncQueue = new Queue<RedditSyncJobData>(
  QUEUE_NAMES.REDDIT_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const posthogSyncQueue = new Queue<PostHogSyncJobData>(
  QUEUE_NAMES.POSTHOG_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const linkedinSyncQueue = new Queue<LinkedInSyncJobData>(
  QUEUE_NAMES.LINKEDIN_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const intercomSyncQueue = new Queue<IntercomSyncJobData>(
  QUEUE_NAMES.INTERCOM_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const zendeskSyncQueue = new Queue<ZendeskSyncJobData>(
  QUEUE_NAMES.ZENDESK_SYNC,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const bulkEnrichmentQueue = new Queue<BulkEnrichmentJobData>(
  QUEUE_NAMES.ENRICHMENT_BULK,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 2,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const scoreSnapshotQueue = new Queue<ScoreSnapshotJobData>(
  QUEUE_NAMES.SCORE_SNAPSHOT,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5_000 },
    },
  },
);

export const weeklyDigestQueue = new Queue<WeeklyDigestJobData>(
  QUEUE_NAMES.WEEKLY_DIGEST,
  {
    ...defaultQueueOpts,
    defaultJobOptions: {
      ...defaultQueueOpts.defaultJobOptions,
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 10_000 },
    },
  },
);

// ---------------------------------------------------------------------------
// Convenience: all queues in a single array
// ---------------------------------------------------------------------------
const allQueues: Queue[] = [
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
  redditSyncQueue,
  posthogSyncQueue,
  linkedinSyncQueue,
  intercomSyncQueue,
  zendeskSyncQueue,
  bulkEnrichmentQueue,
  scoreSnapshotQueue,
  weeklyDigestQueue,
];

/**
 * Gracefully close all BullMQ queues.
 * Call this during server shutdown.
 */
export const closeAllQueues = async (): Promise<void> => {
  logger.info('Closing all BullMQ queues...');
  await Promise.all(allQueues.map((q) => q.close()));
  logger.info('All BullMQ queues closed');
};
