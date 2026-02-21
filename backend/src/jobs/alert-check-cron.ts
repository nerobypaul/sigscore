/**
 * Alert Check Cron Job
 *
 * Periodically evaluates time-based alert rules (engagement_drop, account_inactive)
 * that cannot be triggered by score recomputation alone. These rules depend on
 * the passage of time rather than score changes.
 *
 * Runs every 5 minutes via BullMQ repeatable job (configured in scheduler.ts).
 * Uses the __scheduler__ sentinel pattern: the scheduler fires once, then
 * this handler fans out to per-org evaluations.
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { alertCheckQueue } from './queue';
import type { AlertCheckJobData } from './queue';
import { evaluateTimeBasedAlerts } from './alert-evaluation';

/**
 * Process an alert-check job. If the organizationId is the scheduler sentinel,
 * fan out to individual per-org jobs. Otherwise, evaluate the specific org.
 */
export async function processAlertCheck(data: AlertCheckJobData): Promise<{
  scheduled?: boolean;
  evaluated?: number;
  triggered?: number;
}> {
  const { organizationId } = data;

  // Handle scheduler sentinel: enqueue individual jobs for all orgs with active time-based rules
  if (organizationId === '__scheduler__') {
    logger.info('Alert check scheduler triggered — finding orgs with time-based rules');

    // Only enqueue checks for orgs that actually have active time-based rules
    const orgsWithRules = await prisma.accountAlertRule.findMany({
      where: {
        enabled: true,
        triggerType: { in: ['engagement_drop', 'account_inactive'] },
      },
      select: { organizationId: true },
      distinct: ['organizationId'],
    });

    for (const { organizationId: orgId } of orgsWithRules) {
      await alertCheckQueue.add(
        'check-alerts',
        { organizationId: orgId },
        { jobId: `alert-check-${orgId}-${Date.now()}` },
      );
    }

    logger.info('Alert check jobs enqueued', { orgCount: orgsWithRules.length });
    return { scheduled: true };
  }

  // Evaluate time-based alerts for this specific organization
  logger.info('Evaluating time-based alerts for organization', { organizationId });

  const result = await evaluateTimeBasedAlerts(organizationId);

  logger.info('Time-based alert evaluation completed', {
    organizationId,
    evaluated: result.evaluated,
    triggered: result.triggered,
  });

  return result;
}
