import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Advanced Analytics service — cohort analysis, funnel visualization,
 * signal trends by type, tier movement tracking, top movers, and source attribution.
 *
 * All functions enforce organizationId scoping for multi-tenant isolation.
 * Uses Prisma raw queries for complex aggregations where needed.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CohortRow {
  period: string;
  size: number;
  values: number[];
}

export interface CohortResult {
  cohorts: CohortRow[];
  periodLabels: string[];
}

export interface FunnelStage {
  name: string;
  count: number;
  conversionRate: number;
  dropoff: number;
}

export interface FunnelResult {
  stages: FunnelStage[];
}

export interface TrendSeries {
  type: string;
  data: number[];
}

export interface TrendResult {
  dates: string[];
  series: TrendSeries[];
  total: number;
}

export interface TierMovementEntry {
  from: string;
  to: string;
  count: number;
}

export interface TierMovementResult {
  upgrades: TierMovementEntry[];
  downgrades: TierMovementEntry[];
  net: number;
}

export interface TopMoverAccount {
  accountId: string;
  name: string;
  domain: string | null;
  scoreDelta: number;
  currentScore: number;
  currentTier: string;
}

export interface TopMoversResult {
  risers: TopMoverAccount[];
  fallers: TopMoverAccount[];
}

export interface SourceAttributionEntry {
  source: string;
  signalCount: number;
  uniqueAccounts: number;
  avgScore: number;
}

export interface SourceAttributionResult {
  sources: SourceAttributionEntry[];
}

// ---------------------------------------------------------------------------
// Cohort Analysis
// ---------------------------------------------------------------------------

const TIER_RANK: Record<string, number> = { HOT: 4, WARM: 3, COLD: 2, INACTIVE: 1 };

export const getAccountCohorts = async (
  organizationId: string,
  options: { period?: 'week' | 'month'; metric?: 'signals' | 'score' | 'contacts'; months?: number } = {},
): Promise<CohortResult> => {
  const { period = 'month', metric = 'signals', months = 6 } = options;
  const safeMonths = Math.max(1, Math.min(months, 24));

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - safeMonths);

  try {
    // Step 1: Find when each account was first seen (first signal timestamp)
    const firstSeen = await prisma.$queryRaw<Array<{ accountId: string; first_seen: Date }>>`
      SELECT "accountId", MIN("timestamp") as first_seen
      FROM signals
      WHERE "organizationId" = ${organizationId}
        AND "accountId" IS NOT NULL
        AND "timestamp" >= ${cutoffDate}
      GROUP BY "accountId"
    `;

    if (firstSeen.length === 0) {
      return { cohorts: [], periodLabels: [] };
    }

    // Step 2: Build cohort map — group accounts by their first-seen period
    const cohortMap = new Map<string, Set<string>>();
    for (const row of firstSeen) {
      const d = new Date(row.first_seen);
      const key = period === 'week'
        ? getISOWeek(d)
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!cohortMap.has(key)) cohortMap.set(key, new Set());
      cohortMap.get(key)!.add(row.accountId);
    }

    // Step 3: Sort cohort periods
    const sortedPeriods = Array.from(cohortMap.keys()).sort();

    // Step 4: For each cohort, compute metric values for each subsequent period
    type SignalRow = { accountId: string; period_key: string; signal_count: bigint };
    const allSignals: SignalRow[] = period === 'week'
      ? await prisma.$queryRaw<SignalRow[]>`
          SELECT
            "accountId",
            TO_CHAR(DATE_TRUNC('week', "timestamp"), 'IYYY-"W"IW') as period_key,
            COUNT(*) as signal_count
          FROM signals
          WHERE "organizationId" = ${organizationId}
            AND "accountId" IS NOT NULL
            AND "timestamp" >= ${cutoffDate}
          GROUP BY "accountId", period_key
        `.catch(() => [] as SignalRow[])
      : await prisma.$queryRaw<SignalRow[]>`
          SELECT
            "accountId",
            TO_CHAR(DATE_TRUNC('month', "timestamp"), 'YYYY-MM') as period_key,
            COUNT(*) as signal_count
          FROM signals
          WHERE "organizationId" = ${organizationId}
            AND "accountId" IS NOT NULL
            AND "timestamp" >= ${cutoffDate}
          GROUP BY "accountId", period_key
        `.catch(() => [] as SignalRow[]);

    // Build a lookup: accountId -> period -> signalCount
    const activityMap = new Map<string, Map<string, number>>();
    for (const row of allSignals) {
      if (!activityMap.has(row.accountId)) activityMap.set(row.accountId, new Map());
      activityMap.get(row.accountId)!.set(row.period_key, Number(row.signal_count));
    }

    // Step 5: Generate all period labels from first cohort to now
    const allPeriodLabels = generatePeriodLabels(sortedPeriods[0], period);

    // Step 6: Build cohort rows
    const cohorts: CohortRow[] = sortedPeriods.map((cohortPeriod) => {
      const accountIds = cohortMap.get(cohortPeriod)!;
      const cohortStartIdx = allPeriodLabels.indexOf(cohortPeriod);
      const values: number[] = [];

      for (let i = cohortStartIdx; i < allPeriodLabels.length; i++) {
        const periodLabel = allPeriodLabels[i];
        let val = 0;

        if (metric === 'signals') {
          // Sum signals from cohort accounts in this period
          for (const aid of accountIds) {
            val += activityMap.get(aid)?.get(periodLabel) ?? 0;
          }
        } else if (metric === 'contacts') {
          // Count of cohort accounts that have any signal in this period
          for (const aid of accountIds) {
            if ((activityMap.get(aid)?.get(periodLabel) ?? 0) > 0) val++;
          }
        } else {
          // score: for now, use signal count as a proxy
          for (const aid of accountIds) {
            val += activityMap.get(aid)?.get(periodLabel) ?? 0;
          }
        }

        values.push(val);
      }

      return {
        period: cohortPeriod,
        size: accountIds.size,
        values,
      };
    });

    return { cohorts, periodLabels: allPeriodLabels };
  } catch (error) {
    logger.error('Cohort analysis error:', error);
    return { cohorts: [], periodLabels: [] };
  }
};

// ---------------------------------------------------------------------------
// Funnel Analysis
// ---------------------------------------------------------------------------

const DEFAULT_FUNNEL_STAGES = ['github_star', 'docs_view', 'signup', 'api_call', 'feature_usage'];

export const getSignalFunnel = async (
  organizationId: string,
  options: { stages?: string[] } = {},
): Promise<FunnelResult> => {
  const stages = options.stages && options.stages.length > 0 ? options.stages : DEFAULT_FUNNEL_STAGES;

  try {
    // For each stage, count unique accounts with that signal type
    const stageCounts = await Promise.all(
      stages.map(async (stage) => {
        const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(DISTINCT "accountId") as count
          FROM signals
          WHERE "organizationId" = ${organizationId}
            AND "type" = ${stage}
            AND "accountId" IS NOT NULL
        `;
        return { name: stage, count: Number(result[0]?.count ?? 0) };
      }),
    );

    // Compute conversion rates and dropoffs
    const funnelStages: FunnelStage[] = stageCounts.map((stage, i) => {
      const prevCount = i === 0 ? stage.count : stageCounts[i - 1].count;
      const conversionRate = prevCount > 0 ? Math.round((stage.count / prevCount) * 100 * 10) / 10 : 0;
      const dropoff = i === 0 ? 0 : Math.max(0, prevCount - stage.count);

      return {
        name: stage.name,
        count: stage.count,
        conversionRate: i === 0 ? 100 : conversionRate,
        dropoff,
      };
    });

    return { stages: funnelStages };
  } catch (error) {
    logger.error('Funnel analysis error:', error);
    return { stages: [] };
  }
};

// ---------------------------------------------------------------------------
// Signal Trends (by type)
// ---------------------------------------------------------------------------

export const getSignalTrends = async (
  organizationId: string,
  options: { days?: number; groupBy?: 'day' | 'week' } = {},
): Promise<TrendResult> => {
  const { days = 30, groupBy = 'day' } = options;
  const safeDays = Math.max(1, Math.min(days, 365));

  try {
    const truncFn = groupBy === 'week' ? 'week' : 'day';

    const rows = await prisma.$queryRaw<
      Array<{ period_date: Date; signal_type: string; count: bigint }>
    >`
      SELECT
        DATE_TRUNC(${truncFn}, "timestamp")::date as period_date,
        "type" as signal_type,
        COUNT(*) as count
      FROM signals
      WHERE "organizationId" = ${organizationId}
        AND "timestamp" >= CURRENT_DATE - ${safeDays}::integer
      GROUP BY period_date, signal_type
      ORDER BY period_date
    `;

    if (rows.length === 0) {
      return { dates: [], series: [], total: 0 };
    }

    // Collect all unique dates and types
    const dateSet = new Set<string>();
    const typeSet = new Set<string>();
    const dataMap = new Map<string, Map<string, number>>();

    for (const row of rows) {
      const dateStr = row.period_date instanceof Date
        ? row.period_date.toISOString().split('T')[0]
        : String(row.period_date);
      dateSet.add(dateStr);
      typeSet.add(row.signal_type);

      if (!dataMap.has(row.signal_type)) dataMap.set(row.signal_type, new Map());
      dataMap.get(row.signal_type)!.set(dateStr, Number(row.count));
    }

    const dates = Array.from(dateSet).sort();
    const series: TrendSeries[] = Array.from(typeSet)
      .sort()
      .map((type) => ({
        type,
        data: dates.map((d) => dataMap.get(type)?.get(d) ?? 0),
      }));

    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);

    return { dates, series, total };
  } catch (error) {
    logger.error('Signal trends error:', error);
    return { dates: [], series: [], total: 0 };
  }
};

// ---------------------------------------------------------------------------
// Tier Movement
// ---------------------------------------------------------------------------

export const getTierMovement = async (
  organizationId: string,
  options: { days?: number } = {},
): Promise<TierMovementResult> => {
  const { days = 30 } = options;
  const safeDays = Math.max(1, Math.min(days, 365));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - safeDays);

  try {
    // Look at audit logs for score_changed events that include tier transitions
    // Since we may not have explicit tier-change history, we compute from AccountScore's
    // updatedAt + trend as a proxy, or from workflow runs with score_changed trigger.
    // For a robust approach: query workflow runs with score_changed trigger data.
    const runs = await prisma.workflowRun.findMany({
      where: {
        workflow: { organizationId },
        status: 'SUCCESS',
        createdAt: { gte: cutoff },
      },
      select: { triggerData: true },
    });

    const upgrades = new Map<string, number>();
    const downgrades = new Map<string, number>();

    for (const run of runs) {
      const data = run.triggerData as Record<string, unknown> | null;
      if (!data || data.oldTier === undefined || data.newTier === undefined) continue;

      const oldTier = String(data.oldTier);
      const newTier = String(data.newTier);
      if (oldTier === newTier) continue;

      const key = `${oldTier}->${newTier}`;
      const isUpgrade = (TIER_RANK[newTier] ?? 0) > (TIER_RANK[oldTier] ?? 0);

      if (isUpgrade) {
        upgrades.set(key, (upgrades.get(key) ?? 0) + 1);
      } else {
        downgrades.set(key, (downgrades.get(key) ?? 0) + 1);
      }
    }

    const upgradeEntries: TierMovementEntry[] = Array.from(upgrades.entries()).map(([key, count]) => {
      const [from, to] = key.split('->');
      return { from, to, count };
    });

    const downgradeEntries: TierMovementEntry[] = Array.from(downgrades.entries()).map(([key, count]) => {
      const [from, to] = key.split('->');
      return { from, to, count };
    });

    const totalUpgrades = upgradeEntries.reduce((s, e) => s + e.count, 0);
    const totalDowngrades = downgradeEntries.reduce((s, e) => s + e.count, 0);

    return {
      upgrades: upgradeEntries,
      downgrades: downgradeEntries,
      net: totalUpgrades - totalDowngrades,
    };
  } catch (error) {
    logger.error('Tier movement error:', error);
    return { upgrades: [], downgrades: [], net: 0 };
  }
};

// ---------------------------------------------------------------------------
// Top Movers
// ---------------------------------------------------------------------------

export const getTopMovers = async (
  organizationId: string,
  options: { days?: number; limit?: number } = {},
): Promise<TopMoversResult> => {
  const { days = 7, limit = 10 } = options;
  const safeDays = Math.max(1, Math.min(days, 365));
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - safeDays);

  try {
    // Get accounts with RISING trend (risers) and FALLING trend (fallers)
    const [risers, fallers] = await Promise.all([
      prisma.accountScore.findMany({
        where: { organizationId, trend: 'RISING', updatedAt: { gte: cutoff } },
        orderBy: { score: 'desc' },
        take: safeLimit,
        include: {
          account: { select: { id: true, name: true, domain: true } },
        },
      }),
      prisma.accountScore.findMany({
        where: { organizationId, trend: 'FALLING', updatedAt: { gte: cutoff } },
        orderBy: { score: 'asc' },
        take: safeLimit,
        include: {
          account: { select: { id: true, name: true, domain: true } },
        },
      }),
    ]);

    // For risers, estimate delta from factors or use a fixed heuristic
    // since we don't store historical scores, we use signal velocity as proxy
    const mapToMover = (scores: typeof risers, isRiser: boolean): TopMoverAccount[] =>
      scores.map((s) => {
        // Parse factors to estimate score delta
        const factors = s.factors as Array<{ name: string; value: number }> | null;
        const velocityFactor = factors?.find((f) => f.name === 'usage_velocity');
        const estimatedDelta = isRiser
          ? Math.max(velocityFactor?.value ?? 5, 5)
          : -Math.max(velocityFactor?.value ?? 5, 5);

        return {
          accountId: s.accountId,
          name: s.account?.name ?? 'Unknown',
          domain: s.account?.domain ?? null,
          scoreDelta: estimatedDelta,
          currentScore: s.score,
          currentTier: s.tier,
        };
      });

    return {
      risers: mapToMover(risers, true),
      fallers: mapToMover(fallers, false),
    };
  } catch (error) {
    logger.error('Top movers error:', error);
    return { risers: [], fallers: [] };
  }
};

// ---------------------------------------------------------------------------
// Source Attribution
// ---------------------------------------------------------------------------

export const getSourceAttribution = async (
  organizationId: string,
  options: { days?: number } = {},
): Promise<SourceAttributionResult> => {
  const { days = 30 } = options;
  const safeDays = Math.max(1, Math.min(days, 365));

  try {
    // Get signal counts and unique accounts per source
    const rows = await prisma.$queryRaw<
      Array<{
        source_name: string;
        signal_count: bigint;
        unique_accounts: bigint;
      }>
    >`
      SELECT
        ss.name as source_name,
        COUNT(s.id) as signal_count,
        COUNT(DISTINCT s."accountId") as unique_accounts
      FROM signals s
      JOIN signal_sources ss ON s."sourceId" = ss.id
      WHERE s."organizationId" = ${organizationId}
        AND s."timestamp" >= CURRENT_DATE - ${safeDays}::integer
      GROUP BY ss.name
      ORDER BY signal_count DESC
    `;

    // Get average score per source's accounts
    const sourcesWithScores = await Promise.all(
      rows.map(async (row) => {
        const avgResult = await prisma.$queryRaw<Array<{ avg_score: number | null }>>`
          SELECT AVG(ascr.score)::float as avg_score
          FROM account_scores ascr
          WHERE ascr."organizationId" = ${organizationId}
            AND ascr."accountId" IN (
              SELECT DISTINCT s."accountId"
              FROM signals s
              JOIN signal_sources ss ON s."sourceId" = ss.id
              WHERE s."organizationId" = ${organizationId}
                AND ss.name = ${row.source_name}
                AND s."accountId" IS NOT NULL
                AND s."timestamp" >= CURRENT_DATE - ${safeDays}::integer
            )
        `.catch(() => [{ avg_score: null }]);

        return {
          source: row.source_name,
          signalCount: Number(row.signal_count),
          uniqueAccounts: Number(row.unique_accounts),
          avgScore: Math.round(avgResult[0]?.avg_score ?? 0),
        };
      }),
    );

    return { sources: sourcesWithScores };
  } catch (error) {
    logger.error('Source attribution error:', error);
    return { sources: [] };
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getISOWeek(d: Date): string {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function generatePeriodLabels(startPeriod: string, period: 'week' | 'month'): string[] {
  const labels: string[] = [];
  const now = new Date();

  if (period === 'month') {
    const [year, month] = startPeriod.split('-').map(Number);
    const current = new Date(year, month - 1, 1);
    while (current <= now) {
      labels.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    // week period — generate weekly labels
    const [year, weekStr] = startPeriod.split('-W').map(Number);
    const current = getDateOfISOWeek(weekStr, year);
    while (current <= now) {
      labels.push(getISOWeek(current));
      current.setDate(current.getDate() + 7);
    }
  }

  return labels;
}

function getDateOfISOWeek(week: number, year: number): Date {
  const d = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = d.getDay();
  if (dow <= 4) d.setDate(d.getDate() - d.getDay() + 1);
  else d.setDate(d.getDate() + 8 - d.getDay());
  return d;
}
