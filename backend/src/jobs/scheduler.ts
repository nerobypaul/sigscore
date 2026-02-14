import { logger } from '../utils/logger';
import { signalSyncQueue } from './queue';

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

  logger.info('BullMQ scheduled jobs configured', {
    jobs: [
      { name: 'sync-all-npm', schedule: 'every 6 hours' },
      { name: 'sync-all-pypi', schedule: 'every 12 hours' },
    ],
  });
};
