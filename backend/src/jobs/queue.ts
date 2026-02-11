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
}

export interface EnrichmentJobData {
  organizationId: string;
  contactId: string;
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
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 2000 },
    },
  },
);

export const enrichmentQueue = new Queue<EnrichmentJobData>(
  QUEUE_NAMES.ENRICHMENT,
  defaultQueueOpts,
);

// ---------------------------------------------------------------------------
// Convenience: all queues in a single array
// ---------------------------------------------------------------------------
const allQueues: Queue[] = [
  signalProcessingQueue,
  scoreComputationQueue,
  webhookDeliveryQueue,
  enrichmentQueue,
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
