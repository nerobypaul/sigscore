import { logger } from '../utils/logger';
import { signalSyncQueue, hubspotSyncQueue, discordSyncQueue, salesforceSyncQueue } from './queue';
import { getConnectedOrganizations } from '../services/hubspot-sync';
import { getConnectedOrganizations as getSalesforceConnectedOrganizations } from '../services/salesforce-sync';
import { getDiscordConnectedOrganizations } from '../services/discord-connector';

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

  logger.info('BullMQ scheduled jobs configured', {
    jobs: [
      { name: 'sync-all-npm', schedule: 'every 6 hours' },
      { name: 'sync-all-pypi', schedule: 'every 12 hours' },
      { name: 'hubspot-sync', schedule: 'every 15 minutes' },
      { name: 'discord-sync', schedule: 'every 30 minutes' },
      { name: 'salesforce-sync', schedule: 'every 15 minutes' },
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
