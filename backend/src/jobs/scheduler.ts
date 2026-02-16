import { logger } from '../utils/logger';
import { signalSyncQueue, hubspotSyncQueue, discordSyncQueue, salesforceSyncQueue, stackoverflowSyncQueue, twitterSyncQueue, redditSyncQueue, linkedinSyncQueue, posthogSyncQueue, bulkEnrichmentQueue, scoreSnapshotQueue } from './queue';
import { getConnectedOrganizations } from '../services/hubspot-sync';
import { getConnectedOrganizations as getSalesforceConnectedOrganizations } from '../services/salesforce-sync';
import { getDiscordConnectedOrganizations } from '../services/discord-connector';
import { getStackOverflowConnectedOrganizations } from '../services/stackoverflow-connector';
import { getTwitterConnectedOrganizations } from '../services/twitter-connector';
import { getRedditConnectedOrganizations } from '../services/reddit-connector';
import { getLinkedInConnectedOrganizations } from '../services/linkedin-connector';
import { getPostHogConnectedOrganizations } from '../services/posthog-connector';
import { getConnectedOrganizations as getClearbitConnectedOrganizations } from '../services/clearbit-enrichment';
import { prisma } from '../config/database';

/**
 * Set up recurring (cron-based) jobs using BullMQ's built-in repeatable jobs.
 * Call once at server startup alongside startWorkers().
 */
export const setupScheduler = async (): Promise<void> => {
  logger.info('Setting up BullMQ scheduled jobs...');

  // Sync all npm sources every 6 hours
  await signalSyncQueue.add(
    'sync-all-npm',
    { type: 'npm' as const },
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'scheduled-sync-all-npm',
    },
  );

  // Sync all pypi sources every 12 hours
  await signalSyncQueue.add(
    'sync-all-pypi',
    { type: 'pypi' as const },
    {
      repeat: { pattern: '0 */12 * * *' },
      jobId: 'scheduled-sync-all-pypi',
    },
  );

  // HubSpot sync every 15 minutes for all connected organizations.
  // We use a repeatable job that queries connected orgs and enqueues
  // individual sync jobs for each one.
  await hubspotSyncQueue.add(
    'hubspot-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'scheduled-hubspot-sync',
    },
  );

  // Discord sync every 30 minutes for all connected organizations.
  await discordSyncQueue.add(
    'discord-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '*/30 * * * *' },
      jobId: 'scheduled-discord-sync',
    },
  );

  // Salesforce sync every 15 minutes for all connected organizations.
  await salesforceSyncQueue.add(
    'salesforce-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'scheduled-salesforce-sync',
    },
  );

  // Stack Overflow sync every 6 hours for all connected organizations.
  // Questions don't change rapidly, so a lower frequency is appropriate.
  await stackoverflowSyncQueue.add(
    'stackoverflow-sync-scheduler',
    { organizationId: '__scheduler__', type: 'incremental' as const },
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'scheduled-stackoverflow-sync',
    },
  );

  // Twitter/X sync every 30 minutes for all connected organizations.
  // Mentions are time-sensitive -- 30 minutes keeps signal fresh.
  await twitterSyncQueue.add(
    'twitter-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '*/30 * * * *' },
      jobId: 'scheduled-twitter-sync',
    },
  );

  // Reddit sync every 2 hours for all connected organizations.
  // Reddit content is less time-sensitive than real-time chat.
  await redditSyncQueue.add(
    'reddit-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '0 */2 * * *' },
      jobId: 'scheduled-reddit-sync',
    },
  );

  // LinkedIn sync every 6 hours for all connected organizations.
  // LinkedIn is primarily webhook/import driven; this is a periodic housekeeping sweep.
  await linkedinSyncQueue.add(
    'linkedin-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'scheduled-linkedin-sync',
    },
  );

  // PostHog sync every hour for all connected organizations.
  // Product analytics events are valuable and time-sensitive.
  await posthogSyncQueue.add(
    'posthog-sync-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '0 * * * *' },
      jobId: 'scheduled-posthog-sync',
    },
  );

  // Clearbit enrichment daily at 3 AM — auto-enrich new companies missing data.
  await bulkEnrichmentQueue.add(
    'clearbit-enrichment-scheduler',
    { organizationId: '__scheduler__', type: 'companies' as const },
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'scheduled-clearbit-enrichment',
    },
  );

  // Score snapshots daily at 2 AM — capture PQA scores for trend tracking.
  await scoreSnapshotQueue.add(
    'score-snapshot-scheduler',
    { organizationId: '__scheduler__' },
    {
      repeat: { pattern: '0 2 * * *' },
      jobId: 'scheduled-score-snapshot',
    },
  );

  logger.info('BullMQ scheduled jobs configured', {
    jobs: [
      { name: 'sync-all-npm', schedule: 'every 6 hours' },
      { name: 'sync-all-pypi', schedule: 'every 12 hours' },
      { name: 'hubspot-sync', schedule: 'every 15 minutes' },
      { name: 'discord-sync', schedule: 'every 30 minutes' },
      { name: 'salesforce-sync', schedule: 'every 15 minutes' },
      { name: 'stackoverflow-sync', schedule: 'every 6 hours' },
      { name: 'twitter-sync', schedule: 'every 30 minutes' },
      { name: 'reddit-sync', schedule: 'every 2 hours' },
      { name: 'linkedin-sync', schedule: 'every 6 hours' },
      { name: 'posthog-sync', schedule: 'every hour' },
      { name: 'clearbit-enrichment', schedule: 'daily at 3 AM' },
      { name: 'score-snapshot', schedule: 'daily at 2 AM' },
    ],
  });
};

/**
 * Resolve scheduled HubSpot sync into per-org jobs.
 * Called by the HubSpot sync worker when it sees the scheduler sentinel.
 */
export async function enqueueHubSpotSyncForAllConnected(): Promise<void> {
  const orgIds = await getConnectedOrganizations();
  for (const orgId of orgIds) {
    await hubspotSyncQueue.add(
      'hubspot-sync',
      { organizationId: orgId, fullSync: false },
      { jobId: `hubspot-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled HubSpot sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled Discord sync into per-org jobs.
 * Called by the Discord sync worker when it sees the scheduler sentinel.
 */
/**
 * Resolve scheduled Salesforce sync into per-org jobs.
 * Called by the Salesforce sync worker when it sees the scheduler sentinel.
 */
export async function enqueueSalesforceSyncForAllConnected(): Promise<void> {
  const orgIds = await getSalesforceConnectedOrganizations();
  for (const orgId of orgIds) {
    await salesforceSyncQueue.add(
      'salesforce-sync',
      { organizationId: orgId, fullSync: false },
      { jobId: `salesforce-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled Salesforce sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

export async function enqueueDiscordSyncForAllConnected(): Promise<void> {
  const orgIds = await getDiscordConnectedOrganizations();
  for (const orgId of orgIds) {
    await discordSyncQueue.add(
      'discord-sync',
      { organizationId: orgId },
      { jobId: `discord-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled Discord sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled Stack Overflow sync into per-org jobs.
 * Called by the Stack Overflow sync worker when it sees the scheduler sentinel.
 */
export async function enqueueStackOverflowSyncForAllConnected(): Promise<void> {
  const orgIds = await getStackOverflowConnectedOrganizations();
  for (const orgId of orgIds) {
    await stackoverflowSyncQueue.add(
      'stackoverflow-sync',
      { organizationId: orgId, type: 'incremental' as const },
      { jobId: `stackoverflow-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled Stack Overflow sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled Twitter sync into per-org jobs.
 * Called by the Twitter sync worker when it sees the scheduler sentinel.
 */
export async function enqueueTwitterSyncForAllConnected(): Promise<void> {
  const orgIds = await getTwitterConnectedOrganizations();
  for (const orgId of orgIds) {
    await twitterSyncQueue.add(
      'twitter-sync',
      { organizationId: orgId },
      { jobId: `twitter-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled Twitter sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled Reddit sync into per-org jobs.
 * Called by the Reddit sync worker when it sees the scheduler sentinel.
 */
export async function enqueueRedditSyncForAllConnected(): Promise<void> {
  const orgIds = await getRedditConnectedOrganizations();
  for (const orgId of orgIds) {
    await redditSyncQueue.add(
      'reddit-sync',
      { organizationId: orgId },
      { jobId: `reddit-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled Reddit sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled LinkedIn sync into per-org jobs.
 * Called by the LinkedIn sync worker when it sees the scheduler sentinel.
 */
export async function enqueueLinkedInSyncForAllConnected(): Promise<void> {
  const orgIds = await getLinkedInConnectedOrganizations();
  for (const orgId of orgIds) {
    await linkedinSyncQueue.add(
      'linkedin-sync',
      { organizationId: orgId },
      { jobId: `linkedin-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled LinkedIn sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled PostHog sync into per-org jobs.
 * Called by the PostHog sync worker when it sees the scheduler sentinel.
 */
export async function enqueuePostHogSyncForAllConnected(): Promise<void> {
  const orgIds = await getPostHogConnectedOrganizations();
  for (const orgId of orgIds) {
    await posthogSyncQueue.add(
      'posthog-sync',
      { organizationId: orgId },
      { jobId: `posthog-sync-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled PostHog sync enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled Clearbit enrichment into per-org jobs.
 * Called by the bulk enrichment worker when it sees the scheduler sentinel.
 * Enqueues company enrichment for all orgs with Clearbit connected.
 */
export async function enqueueClearbitEnrichmentForAllConnected(): Promise<void> {
  const orgIds = await getClearbitConnectedOrganizations();
  for (const orgId of orgIds) {
    await bulkEnrichmentQueue.add(
      'bulk-enrich-companies',
      { organizationId: orgId, type: 'companies' as const },
      { jobId: `clearbit-enrich-${orgId}-${Date.now()}` },
    );
  }
  logger.info('Scheduled Clearbit enrichment enqueued for connected orgs', {
    count: orgIds.length,
  });
}

/**
 * Resolve scheduled score snapshot into per-org jobs.
 * Called by the score snapshot worker when it sees the scheduler sentinel.
 * Queries all organizations and enqueues a snapshot job for each.
 */
export async function enqueueScoreSnapshotForAllOrgs(): Promise<void> {
  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });
  for (const org of orgs) {
    await scoreSnapshotQueue.add(
      'capture-score-snapshot',
      { organizationId: org.id },
      { jobId: `score-snapshot-${org.id}-${Date.now()}` },
    );
  }
  logger.info('Scheduled score snapshots enqueued for all orgs', {
    count: orgs.length,
  });
}
