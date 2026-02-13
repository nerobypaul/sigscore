import { DealStage } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Analytics service — aggregated metrics for the organization dashboard.
 *
 * All functions enforce organizationId scoping for multi-tenant isolation.
 */

// ---------------------------------------------------------------------------
// getOverview
// ---------------------------------------------------------------------------

export interface OverviewStats {
  totalContacts: number;
  totalCompanies: number;
  totalDeals: number;
  totalSignals: number;
  newContactsThisWeek: number;
  pipelineValue: number;
  closedWonValue: number;
  conversionRate: number;
}

export const getOverview = async (organizationId: string): Promise<OverviewStats> => {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalContacts,
    totalCompanies,
    totalDeals,
    totalSignals,
    newContactsThisWeek,
    pipelineAgg,
    closedWonAgg,
    closedWonCount,
  ] = await Promise.all([
    prisma.contact.count({ where: { organizationId } }),
    prisma.company.count({ where: { organizationId } }),
    prisma.deal.count({ where: { organizationId } }),
    prisma.signal.count({ where: { organizationId } }),
    prisma.contact.count({
      where: { organizationId, createdAt: { gte: weekAgo } },
    }),
    // Pipeline value: sum of amounts for deals that are NOT closed
    prisma.deal.aggregate({
      where: {
        organizationId,
        stage: { notIn: [DealStage.CLOSED_WON, DealStage.CLOSED_LOST] },
      },
      _sum: { amount: true },
    }),
    // Closed-won value
    prisma.deal.aggregate({
      where: { organizationId, stage: DealStage.CLOSED_WON },
      _sum: { amount: true },
    }),
    prisma.deal.count({
      where: { organizationId, stage: DealStage.CLOSED_WON },
    }),
  ]);

  const pipelineValue = pipelineAgg._sum.amount ?? 0;
  const closedWonValue = closedWonAgg._sum.amount ?? 0;
  const conversionRate =
    totalDeals > 0
      ? Math.round((closedWonCount / totalDeals) * 100 * 100) / 100
      : 0;

  return {
    totalContacts,
    totalCompanies,
    totalDeals,
    totalSignals,
    newContactsThisWeek,
    pipelineValue,
    closedWonValue,
    conversionRate,
  };
};

// ---------------------------------------------------------------------------
// getSignalTrends
// ---------------------------------------------------------------------------

export interface SignalTrendPoint {
  date: string;
  count: number;
}

export const getSignalTrends = async (
  organizationId: string,
  days = 30,
): Promise<SignalTrendPoint[]> => {
  const safeDays = Math.max(1, Math.min(days, 365));

  const trends = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>`
    SELECT DATE("timestamp") as date, COUNT(*) as count
    FROM signals
    WHERE "organizationId" = ${organizationId}
      AND "timestamp" >= CURRENT_DATE - ${safeDays}::integer
    GROUP BY DATE("timestamp")
    ORDER BY date
  `;

  return trends.map((row) => ({
    date: row.date instanceof Date
      ? row.date.toISOString().split('T')[0]
      : String(row.date),
    count: Number(row.count),
  }));
};

// ---------------------------------------------------------------------------
// getPqaDistribution
// ---------------------------------------------------------------------------

export interface PqaDistribution {
  HOT: number;
  WARM: number;
  COLD: number;
  INACTIVE: number;
}

export const getPqaDistribution = async (
  organizationId: string,
): Promise<PqaDistribution> => {
  const groups = await prisma.accountScore.groupBy({
    by: ['tier'],
    where: { organizationId },
    _count: true,
  });

  const distribution: PqaDistribution = {
    HOT: 0,
    WARM: 0,
    COLD: 0,
    INACTIVE: 0,
  };

  for (const group of groups) {
    distribution[group.tier] = group._count;
  }

  return distribution;
};

// ---------------------------------------------------------------------------
// getPipelineFunnel
// ---------------------------------------------------------------------------

const PLG_STAGE_ORDER: DealStage[] = [
  DealStage.ANONYMOUS_USAGE,
  DealStage.IDENTIFIED,
  DealStage.ACTIVATED,
  DealStage.TEAM_ADOPTION,
  DealStage.EXPANSION_SIGNAL,
  DealStage.SALES_QUALIFIED,
  DealStage.NEGOTIATION,
  DealStage.CLOSED_WON,
  DealStage.CLOSED_LOST,
];

export interface PipelineStage {
  stage: DealStage;
  count: number;
  value: number;
}

export const getPipelineFunnel = async (
  organizationId: string,
): Promise<PipelineStage[]> => {
  const [countGroups, valueGroups] = await Promise.all([
    prisma.deal.groupBy({
      by: ['stage'],
      where: { organizationId },
      _count: true,
    }),
    prisma.deal.groupBy({
      by: ['stage'],
      where: { organizationId },
      _sum: { amount: true },
    }),
  ]);

  const countMap = new Map(countGroups.map((g) => [g.stage, g._count]));
  const valueMap = new Map(valueGroups.map((g) => [g.stage, g._sum.amount ?? 0]));

  return PLG_STAGE_ORDER.map((stage) => ({
    stage,
    count: countMap.get(stage) ?? 0,
    value: valueMap.get(stage) ?? 0,
  }));
};

// ---------------------------------------------------------------------------
// getTopSignalTypes
// ---------------------------------------------------------------------------

export interface SignalTypeCount {
  type: string;
  count: number;
}

export const getTopSignalTypes = async (
  organizationId: string,
  limit = 10,
): Promise<SignalTypeCount[]> => {
  const safeLimit = Math.max(1, Math.min(limit, 100));

  // Current month boundaries
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups = await prisma.signal.groupBy({
    by: ['type'],
    where: {
      organizationId,
      timestamp: { gte: startOfMonth },
    },
    _count: true,
    orderBy: { _count: { type: 'desc' } },
    take: safeLimit,
  });

  return groups.map((g) => ({
    type: g.type,
    count: g._count,
  }));
};
