import { Worker, Job } from 'bullmq';
import { bullConnection } from '../config/redis';
import { logger } from '../utils/logger';
import { ingestSignal } from '../services/signals';
import { computeAccountScore } from '../services/account-scores';
import { dispatchWebhookEvent } from '../services/webhooks';
import {
  deliverToSubscription,
  recordSubscriptionDelivery,
  markSubscriptionFailing,
  markSubscriptionHealthy,
} from '../services/webhook-subscriptions';
import { syncNpmSource, syncAllNpmSources } from '../services/npm-connector';
import { syncPypiSource, syncAllPypiSources } from '../services/pypi-connector';
import { processEvent } from '../services/workflows';
import { runSync } from '../services/hubspot-sync';
import { runSync as runSalesforceSync } from '../services/salesforce-sync';
import { syncDiscordServer } from '../services/discord-connector';
import { syncStackOverflow } from '../services/stackoverflow-connector';
import { syncTwitterMentions } from '../services/twitter-connector';
import { syncReddit } from '../services/reddit-connector';
import { syncLinkedIn } from '../services/linkedin-connector';
import { syncPostHogEvents } from '../services/posthog-connector';
import { bulkEnrichCompanies, bulkEnrichContacts } from '../services/clearbit-enrichment';
import { captureScoreSnapshots } from '../services/score-snapshots';
import { enqueueHubSpotSyncForAllConnected, enqueueDiscordSyncForAllConnected, enqueueSalesforceSyncForAllConnected, enqueueStackOverflowSyncForAllConnected, enqueueTwitterSyncForAllConnected, enqueueRedditSyncForAllConnected, enqueueLinkedInSyncForAllConnected, enqueuePostHogSyncForAllConnected, enqueueClearbitEnrichmentForAllConnected, enqueueScoreSnapshotForAllOrgs, enqueueWeeklyDigestForAllOrgs } from './scheduler';
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
  RedditSyncJobData,
  LinkedInSyncJobData,
  PostHogSyncJobData,
  BulkEnrichmentJobData,
  ScoreSnapshotJobData,
  WeeklyDigestJobData,
  DataExportJobData,
  DemoCleanupJobData,
  AlertEvaluationJobData,
  AlertCheckJobData,
  AnomalyDetectionJobData,
  anomalyDetectionQueue,
} from './queue';
import { generateExport, setExportStatus } from '../services/data-export';
import { processEmailStep } from '../services/email-sequences';
import { generateWeeklyDigest } from '../services/weekly-digest';
import { renderWeeklyDigestEmail, renderWeeklyDigestSubject } from '../services/email-templates';
import { sendEmail } from '../services/email-sender';
import { cleanupDemoOrg } from '../services/demo-seed';
import { processAnomalyDetection, enqueueAnomalyDetectionForAllOrgs } from './anomaly-detection';
import { evaluateAlertsForAccount } from './alert-evaluation';
import { processAlertCheck } from './alert-check-cron';
import { prisma } from '../config/database';
import { config } from '../config';

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
      concurrency: 5,
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
      const { organizationId, event, payload, subscriptionId, targetUrl, secret } = job.data;
      const attempt = job.attemptsMade + 1;
      const maxAttempts = (job.opts.attempts ?? 5);

      // ---------------------------------------------------------------
      // Per-subscription delivery (Zapier/Make REST Hook pattern)
      // ---------------------------------------------------------------
      if (subscriptionId && targetUrl && secret) {
        logger.info('Webhook subscription delivery started', {
          jobId: job.id,
          subscriptionId,
          targetUrl,
          event,
          attempt,
          maxAttempts,
        });

        const result = await deliverToSubscription(targetUrl, secret, event, payload);

        // Record the delivery attempt in the database
        await recordSubscriptionDelivery({
          subscriptionId,
          event,
          payload,
          statusCode: result.statusCode,
          response: result.error,
          success: result.success,
          attempt,
          maxAttempts,
          jobId: job.id,
        }).catch((err) => {
          // Delivery logging failure should not block the job outcome
          logger.error('Failed to record subscription delivery', {
            subscriptionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        if (!result.success) {
          const isLastAttempt = attempt >= maxAttempts;

          if (isLastAttempt) {
            // All retries exhausted -- mark subscription as FAILING
            logger.error('Webhook subscription delivery exhausted all retries, marking FAILING', {
              jobId: job.id,
              subscriptionId,
              targetUrl,
              event,
              statusCode: result.statusCode,
              error: result.error,
            });

            await markSubscriptionFailing(subscriptionId).catch((err) => {
              logger.error('Failed to mark subscription as FAILING', {
                subscriptionId,
                error: err instanceof Error ? err.message : String(err),
              });
            });

            // Don't throw -- let the job complete as failed on final attempt
            // so BullMQ records it in the dead-letter set
            throw new Error(
              `Webhook delivery to ${targetUrl} failed after ${maxAttempts} attempts: ${result.error || `HTTP ${result.statusCode}`}`,
            );
          }

          // Throw to trigger BullMQ retry with exponential backoff
          throw new Error(
            `Webhook delivery to ${targetUrl} failed (attempt ${attempt}/${maxAttempts}): ${result.error || `HTTP ${result.statusCode}`}`,
          );
        }

        // Success -- if the subscription was previously FAILING, restore to HEALTHY
        await markSubscriptionHealthy(subscriptionId).catch((err) => {
          logger.error('Failed to mark subscription as HEALTHY', {
            subscriptionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        logger.info('Webhook subscription delivery succeeded', {
          jobId: job.id,
          subscriptionId,
          event,
          statusCode: result.statusCode,
          attempt,
        });

        return;
      }

      // ---------------------------------------------------------------
      // Legacy: native WebhookEndpoint delivery (unchanged)
      // ---------------------------------------------------------------
      logger.info('Webhook delivery started', {
        jobId: job.id,
        organizationId,
        event,
        attempt,
      });

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
// Reddit Sync Worker
// ---------------------------------------------------------------------------
function createRedditSyncWorker(): Worker<RedditSyncJobData> {
  return new Worker<RedditSyncJobData>(
    QUEUE_NAMES.REDDIT_SYNC,
    async (job: Job<RedditSyncJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('Reddit sync scheduler triggered', { jobId: job.id });
        await enqueueRedditSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('Reddit sync started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await syncReddit(organizationId);

      logger.info('Reddit sync completed', {
        jobId: job.id,
        organizationId,
        postsProcessed: result.postsProcessed,
        commentsProcessed: result.commentsProcessed,
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
// LinkedIn Sync Worker
// ---------------------------------------------------------------------------
function createLinkedInSyncWorker(): Worker<LinkedInSyncJobData> {
  return new Worker<LinkedInSyncJobData>(
    QUEUE_NAMES.LINKEDIN_SYNC,
    async (job: Job<LinkedInSyncJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('LinkedIn sync scheduler triggered', { jobId: job.id });
        await enqueueLinkedInSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('LinkedIn sync started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await syncLinkedIn(organizationId);

      logger.info('LinkedIn sync completed', {
        jobId: job.id,
        organizationId,
        employeesImported: result.employeesImported,
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
// PostHog Sync Worker
// ---------------------------------------------------------------------------
function createPostHogSyncWorker(): Worker<PostHogSyncJobData> {
  return new Worker<PostHogSyncJobData>(
    QUEUE_NAMES.POSTHOG_SYNC,
    async (job: Job<PostHogSyncJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for connected orgs
      if (organizationId === '__scheduler__') {
        logger.info('PostHog sync scheduler triggered', { jobId: job.id });
        await enqueuePostHogSyncForAllConnected();
        return { scheduled: true };
      }

      logger.info('PostHog sync started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await syncPostHogEvents(organizationId);

      logger.info('PostHog sync completed', {
        jobId: job.id,
        organizationId,
        eventsProcessed: result.eventsProcessed,
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
// Score Snapshot Worker
// ---------------------------------------------------------------------------
function createScoreSnapshotWorker(): Worker<ScoreSnapshotJobData> {
  return new Worker<ScoreSnapshotJobData>(
    QUEUE_NAMES.SCORE_SNAPSHOT,
    async (job: Job<ScoreSnapshotJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for all orgs
      if (organizationId === '__scheduler__') {
        logger.info('Score snapshot scheduler triggered', { jobId: job.id });
        await enqueueScoreSnapshotForAllOrgs();
        return { scheduled: true };
      }

      logger.info('Score snapshot capture started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await captureScoreSnapshots(organizationId);

      logger.info('Score snapshot capture completed', {
        jobId: job.id,
        organizationId,
        captured: result.captured,
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
// Weekly Digest Worker
// ---------------------------------------------------------------------------
function createWeeklyDigestWorker(): Worker<WeeklyDigestJobData> {
  return new Worker<WeeklyDigestJobData>(
    QUEUE_NAMES.WEEKLY_DIGEST,
    async (job: Job<WeeklyDigestJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for all orgs
      if (organizationId === '__scheduler__') {
        logger.info('Weekly digest scheduler triggered', { jobId: job.id });
        await enqueueWeeklyDigestForAllOrgs();
        return { scheduled: true };
      }

      logger.info('Weekly digest generation started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      // 1. Generate digest data
      const digestData = await generateWeeklyDigest(organizationId);

      // 2. Render HTML email
      const appUrl = config.frontend.url;
      const html = renderWeeklyDigestEmail(digestData, appUrl);
      const subject = renderWeeklyDigestSubject(digestData);

      // 3. Find all org members to send the digest to
      //    In the future we can add a per-user "digestEnabled" preference.
      //    For now, send to all org members.
      const members = await prisma.userOrganization.findMany({
        where: { organizationId },
        include: { user: { select: { email: true } } },
      });

      const emails = members
        .map((m) => m.user.email)
        .filter((e): e is string => !!e);

      if (emails.length === 0) {
        logger.info('Weekly digest skipped — no members found', { organizationId });
        return { sent: 0 };
      }

      // 4. Send the digest email to all members
      //    We send one email per member (not BCC) so each gets their own unsubscribe.
      let sent = 0;
      for (const email of emails) {
        try {
          await sendEmail({
            to: email,
            subject,
            html,
          });
          sent++;
        } catch (err) {
          logger.error('Failed to send weekly digest to member', {
            organizationId,
            email,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.info('Weekly digest completed', {
        jobId: job.id,
        organizationId,
        totalMembers: emails.length,
        sent,
      });

      return { sent, totalMembers: emails.length };
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Data Export Worker
// ---------------------------------------------------------------------------
function createDataExportWorker(): Worker<DataExportJobData> {
  return new Worker<DataExportJobData>(
    QUEUE_NAMES.DATA_EXPORT,
    async (job: Job<DataExportJobData>) => {
      const { organizationId, userId, format, entities } = job.data;
      const jobId = job.id ?? `unknown-${Date.now()}`;

      logger.info('Data export started', {
        jobId,
        organizationId,
        format,
        entities,
        attempt: job.attemptsMade + 1,
      });

      // Mark as processing
      setExportStatus(jobId, {
        jobId,
        organizationId,
        userId,
        format,
        entities,
        status: 'processing',
        createdAt: new Date().toISOString(),
      });

      try {
        const result = await generateExport(job.data);

        // Mark as completed
        setExportStatus(jobId, {
          jobId,
          organizationId,
          userId,
          format,
          entities,
          status: 'completed',
          filePath: result.filePath,
          fileName: result.fileName,
          totalRecords: result.totalRecords,
          recordCounts: result.recordCounts,
          sizeBytes: result.sizeBytes,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });

        logger.info('Data export completed', {
          jobId,
          organizationId,
          totalRecords: result.totalRecords,
          sizeBytes: result.sizeBytes,
        });

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Mark as failed
        setExportStatus(jobId, {
          jobId,
          organizationId,
          userId,
          format,
          entities,
          status: 'failed',
          error: errorMessage,
          createdAt: new Date().toISOString(),
        });

        throw err;
      }
    },
    {
      connection: bullConnection,
      concurrency: 2,
    },
  );
}

// ---------------------------------------------------------------------------
// Demo Cleanup Worker
// ---------------------------------------------------------------------------
function createDemoCleanupWorker(): Worker<DemoCleanupJobData> {
  return new Worker<DemoCleanupJobData>(
    QUEUE_NAMES.DEMO_CLEANUP,
    async (job: Job<DemoCleanupJobData>) => {
      logger.info('Demo cleanup started', {
        jobId: job.id,
        trigger: job.data.trigger,
        attempt: job.attemptsMade + 1,
      });

      // Find demo orgs older than 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const staleOrgs = await prisma.organization.findMany({
        where: {
          slug: { startsWith: 'sigscore-demo' },
          createdAt: { lt: cutoff },
        },
        select: { id: true, slug: true, createdAt: true },
      });

      if (staleOrgs.length === 0) {
        logger.info('Demo cleanup completed — no stale orgs found', { jobId: job.id });
        return { cleaned: 0 };
      }

      let cleaned = 0;
      const errors: string[] = [];

      for (const org of staleOrgs) {
        try {
          await cleanupDemoOrg(org.id);
          cleaned++;
          logger.info('Cleaned up stale demo org', {
            jobId: job.id,
            orgId: org.id,
            slug: org.slug,
            createdAt: org.createdAt.toISOString(),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${org.id}: ${msg}`);
          logger.error('Failed to clean up stale demo org', {
            jobId: job.id,
            orgId: org.id,
            slug: org.slug,
            error: msg,
          });
        }
      }

      logger.info('Demo cleanup completed', {
        jobId: job.id,
        found: staleOrgs.length,
        cleaned,
        failed: errors.length,
      });

      return { found: staleOrgs.length, cleaned, failed: errors.length, errors };
    },
    {
      connection: bullConnection,
      concurrency: 1, // Only one cleanup at a time to avoid race conditions
    },
  );
}

// ---------------------------------------------------------------------------
// Anomaly Detection Worker
// ---------------------------------------------------------------------------
function createAnomalyDetectionWorker(): Worker<AnomalyDetectionJobData> {
  return new Worker<AnomalyDetectionJobData>(
    QUEUE_NAMES.ANOMALY_DETECTION,
    async (job: Job<AnomalyDetectionJobData>) => {
      const { organizationId } = job.data;

      // Handle scheduler sentinel: enqueue individual jobs for all orgs
      if (organizationId === '__scheduler__') {
        logger.info('Anomaly detection scheduler triggered', { jobId: job.id });
        const orgIds = await enqueueAnomalyDetectionForAllOrgs();
        for (const orgId of orgIds) {
          await anomalyDetectionQueue.add(
            'detect-anomalies',
            { organizationId: orgId },
            { jobId: `anomaly-detect-${orgId}-${Date.now()}` },
          );
        }
        logger.info('Anomaly detection enqueued for all orgs', { count: orgIds.length });
        return { scheduled: true, orgs: orgIds.length };
      }

      logger.info('Anomaly detection started', {
        jobId: job.id,
        organizationId,
        attempt: job.attemptsMade + 1,
      });

      const result = await processAnomalyDetection(organizationId);

      logger.info('Anomaly detection completed', {
        jobId: job.id,
        organizationId,
        anomaliesDetected: result.anomaliesDetected,
        notificationsCreated: result.notificationsCreated,
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
// Alert Evaluation Worker
// ---------------------------------------------------------------------------
function createAlertEvaluationWorker(): Worker<AlertEvaluationJobData> {
  return new Worker<AlertEvaluationJobData>(
    QUEUE_NAMES.ALERT_EVALUATION,
    async (job: Job<AlertEvaluationJobData>) => {
      const { organizationId, accountId, newScore, oldScore } = job.data;
      logger.info('Alert evaluation started', {
        jobId: job.id,
        organizationId,
        accountId,
        newScore,
        oldScore,
        attempt: job.attemptsMade + 1,
      });

      const result = await evaluateAlertsForAccount({
        organizationId,
        accountId,
        newScore,
        oldScore,
      });

      logger.info('Alert evaluation completed', {
        jobId: job.id,
        organizationId,
        accountId,
        evaluated: result.evaluated,
        triggered: result.triggered,
      });

      return result;
    },
    {
      connection: bullConnection,
      concurrency: 5,
    },
  );
}

// ---------------------------------------------------------------------------
// Alert Check Worker (cron-based time-sensitive alerts)
// ---------------------------------------------------------------------------
function createAlertCheckWorker(): Worker<AlertCheckJobData> {
  return new Worker<AlertCheckJobData>(
    QUEUE_NAMES.ALERT_CHECK,
    async (job: Job<AlertCheckJobData>) => {
      const result = await processAlertCheck(job.data);

      logger.info('Alert check job completed', {
        jobId: job.id,
        organizationId: job.data.organizationId,
        ...result,
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
  const redditSyncWorker = createRedditSyncWorker();
  const linkedinSyncWorker = createLinkedInSyncWorker();
  const posthogSyncWorker = createPostHogSyncWorker();
  const bulkEnrichmentWorker = createBulkEnrichmentWorker();
  const scoreSnapshotWorker = createScoreSnapshotWorker();
  const weeklyDigestWorker = createWeeklyDigestWorker();
  const dataExportWorker = createDataExportWorker();
  const demoCleanupWorker = createDemoCleanupWorker();
  const anomalyDetectionWorker = createAnomalyDetectionWorker();
  const alertEvaluationWorker = createAlertEvaluationWorker();
  const alertCheckWorker = createAlertCheckWorker();

  [signalWorker, scoreWorker, webhookWorker, enrichmentWorker, signalSyncWorker, workflowWorker, emailSendWorker, hubspotSyncWorker, discordSyncWorker, salesforceSyncWorker, stackoverflowSyncWorker, twitterSyncWorker, redditSyncWorker, linkedinSyncWorker, posthogSyncWorker, bulkEnrichmentWorker, scoreSnapshotWorker, weeklyDigestWorker, dataExportWorker, demoCleanupWorker, anomalyDetectionWorker, alertEvaluationWorker, alertCheckWorker].forEach((w) => {
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
