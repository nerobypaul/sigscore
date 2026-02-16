import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoreBreakdown {
  userCount: number;
  velocity: number;
  featureBreadth: number;
  engagement: number;
  seniority: number;
  firmographic: number;
}

interface SnapshotRecord {
  id: string;
  companyId: string;
  score: number;
  breakdown: ScoreBreakdown | null;
  capturedAt: Date;
}

interface OrgScorePoint {
  capturedAt: Date;
  avg: number;
  min: number;
  max: number;
  count: number;
}

// ---------------------------------------------------------------------------
// captureScoreSnapshots — Capture current PQA scores for all companies in org
// ---------------------------------------------------------------------------

/**
 * Reads the latest AccountScore for every company in the given org and
 * persists a ScoreSnapshot row for each one. This is the core operation
 * that the scheduled BullMQ job invokes.
 *
 * Returns the number of snapshots created.
 */
export const captureScoreSnapshots = async (
  organizationId: string,
): Promise<{ captured: number }> => {
  const scores = await prisma.accountScore.findMany({
    where: { organizationId },
    select: {
      accountId: true,
      score: true,
      factors: true,
      userCount: true,
    },
  });

  if (scores.length === 0) {
    logger.debug('No account scores to snapshot', { organizationId });
    return { captured: 0 };
  }

  const now = new Date();

  // Build breakdown from factors array stored on AccountScore
  const snapshotData = scores.map((s) => {
    const factors = (s.factors as unknown as Array<{ name: string; value: number }>) || [];
    const factorMap: Record<string, number> = {};
    for (const f of factors) {
      factorMap[f.name] = f.value;
    }

    const breakdown: ScoreBreakdown = {
      userCount: factorMap['user_count'] ?? 0,
      velocity: factorMap['usage_velocity'] ?? 0,
      featureBreadth: factorMap['feature_breadth'] ?? 0,
      engagement: factorMap['engagement_recency'] ?? 0,
      seniority: factorMap['seniority_signals'] ?? 0,
      firmographic: factorMap['firmographic_fit'] ?? 0,
    };

    return {
      organizationId,
      companyId: s.accountId,
      score: s.score,
      breakdown: breakdown as unknown as Prisma.InputJsonValue,
      capturedAt: now,
    };
  });

  // Bulk insert via createMany for efficiency
  const result = await prisma.scoreSnapshot.createMany({
    data: snapshotData,
  });

  logger.info('Score snapshots captured', {
    organizationId,
    captured: result.count,
  });

  return { captured: result.count };
};

// ---------------------------------------------------------------------------
// getScoreHistory — Get score snapshots for a single company over time
// ---------------------------------------------------------------------------

/**
 * Returns chronologically-ordered score snapshots for a given company.
 * Defaults to the last 30 days if `days` is not specified.
 */
export const getScoreHistory = async (
  companyId: string,
  organizationId: string,
  days = 30,
): Promise<SnapshotRecord[]> => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.scoreSnapshot.findMany({
    where: {
      companyId,
      organizationId,
      capturedAt: { gte: since },
    },
    orderBy: { capturedAt: 'asc' },
    select: {
      id: true,
      companyId: true,
      score: true,
      breakdown: true,
      capturedAt: true,
    },
  });

  return snapshots.map((s) => ({
    ...s,
    breakdown: s.breakdown as unknown as ScoreBreakdown | null,
  }));
};

// ---------------------------------------------------------------------------
// getOrgScoreOverview — Aggregated org-level score trends over time
// ---------------------------------------------------------------------------

/**
 * Returns daily aggregated score statistics (avg/min/max/count) for all
 * companies in the organization. Useful for org-level trend dashboards.
 * Defaults to the last 30 days.
 */
export const getOrgScoreOverview = async (
  organizationId: string,
  days = 30,
): Promise<OrgScorePoint[]> => {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Use raw SQL for DATE_TRUNC aggregation — Prisma does not support
  // groupBy with date truncation natively.
  const rows = await prisma.$queryRaw<
    Array<{
      day: Date;
      avg_score: number;
      min_score: number;
      max_score: number;
      snapshot_count: bigint;
    }>
  >`
    SELECT
      DATE_TRUNC('day', "capturedAt") AS day,
      AVG(score)::int                 AS avg_score,
      MIN(score)                      AS min_score,
      MAX(score)                      AS max_score,
      COUNT(*)                        AS snapshot_count
    FROM "score_snapshots"
    WHERE "organizationId" = ${organizationId}
      AND "capturedAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  return rows.map((r) => ({
    capturedAt: r.day,
    avg: r.avg_score,
    min: r.min_score,
    max: r.max_score,
    count: Number(r.snapshot_count),
  }));
};
