/**
 * Anomaly Detection Job
 *
 * BullMQ job that runs hourly (or on-demand) to scan all active organizations
 * for signal anomalies. When an anomaly is detected, a Notification record is
 * created with type='signal_anomaly' so it appears in the in-app notification
 * feed and can be queried via the anomalies API.
 *
 * Cooldown: The same account + anomaly type combination will not generate a
 * repeat notification within 24 hours, preventing alert fatigue.
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { scanOrganizationAnomalies } from '../services/signal-anomaly';
import type { AnomalyResult } from '../services/signal-anomaly';
import { notifyOrgUsers } from '../services/notifications';

const COOLDOWN_HOURS = 24;

// ---------------------------------------------------------------------------
// Cooldown check — prevent duplicate notifications for the same anomaly
// ---------------------------------------------------------------------------

async function hasRecentAnomalyNotification(
  organizationId: string,
  accountId: string,
  anomalyType: string,
): Promise<boolean> {
  const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000);

  // Look for an existing notification for the same account + anomaly type
  // within the cooldown window. We store the anomaly type in the body JSON.
  const existing = await prisma.notification.findFirst({
    where: {
      organizationId,
      type: 'signal_anomaly',
      entityType: 'company',
      entityId: accountId,
      createdAt: { gte: cooldownSince },
      // Body contains the anomaly type as JSON — use a string contains check
      body: { contains: `"anomalyType":"${anomalyType}"` },
    },
    select: { id: true },
  });

  return existing !== null;
}

// ---------------------------------------------------------------------------
// Create anomaly notification for all org members
// ---------------------------------------------------------------------------

async function createAnomalyNotification(
  organizationId: string,
  anomaly: AnomalyResult,
): Promise<void> {
  const emoji = anomaly.anomalyType === 'SPIKE' ? 'Signal spike' : 'Signal drop';
  const severityLabel = anomaly.severity === 'high' ? 'significant' : 'notable';

  const title = `${emoji} detected for ${anomaly.accountName}`;

  const metadata = {
    anomalyType: anomaly.anomalyType,
    severity: anomaly.severity,
    todayCount: anomaly.todayCount,
    mean: anomaly.mean,
    stddev: anomaly.stddev,
    expectedMin: anomaly.expectedMin,
    expectedMax: anomaly.expectedMax,
    zScore: anomaly.zScore,
    accountName: anomaly.accountName,
  };

  const bodyDescription =
    anomaly.anomalyType === 'SPIKE'
      ? `${anomaly.accountName} has ${anomaly.todayCount} signals today, which is a ${severityLabel} increase above the expected range of ${anomaly.expectedMin}-${anomaly.expectedMax} (avg: ${anomaly.mean}/day).`
      : `${anomaly.accountName} has only ${anomaly.todayCount} signals today, which is a ${severityLabel} decrease below the expected range of ${anomaly.expectedMin}-${anomaly.expectedMax} (avg: ${anomaly.mean}/day).`;

  // Store both human-readable description and structured metadata in body as JSON
  const body = JSON.stringify({ ...metadata, description: bodyDescription });

  await notifyOrgUsers(organizationId, {
    type: 'signal_anomaly',
    title,
    body,
    entityType: 'company',
    entityId: anomaly.accountId,
  });

  logger.info('Anomaly notification created', {
    organizationId,
    accountId: anomaly.accountId,
    accountName: anomaly.accountName,
    anomalyType: anomaly.anomalyType,
    severity: anomaly.severity,
    todayCount: anomaly.todayCount,
    mean: anomaly.mean,
    zScore: anomaly.zScore,
  });
}

// ---------------------------------------------------------------------------
// Main job handler — called by the BullMQ worker
// ---------------------------------------------------------------------------

export interface AnomalyDetectionJobData {
  organizationId: string;
}

/**
 * Process anomaly detection for a single organization.
 * Returns the count of anomalies detected and notifications created.
 */
export async function processAnomalyDetection(
  organizationId: string,
): Promise<{ anomaliesDetected: number; notificationsCreated: number }> {
  const anomalies = await scanOrganizationAnomalies(organizationId);

  let notificationsCreated = 0;

  for (const anomaly of anomalies) {
    // Check cooldown to avoid duplicate notifications
    const alreadyNotified = await hasRecentAnomalyNotification(
      organizationId,
      anomaly.accountId,
      anomaly.anomalyType,
    );

    if (alreadyNotified) {
      logger.debug('Skipping anomaly notification (cooldown active)', {
        organizationId,
        accountId: anomaly.accountId,
        anomalyType: anomaly.anomalyType,
      });
      continue;
    }

    await createAnomalyNotification(organizationId, anomaly);
    notificationsCreated++;
  }

  return {
    anomaliesDetected: anomalies.length,
    notificationsCreated,
  };
}

/**
 * Enqueue anomaly detection for all active (non-demo) organizations.
 * Called by the scheduler sentinel pattern.
 */
export async function enqueueAnomalyDetectionForAllOrgs(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: {
      slug: { not: { startsWith: 'sigscore-demo' } },
    },
    select: { id: true },
  });

  return orgs.map((o) => o.id);
}
