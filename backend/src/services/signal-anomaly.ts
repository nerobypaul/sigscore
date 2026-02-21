/**
 * Signal Anomaly Detection Service
 *
 * Detects when an account's signal activity deviates significantly from its
 * rolling baseline using a z-score method. Anomalies are classified as SPIKE
 * (unusually high activity) or DROP (unusually low activity for an active account).
 *
 * Algorithm:
 *   1. Compute daily signal counts for the last 30 days
 *   2. Calculate mean and standard deviation of daily counts
 *   3. Compare today's count against the distribution
 *   4. Flag if today's count exceeds mean +/- 2*stddev
 *
 * Edge cases handled:
 *   - New accounts (< 7 days of data): skipped
 *   - Inactive accounts (mean < 1 signal/day): skipped
 *   - Zero-variance accounts (stddev = 0): skipped (consistent activity is not anomalous)
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnomalyType = 'SPIKE' | 'DROP';
export type AnomalySeverity = 'moderate' | 'high';

export interface AnomalyResult {
  accountId: string;
  accountName: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  todayCount: number;
  mean: number;
  stddev: number;
  expectedMin: number;
  expectedMax: number;
  zScore: number;
}

interface DailyCount {
  day: Date;
  count: bigint;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeStats(dailyCounts: number[]): { mean: number; stddev: number } {
  if (dailyCounts.length === 0) return { mean: 0, stddev: 0 };

  const sum = dailyCounts.reduce((a, b) => a + b, 0);
  const mean = sum / dailyCounts.length;

  if (dailyCounts.length < 2) return { mean, stddev: 0 };

  const squaredDiffs = dailyCounts.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / dailyCounts.length;
  const stddev = Math.sqrt(variance);

  return { mean, stddev };
}

// ---------------------------------------------------------------------------
// Core anomaly detection for a single account
// ---------------------------------------------------------------------------

export async function detectAccountAnomaly(
  organizationId: string,
  accountId: string,
): Promise<AnomalyResult | null> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get daily signal counts for the last 30 days using a raw query for efficiency.
  // This groups signals by calendar date and returns one row per day that has signals.
  const dailyCounts = await prisma.$queryRaw<DailyCount[]>`
    SELECT DATE_TRUNC('day', "timestamp") AS day, COUNT(*)::bigint AS count
    FROM "signals"
    WHERE "organizationId" = ${organizationId}
      AND "accountId" = ${accountId}
      AND "timestamp" >= ${thirtyDaysAgo}
      AND "timestamp" < ${todayStart}
    GROUP BY DATE_TRUNC('day', "timestamp")
    ORDER BY day
  `;

  // Determine how many distinct days are covered in the 30-day window
  const daysWithData = dailyCounts.length;

  // Edge case: new account with insufficient history
  if (daysWithData < 7) {
    return null;
  }

  // Build a full 30-day array (fill zero for days without signals)
  const dayMap = new Map<string, number>();
  for (const row of dailyCounts) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    dayMap.set(key, Number(row.count));
  }

  // Generate all dates from thirtyDaysAgo to yesterday
  const allDays: number[] = [];
  const cursor = new Date(thirtyDaysAgo);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < todayStart) {
    const key = cursor.toISOString().slice(0, 10);
    allDays.push(dayMap.get(key) ?? 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  const { mean, stddev } = computeStats(allDays);

  // Edge case: inactive account (mean < 1 signal/day)
  if (mean < 1) {
    return null;
  }

  // Edge case: zero variance (perfectly consistent activity)
  if (stddev === 0) {
    return null;
  }

  // Get today's signal count
  const todayCount = await prisma.signal.count({
    where: {
      organizationId,
      accountId,
      timestamp: { gte: todayStart },
    },
  });

  const zScore = (todayCount - mean) / stddev;
  const expectedMin = Math.max(0, Math.round(mean - 2 * stddev));
  const expectedMax = Math.round(mean + 2 * stddev);

  // Get account name for context
  const account = await prisma.company.findFirst({
    where: { id: accountId, organizationId },
    select: { name: true },
  });
  const accountName = account?.name ?? 'Unknown';

  // Check for SPIKE (z-score > 2)
  if (zScore >= 2) {
    const severity: AnomalySeverity = zScore >= 3 ? 'high' : 'moderate';
    return {
      accountId,
      accountName,
      anomalyType: 'SPIKE',
      severity,
      todayCount,
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      expectedMin,
      expectedMax,
      zScore: Math.round(zScore * 100) / 100,
    };
  }

  // Check for DROP (z-score < -2, only if account is active: mean > 3)
  if (zScore <= -2 && mean > 3) {
    const severity: AnomalySeverity = zScore <= -3 ? 'high' : 'moderate';
    return {
      accountId,
      accountName,
      anomalyType: 'DROP',
      severity,
      todayCount,
      mean: Math.round(mean * 100) / 100,
      stddev: Math.round(stddev * 100) / 100,
      expectedMin,
      expectedMax,
      zScore: Math.round(zScore * 100) / 100,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch anomaly scan for an entire organization
// ---------------------------------------------------------------------------

/**
 * Find all accounts with signals today and run anomaly detection on each.
 * Returns the list of detected anomalies.
 */
export async function scanOrganizationAnomalies(
  organizationId: string,
): Promise<AnomalyResult[]> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Find distinct accounts that received signals today
  const accountsWithSignals = await prisma.signal.findMany({
    where: {
      organizationId,
      accountId: { not: null },
      timestamp: { gte: todayStart },
    },
    distinct: ['accountId'],
    select: { accountId: true },
  });

  const accountIds = accountsWithSignals
    .map((s) => s.accountId)
    .filter((id): id is string => id !== null);

  if (accountIds.length === 0) {
    return [];
  }

  logger.debug('Running anomaly detection scan', {
    organizationId,
    accountCount: accountIds.length,
  });

  const anomalies: AnomalyResult[] = [];

  for (const accountId of accountIds) {
    try {
      const anomaly = await detectAccountAnomaly(organizationId, accountId);
      if (anomaly) {
        anomalies.push(anomaly);
      }
    } catch (err) {
      logger.error('Anomaly detection failed for account', {
        organizationId,
        accountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Query recent anomalies (stored as Notification records)
// ---------------------------------------------------------------------------

/**
 * Get recent signal anomaly notifications for an organization.
 * Optionally filtered by accountId. Returns the last 7 days by default.
 */
export async function getRecentAnomalies(
  organizationId: string,
  options: { accountId?: string; days?: number } = {},
) {
  const { accountId, days = 7 } = options;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    organizationId,
    type: 'signal_anomaly',
    createdAt: { gte: since },
  };

  if (accountId) {
    where.entityId = accountId;
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  // Parse the body as JSON metadata for richer API responses
  return notifications.map((n) => {
    let metadata: Record<string, unknown> = {};
    try {
      if (n.body) {
        metadata = JSON.parse(n.body);
      }
    } catch {
      // body is not JSON — use raw string
      metadata = { description: n.body };
    }

    return {
      id: n.id,
      title: n.title,
      accountId: n.entityId,
      metadata,
      read: n.read,
      createdAt: n.createdAt,
    };
  });
}
