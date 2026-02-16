import { ScoreTier } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalsBySource {
  source: string;
  count: number;
}

export interface TopCompany {
  id: string;
  name: string;
  domain: string | null;
  signalCount: number;
  tier: ScoreTier | null;
  score: number | null;
}

export interface TierChange {
  companyId: string;
  companyName: string;
  previousTier: string;
  currentTier: string;
  currentScore: number;
  direction: 'up' | 'down';
}

export interface NextBestAction {
  type: 'hot_companies' | 'rising_accounts' | 'new_contacts' | 'stale_deals' | 'workflow_review';
  message: string;
  count: number;
  priority: 'high' | 'medium' | 'low';
}

export interface WeeklyDigestData {
  organizationId: string;
  organizationName: string;
  periodStart: Date;
  periodEnd: Date;

  // Signal summary
  totalSignals: number;
  signalsBySource: SignalsBySource[];

  // Top companies by signal volume
  topCompanies: TopCompany[];

  // Contacts
  newContactsCount: number;

  // PQA score changes
  tierChanges: TierChange[];

  // Workflows
  workflowsTriggered: number;
  workflowsSucceeded: number;
  workflowsFailed: number;

  // Actionable insights
  nextBestActions: NextBestAction[];
}

// ---------------------------------------------------------------------------
// generateWeeklyDigest — Build digest data for a single organization
// ---------------------------------------------------------------------------

export async function generateWeeklyDigest(
  organizationId: string,
): Promise<WeeklyDigestData> {
  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch organization name
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });

  // Run all queries in parallel for performance
  const [
    signalsBySourceRaw,
    totalSignals,
    topCompaniesRaw,
    newContactsCount,
    currentScores,
    previousSnapshots,
    workflowRunStats,
  ] = await Promise.all([
    // Signals grouped by source type
    prisma.$queryRaw<Array<{ type: string; count: bigint }>>`
      SELECT ss.type, COUNT(s.id)::bigint as count
      FROM signals s
      JOIN signal_sources ss ON s."sourceId" = ss.id
      WHERE s."organizationId" = ${organizationId}
        AND s.timestamp >= ${periodStart}
        AND s.timestamp <= ${periodEnd}
      GROUP BY ss.type
      ORDER BY count DESC
    `,

    // Total signal count
    prisma.signal.count({
      where: {
        organizationId,
        timestamp: { gte: periodStart, lte: periodEnd },
      },
    }),

    // Top 5 companies by signal count
    prisma.$queryRaw<Array<{ id: string; name: string; domain: string | null; signal_count: bigint }>>`
      SELECT c.id, c.name, c.domain, COUNT(s.id)::bigint as signal_count
      FROM companies c
      JOIN signals s ON s."accountId" = c.id
      WHERE c."organizationId" = ${organizationId}
        AND s.timestamp >= ${periodStart}
        AND s.timestamp <= ${periodEnd}
      GROUP BY c.id, c.name, c.domain
      ORDER BY signal_count DESC
      LIMIT 5
    `,

    // New contacts discovered this week
    prisma.contact.count({
      where: {
        organizationId,
        createdAt: { gte: periodStart, lte: periodEnd },
      },
    }),

    // Current account scores for this org
    prisma.accountScore.findMany({
      where: { organizationId },
      select: {
        accountId: true,
        score: true,
        tier: true,
        account: { select: { name: true } },
      },
    }),

    // Score snapshots from ~7 days ago (closest snapshot before period start)
    // We use the most recent snapshot captured before the period started.
    prisma.$queryRaw<Array<{ companyId: string; score: number }>>`
      SELECT DISTINCT ON ("companyId") "companyId", score
      FROM score_snapshots
      WHERE "organizationId" = ${organizationId}
        AND "capturedAt" < ${periodStart}
      ORDER BY "companyId", "capturedAt" DESC
    `,

    // Workflow runs this week
    prisma.workflowRun.groupBy({
      by: ['status'],
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
        workflow: { organizationId },
      },
      _count: { id: true },
    }),
  ]);

  // Process signals by source
  const signalsBySource: SignalsBySource[] = signalsBySourceRaw.map((row) => ({
    source: row.type,
    count: Number(row.count),
  }));

  // Process top companies, enriching with score data
  const scoreMap = new Map(
    currentScores.map((s) => [s.accountId, { score: s.score, tier: s.tier }]),
  );

  const topCompanies: TopCompany[] = topCompaniesRaw.map((row) => {
    const scoreData = scoreMap.get(row.id);
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      signalCount: Number(row.signal_count),
      tier: scoreData?.tier ?? null,
      score: scoreData?.score ?? null,
    };
  });

  // Detect tier changes by comparing current scores to previous snapshots
  const previousScoreMap = new Map(
    previousSnapshots.map((s) => [s.companyId, s.score]),
  );

  const tierFromScore = (score: number): string => {
    if (score >= 80) return 'HOT';
    if (score >= 50) return 'WARM';
    if (score >= 20) return 'COLD';
    return 'INACTIVE';
  };

  const tierChanges: TierChange[] = [];
  for (const current of currentScores) {
    const previousScore = previousScoreMap.get(current.accountId);
    if (previousScore === undefined) continue;

    const previousTier = tierFromScore(previousScore);
    const currentTier = current.tier;

    if (previousTier !== currentTier) {
      const tierOrder = ['INACTIVE', 'COLD', 'WARM', 'HOT'];
      const direction = tierOrder.indexOf(currentTier) > tierOrder.indexOf(previousTier) ? 'up' : 'down';
      tierChanges.push({
        companyId: current.accountId,
        companyName: current.account.name,
        previousTier,
        currentTier,
        currentScore: current.score,
        direction,
      });
    }
  }

  // Sort: tier-ups first, then by score descending
  tierChanges.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === 'up' ? -1 : 1;
    return b.currentScore - a.currentScore;
  });

  // Process workflow stats
  let workflowsTriggered = 0;
  let workflowsSucceeded = 0;
  let workflowsFailed = 0;
  for (const stat of workflowRunStats) {
    const count = stat._count.id;
    workflowsTriggered += count;
    if (stat.status === 'SUCCESS') workflowsSucceeded = count;
    if (stat.status === 'FAILED') workflowsFailed = count;
  }

  // Generate next-best-action suggestions
  const nextBestActions: NextBestAction[] = [];

  const hotCompanies = tierChanges.filter(
    (tc) => tc.direction === 'up' && tc.currentTier === 'HOT',
  );
  if (hotCompanies.length > 0) {
    nextBestActions.push({
      type: 'hot_companies',
      message: `${hotCompanies.length} ${hotCompanies.length === 1 ? 'company' : 'companies'} moved to HOT tier this week. Review and engage them now.`,
      count: hotCompanies.length,
      priority: 'high',
    });
  }

  const risingAccounts = tierChanges.filter((tc) => tc.direction === 'up');
  if (risingAccounts.length > hotCompanies.length) {
    const warmRising = risingAccounts.length - hotCompanies.length;
    nextBestActions.push({
      type: 'rising_accounts',
      message: `${warmRising} ${warmRising === 1 ? 'account' : 'accounts'} moved up a tier. Consider outreach to accelerate their journey.`,
      count: warmRising,
      priority: 'medium',
    });
  }

  if (newContactsCount > 0) {
    nextBestActions.push({
      type: 'new_contacts',
      message: `${newContactsCount} new ${newContactsCount === 1 ? 'contact' : 'contacts'} discovered. Enrich and route them to the right team.`,
      count: newContactsCount,
      priority: newContactsCount >= 10 ? 'high' : 'medium',
    });
  }

  // Check for stale deals (open deals with no activity this week)
  const staleDeals = await prisma.deal.count({
    where: {
      organizationId,
      stage: {
        notIn: ['CLOSED_WON', 'CLOSED_LOST'],
      },
      updatedAt: { lt: periodStart },
    },
  });

  if (staleDeals > 0) {
    nextBestActions.push({
      type: 'stale_deals',
      message: `${staleDeals} open ${staleDeals === 1 ? 'deal has' : 'deals have'} had no activity this week. Follow up to keep momentum.`,
      count: staleDeals,
      priority: staleDeals >= 5 ? 'high' : 'low',
    });
  }

  if (workflowsFailed > 0) {
    nextBestActions.push({
      type: 'workflow_review',
      message: `${workflowsFailed} workflow ${workflowsFailed === 1 ? 'run' : 'runs'} failed this week. Review your automation configuration.`,
      count: workflowsFailed,
      priority: 'medium',
    });
  }

  logger.info('Weekly digest data generated', {
    organizationId,
    totalSignals,
    topCompaniesCount: topCompanies.length,
    newContacts: newContactsCount,
    tierChanges: tierChanges.length,
    workflowsTriggered,
    nextBestActions: nextBestActions.length,
  });

  return {
    organizationId,
    organizationName: org.name,
    periodStart,
    periodEnd,
    totalSignals,
    signalsBySource,
    topCompanies,
    newContactsCount,
    tierChanges,
    workflowsTriggered,
    workflowsSucceeded,
    workflowsFailed,
    nextBestActions,
  };
}
