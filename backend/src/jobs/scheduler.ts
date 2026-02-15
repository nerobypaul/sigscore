import { logger } from '../utils/logger';
import { signalSyncQueue, hubspotSyncQueue, discordSyncQueue, salesforceSyncQueue, stackoverflowSyncQueue, twitterSyncQueue, bulkEnrichmentQueue } from './queue';
import { getConnectedOrganizations } from '../services/hubspot-sync';
import { getConnectedOrganizations as getSalesforceConnectedOrganizations } from '../services/salesforce-sync';
import { getDiscordConnectedOrganizations } from '../services/discord-connector';
import { getStackOverflowConnectedOrganizations } from '../services/stackoverflow-connector';
import { getTwitterConnectedOrganizations } from '../services/twitter-connector';
import { getConnectedOrganizations as getClearbitConnectedOrganizations } from '../services/clearbit-enrichment';

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

  // Clearbit enrichment daily at 3 AM — auto-enrich new companies missing data.
  await bulkEnrichmentQueue.add(
    'clearbit-enrichment-scheduler',
    { organizationId: '__scheduler__', type: 'companies' as const },
    {
      repeat: { pattern: '0 3 * * *' },
      jobId: 'scheduled-clearbit-enrichment',
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
      { name: 'clearbit-enrichment', schedule: 'daily at 3 AM' },
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
