import { Worker, Job } from 'bullmq';
import { bullConnection } from '../config/redis';
import { logger } from '../utils/logger';
import { ingestSignal } from '../services/signals';
import { computeAccountScore } from '../services/account-scores';
import { dispatchWebhookEvent } from '../services/webhooks';
import { syncNpmSource, syncAllNpmSources } from '../services/npm-connector';
import { syncPypiSource, syncAllPypiSources } from '../services/pypi-connector';
import { processEvent } from '../services/workflows';
import { runSync } from '../services/hubspot-sync';
import { runSync as runSalesforceSync } from '../services/salesforce-sync';
import { syncDiscordServer } from '../services/discord-connector';
import { syncStackOverflow } from '../services/stackoverflow-connector';
import { syncTwitterMentions } from '../services/twitter-connector';
import { bulkEnrichCompanies, bulkEnrichContacts } from '../services/clearbit-enrichment';
import { enqueueHubSpotSyncForAllConnected, enqueueDiscordSyncForAllConnected, enqueueSalesforceSyncForAllConnected, enqueueStackOverflowSyncForAllConnected, enqueueTwitterSyncForAllConnected, enqueueClearbitEnrichmentForAllConnected } from './scheduler';
import {
  QUEUE_NAMES,
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
import { processEmailStep } from '../services/email-sequences';

// ---------------------------------------------------------------------------
// Worker references (populated by startWorkers, drained by stopWorkers)
// ---------------------------------------------------------------------------
const workers: Worker[] = [];

// ---------------------------------------------------------------------------
// Signal Processing Worker
// ---------------------------------------------------------------------------
function createSignalProcessingWorker(): Worker<SignalProcessingJobData> {
  return new Worker<SignalProcessingJobData>(
    QUEUE_NAMES.SIGNAL_PROCESSING,
    async (job: Job<SignalProcessingJobData>) => {
      const { organizationId, signalData } = job.data;
      logger.info('Signal processing started', { jobId: job.id, organizationId, type: signalData.type });

      // ingestSignal already handles identity resolution (actor lookup, anonymous-id
      // domain matching) and account matching internally.
      const signal = await ingestSignal(organizationId, signalData);

      logger.info('Signal processing completed', { jobId: job.id, signalId: signal.id });
      return { signalId: signal.id, accountId: signal.accountId };
    },
    {
      connection: bullConnection,
      concurrency: 5,
    },
  );
}

// ---------------------------------------------------------------------------
// Score Computation Worker
// ---------------------------------------------------------------------------
function createScoreComputationWorker(): Worker<ScoreComputationJobData> {
  return new Worker<ScoreComputationJobData>(
    QUEUE_NAMES.SCORE_COMPUTATION,
    async (job: Job<ScoreComputationJobData>) => {
      const { organizationId, accountId } = job.data;
      logger.info('Score computation started', { jobId: job.id, organizationId, accountId });

      const score = await computeAccountScore(organizationId, accountId);

      logger.info('Score computation completed', {
        jobId: job.id,
        accountId,
        score: score.score,
        tier: score.tier,
      });
      return { accountId, score: score.score, tier: score.tier };
    },
    {
      connection: bullConnection,
      concurrency: 3,
    },
  );
}

// ---------------------------------------------------------------------------
// Webhook Delivery Worker
// ---------------------------------------------------------------------------
function createWebhookDeliveryWorker(): Worker<WebhookDeliveryJobData> {
  return new Worker<WebhookDeliveryJobData>(
    QUEUE_NAMES.WEBHOOK_DELIVERY,
    async (job: Job<WebhookDeliveryJobData>) => {
      const { organizationId, event, payload } = job.data;
      logger.info('Webhook delivery started', {
        jobId: job.id,
        organizationId,
        event,
        attempt: job.attemptsMade + 1,
      });

      // dispatchWebhookEvent already handles finding matching endpoints,
      // signing payloads, and recording delivery results.
      await dispatchWebhookEvent(organizationId, event, payload);

      logger.info('Webhook delivery completed', { jobId: job.id, event });
    },
    {
      connection: bullConnection,
      concurrency: 10,
    },
  );
}

// ---------------------------------------------------------------------------
// Enrichment Worker
// ---------------------------------------------------------------------------
function createEnrichmentWorker(): Worker<EnrichmentJobData> {
  return new Worker<EnrichmentJobData>(
    QUEUE_NAMES.ENRICHMENT,
    async (job: Job<EnrichmentJobData>) => {
      const { organizationId, contactId } = job.data;
      logger.info('Enrichment started', { jobId: job.id, organizationId, contactId });

      // TODO: Plug in actual enrichment provider (Clearbit, Apollo, etc.)
      // For now this is a placeholder that logs the intent.
      logger.info('Enrichment completed (no-op — provider not configured)', {
        jobId: job.id,
        contactId,
      });
      return { contactId, enriched: false, reason: 'no_provider_configured' };
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Signal Sync Worker (npm / pypi source syncing)
// ---------------------------------------------------------------------------
function createSignalSyncWorker(): Worker<SignalSyncJobData> {
  return new Worker<SignalSyncJobData>(
    QUEUE_NAMES.SIGNAL_SYNC,
    async (job: Job<SignalSyncJobData>) => {
      const { sourceId, organizationId, type } = job.data;

      if (sourceId && organizationId) {
        // Sync a specific source
        logger.info('Signal sync started for single source', {
          jobId: job.id,
          sourceId,
          organizationId,
          type,
        });

        if (type === 'npm') {
          const result = await syncNpmSource(organizationId, sourceId);
          logger.info('npm source sync completed', { jobId: job.id, sourceId, synced: result.synced });
          return result;
        } else {
          const result = await syncPypiSource(organizationId, sourceId);
          logger.info('PyPI source sync completed', { jobId: job.id, sourceId, synced: result.synced });
          return result;
        }
      } else {
        // Sync all sources of the given type
        logger.info('Signal sync started for all sources', { jobId: job.id, type });

        if (type === 'npm') {
          await syncAllNpmSources();
          logger.info('All npm sources synced', { jobId: job.id });
          return { type: 'npm', syncedAll: true };
        } else {
          await syncAllPypiSources();
          logger.info('All PyPI sources synced', { jobId: job.id });
          return { type: 'pypi', syncedAll: true };
        }
      }
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Workflow Execution Worker
// ---------------------------------------------------------------------------
function createWorkflowExecutionWorker(): Worker<WorkflowExecutionJobData> {
  return new Worker<WorkflowExecutionJobData>(
    QUEUE_NAMES.WORKFLOW_EXECUTION,
    async (job: Job<WorkflowExecutionJobData>) => {
      const { organizationId, eventType, data } = job.data;
      logger.info('Workflow execution started', {
        jobId: job.id,
        organizationId,
        eventType,
        attempt: job.attemptsMade + 1,
      });

      await processEvent(organizationId, eventType, data);

      logger.info('Workflow execution completed', { jobId: job.id, eventType });
    },
    {
      connection: bullConnection,
      concurrency: 5,
    },
  );
}

// ---------------------------------------------------------------------------
// HubSpot Sync Worker
// ---------------------------------------------------------------------------
function createHubSpotSyncWorker(): Worker<HubSpotSyncJobData> {
  return new Worker<HubSpotSyncJobData>(
    QUEUE_NAMES.HUBSPOT_SYNC,
    async (job: Job<HubSpotSyncJobData>) => {
      const { organizationId, fullSync } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('HubSpot sync scheduler triggered', { jobId: job.id });
        await enqueueHubSpotSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('HubSpot sync started', {
        jobId: job.id,
        organizationId,
        fullSync,
        attempt: job.attemptsMade + 1,
      });

      const result = await runSync(organizationId, fullSync);

      logger.info('HubSpot sync completed', {
        jobId: job.id,
        organizationId,
        contacts: result.contacts,
        companies: result.companies,
        deals: result.deals,
      });
      return result;
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Discord Sync Worker
// ---------------------------------------------------------------------------
function createDiscordSyncWorker(): Worker<DiscordSyncJobData> {
  return new Worker<DiscordSyncJobData>(
    QUEUE_NAMES.DISCORD_SYNC,
    async (job: Job<DiscordSyncJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('Discord sync scheduler triggered', { jobId: job.id });
        await enqueueDiscordSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('Discord sync started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await syncDiscordServer(organizationId);

      logger.info('Discord sync completed', {
        jobId: job.id,
        organizationId,
        messagesProcessed: result.messagesProcessed,
        signalsCreated: result.signalsCreated,
        contactsResolved: result.contactsResolved,
        errors: result.errors.length,
      });
      return result;
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Salesforce Sync Worker
// ---------------------------------------------------------------------------
function createSalesforceSyncWorker(): Worker<SalesforceSyncJobData> {
  return new Worker<SalesforceSyncJobData>(
    QUEUE_NAMES.SALESFORCE_SYNC,
    async (job: Job<SalesforceSyncJobData>) => {
      const { organizationId, fullSync } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('Salesforce sync scheduler triggered', { jobId: job.id });
        await enqueueSalesforceSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('Salesforce sync started', {
        jobId: job.id,
        organizationId,
        fullSync,
        attempt: job.attemptsMade + 1,
      });

      const result = await runSalesforceSync(organizationId, fullSync);

      logger.info('Salesforce sync completed', {
        jobId: job.id,
        organizationId,
        contacts: result.contacts,
        accounts: result.accounts,
        opportunities: result.opportunities,
      });
      return result;
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Stack Overflow Sync Worker
// ---------------------------------------------------------------------------
function createStackOverflowSyncWorker(): Worker<StackOverflowSyncJobData> {
  return new Worker<StackOverflowSyncJobData>(
    QUEUE_NAMES.STACKOVERFLOW_SYNC,
    async (job: Job<StackOverflowSyncJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('Stack Overflow sync scheduler triggered', { jobId: job.id });
        await enqueueStackOverflowSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('Stack Overflow sync started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await syncStackOverflow(organizationId);

      logger.info('Stack Overflow sync completed', {
        jobId: job.id,
        organizationId,
        questionsProcessed: result.questionsProcessed,
        answersProcessed: result.answersProcessed,
        signalsCreated: result.signalsCreated,
        contactsResolved: result.contactsResolved,
        errors: result.errors.length,
      });
      return result;
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Twitter Sync Worker
// ---------------------------------------------------------------------------
function createTwitterSyncWorker(): Worker<TwitterSyncJobData> {
  return new Worker<TwitterSyncJobData>(
    QUEUE_NAMES.TWITTER_SYNC,
    async (job: Job<TwitterSyncJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('Twitter sync scheduler triggered', { jobId: job.id });
        await enqueueTwitterSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('Twitter sync started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await syncTwitterMentions(organizationId);

      logger.info('Twitter sync completed', {
        jobId: job.id,
        organizationId,
        tweetsProcessed: result.tweetsProcessed,
        signalsCreated: result.signalsCreated,
        contactsResolved: result.contactsResolved,
        sentiment: result.sentimentBreakdown,
        errors: result.errors.length,
      });
      return result;
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Bulk Enrichment Worker (Clearbit)
// ---------------------------------------------------------------------------
function createBulkEnrichmentWorker(): Worker<BulkEnrichmentJobData> {
  return new Worker<BulkEnrichmentJobData>(
    QUEUE_NAMES.ENRICHMENT_BULK,
    async (job: Job<BulkEnrichmentJobData>) => {
      const { organizationId, type } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('Clearbit enrichment scheduler triggered', { jobId: job.id });
        await enqueueClearbitEnrichmentForAllConnected();
        return { scheduled: true };
      }

      logger.info('Bulk enrichment started', {
        jobId: job.id,
        organizationId,
        type,
        attempt: job.attemptsMade + 1,
      });

      const result = type === 'companies'
        ? await bulkEnrichCompanies(organizationId)
        : await bulkEnrichContacts(organizationId);

      logger.info('Bulk enrichment completed', {
        jobId: job.id,
        organizationId,
        type,
        total: result.total,
        enriched: result.enriched,
        skipped: result.skipped,
        failed: result.failed,
      });
      return result;
    },
    {
      connection: bullConnection,
      concurrency: 1, // Only one bulk enrichment at a time to respect rate limits
    },
  );
}

// ---------------------------------------------------------------------------
// Email Send Worker
// ---------------------------------------------------------------------------
function createEmailSendWorker(): Worker<EmailSendJobData> {
  return new Worker<EmailSendJobData>(
    QUEUE_NAMES.EMAIL_SEND,
    async (job: Job<EmailSendJobData>) => {
      const { enrollmentId, stepId } = job.data;
      logger.info('Email send started', {
        jobId: job.id,
        enrollmentId,
        stepId,
        attempt: job.attemptsMade + 1,
      });

      await processEmailStep(enrollmentId, stepId);

      logger.info('Email send completed', { jobId: job.id, enrollmentId, stepId });
    },
    {
      connection: bullConnection,
      concurrency: 5,
    },
  );
}

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------
function attachLogging(worker: Worker): void {
  worker.on('completed', (job) => {
    logger.debug('Job completed', { queue: worker.name, jobId: job?.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      queue: worker.name,
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });

  worker.on('error', (err) => {
    logger.error('Worker error', { queue: worker.name, error: err.message });
  });
}

/**
 * Start all BullMQ workers. Call once at server startup.
 */
export const startWorkers = (): void => {
  logger.info('Starting BullMQ workers...');

  const signalWorker = createSignalProcessingWorker();
  const scoreWorker = createScoreComputationWorker();
  const webhookWorker = createWebhookDeliveryWorker();
  const enrichmentWorker = createEnrichmentWorker();
  const signalSyncWorker = createSignalSyncWorker();
  const workflowWorker = createWorkflowExecutionWorker();
  const emailSendWorker = createEmailSendWorker();
  const hubspotSyncWorker = createHubSpotSyncWorker();
  const discordSyncWorker = createDiscordSyncWorker();
  const salesforceSyncWorker = createSalesforceSyncWorker();
  const stackoverflowSyncWorker = createStackOverflowSyncWorker();
  const twitterSyncWorker = createTwitterSyncWorker();
  const bulkEnrichmentWorker = createBulkEnrichmentWorker();

  [signalWorker, scoreWorker, webhookWorker, enrichmentWorker, signalSyncWorker, workflowWorker, emailSendWorker, hubspotSyncWorker, discordSyncWorker, salesforceSyncWorker, stackoverflowSyncWorker, twitterSyncWorker, bulkEnrichmentWorker].forEach((w) => {
    attachLogging(w);
    workers.push(w);
  });

  logger.info('All BullMQ workers started', { count: workers.length });
};

/**
 * Gracefully stop all BullMQ workers. Call during server shutdown.
 */
export const stopWorkers = async (): Promise<void> => {
  logger.info('Stopping BullMQ workers...');
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
  logger.info('All BullMQ workers stopped');
};
