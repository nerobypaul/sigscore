import { Prisma, ScoreTier, ScoreTrend } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { notifyTierChange, sendAccountAlert } from './slack-notifications';
import { enqueueWorkflowExecution, enqueueAlertEvaluation } from '../jobs/producers';
import { getScoringConfig, computeTierWithThresholds, type TierThresholds } from './scoring-rules';
import { fireScoreChanged } from './webhook-events';
import { broadcastScoreChange, broadcastTierChange } from './websocket';

interface ScoreFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Signal decay configuration
// ---------------------------------------------------------------------------
// Half-life = number of days after which a signal's contribution is halved.
// Shorter half-life means the signal type is transient (page views).
// Longer half-life means the signal type has durable buying intent (signups).
// The decay formula is: weight = e^(-lambda * days_old)  where lambda = ln(2) / half_life
// ---------------------------------------------------------------------------

export const SIGNAL_HALF_LIVES: Record<string, number> = {
  // High-intent, durable signals
  'package_install': 21,
  'api_call': 14,
  'repo_fork': 28,
  'repo_clone': 21,
  'pull_request': 28,
  'issue_opened': 21,
  'signup': 60,
  'demo_request': 45,

  // Medium-intent signals
  'repo_star': 14,
  'npm_download': 10,
  'pypi_download': 10,
  'docs_visit': 7,
  'pricing_page_view': 14,
  'feature_request': 21,

  // Low-intent, transient signals
  'page_view': 5,
  'blog_read': 7,
  'social_mention': 10,
  'community_post': 14,
  'support_ticket': 14,
};

export const DEFAULT_HALF_LIFE = 14;

/**
 * Compute the exponential decay weight for a signal based on its type and age.
 * Returns a value in (0, 1] where 1 means "just happened" and values approach
 * 0 for very old signals.
 */
export function computeDecayWeight(signalType: string, daysOld: number): number {
  const halfLife = SIGNAL_HALF_LIVES[signalType] || DEFAULT_HALF_LIFE;
  const lambda = Math.LN2 / halfLife;
  return Math.exp(-lambda * Math.max(0, daysOld));
}

const DEFAULT_THRESHOLDS: TierThresholds = { HOT: 80, WARM: 50, COLD: 20 };

const computeTier = (score: number, thresholds?: TierThresholds): ScoreTier => {
  const t = thresholds || DEFAULT_THRESHOLDS;
  return computeTierWithThresholds(score, t);
};

const computeTrend = (currentScore: number, previousScore: number | null): ScoreTrend => {
  if (previousScore === null) return 'STABLE';
  const delta = currentScore - previousScore;
  if (delta >= 5) return 'RISING';
  if (delta <= -5) return 'FALLING';
  return 'STABLE';
};

export const computeAccountScore = async (organizationId: string, accountId: string) => {
  // Load org-specific scoring config for tier thresholds
  let tierThresholds: TierThresholds = DEFAULT_THRESHOLDS;
  try {
    const scoringConfig = await getScoringConfig(organizationId);
    tierThresholds = scoringConfig.tierThresholds;
  } catch (err) {
    logger.debug('Failed to load custom scoring config, using defaults', { organizationId, err });
  }

  const now = new Date();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // Use a 90-day window instead of 30 days — exponential decay handles relevance
  // naturally, so older signals still contribute with diminishing weight instead
  // of being abruptly discarded at the 30-day boundary ("cliff effect").
  const ninetyDaysAgo = new Date(now.getTime() - 90 * MS_PER_DAY);
  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);

  // Fetch signal data for scoring — we need individual signals with type + timestamp
  // to compute per-signal decay weights, plus the same ancillary data as before.
  const [signals, uniqueActors, lastSignal, company, seniorContactCount] =
    await Promise.all([
      // All signals in the 90-day decay window (type + timestamp for weighting)
      prisma.signal.findMany({
        where: { accountId, organizationId, timestamp: { gte: ninetyDaysAgo } },
        select: { type: true, timestamp: true, actorId: true },
      }),
      // Unique actors (user count) — still scoped to 90 days
      prisma.signal.findMany({
        where: { accountId, organizationId, actorId: { not: null }, timestamp: { gte: ninetyDaysAgo } },
        distinct: ['actorId'],
        select: { actorId: true },
      }),
      // Most recent signal (no date filter — used for engagement_recency)
      prisma.signal.findFirst({
        where: { accountId, organizationId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      // Company info for firmographic fit
      prisma.company.findFirst({
        where: { id: accountId, organizationId },
        select: { size: true, industry: true },
      }),
      // Count senior contacts at DB level
      prisma.contact.count({
        where: {
          companyId: accountId,
          organizationId,
          title: { not: null },
          OR: [
            { title: { contains: 'VP', mode: 'insensitive' } },
            { title: { contains: 'Director', mode: 'insensitive' } },
            { title: { contains: 'Head', mode: 'insensitive' } },
            { title: { contains: 'CTO', mode: 'insensitive' } },
            { title: { contains: 'CEO', mode: 'insensitive' } },
            { title: { contains: 'Founder', mode: 'insensitive' } },
            { title: { contains: 'Chief', mode: 'insensitive' } },
            { title: { contains: 'President', mode: 'insensitive' } },
          ],
        },
      }),
    ]);

  // ---------------------------------------------------------------------------
  // Compute decay-weighted signal aggregates
  // ---------------------------------------------------------------------------
  const signalCount = signals.length;
  let totalDecayWeightedSignals = 0;   // sum of decay weights across all signals
  let recentDecayWeightedSignals = 0;  // sum of decay weights for signals in last 7 days
  let totalDecaySum = 0;               // raw sum of decay weights (for avg calculation)
  const signalTypeSet = new Set<string>();

  for (const signal of signals) {
    const daysOld = (now.getTime() - signal.timestamp.getTime()) / MS_PER_DAY;
    const decayWeight = computeDecayWeight(signal.type, daysOld);

    totalDecayWeightedSignals += decayWeight;
    totalDecaySum += decayWeight;
    signalTypeSet.add(signal.type);

    if (signal.timestamp >= sevenDaysAgo) {
      recentDecayWeightedSignals += decayWeight;
    }
  }

  const userCount = uniqueActors.length;
  const signalTypeCount = signalTypeSet.size;

  // Compute individual factors (7-factor PQA model with signal freshness)
  const factors: ScoreFactor[] = [];

  // Factor 1: User count (0-20 points)
  // Weight reduced from 25 to 20 to make room for signal_freshness factor
  const userScore = Math.min(userCount * 4, 20);
  factors.push({
    name: 'user_count',
    weight: 0.20,
    value: userScore,
    description: `${userCount} distinct users active in last 90 days`,
  });

  // Factor 2: Usage velocity — recent weighted signals vs total weighted (0-20 points)
  // Uses decay-weighted sums so accelerating accounts score higher even if they have
  // a long history of older signals.
  const velocityRatio = totalDecayWeightedSignals > 0
    ? recentDecayWeightedSignals / totalDecayWeightedSignals
    : 0;
  const velocityScore = Math.round(velocityRatio * 20);
  factors.push({
    name: 'usage_velocity',
    weight: 0.20,
    value: velocityScore,
    description: `${recentDecayWeightedSignals.toFixed(1)} weighted signals in last 7 days out of ${totalDecayWeightedSignals.toFixed(1)} total weighted`,
  });

  // Factor 3: Feature breadth — distinct signal types (0-15 points)
  // Reduced from 20 to 15 to make room for signal_freshness factor
  const breadthScore = Math.min(signalTypeCount * 3, 15);
  factors.push({
    name: 'feature_breadth',
    weight: 0.15,
    value: breadthScore,
    description: `${signalTypeCount} different signal types observed`,
  });

  // Factor 4: Engagement recency (0-15 points) — unchanged, uses lastSignalAt
  let recencyScore = 0;
  if (lastSignal) {
    const daysSinceLastSignal = (now.getTime() - lastSignal.timestamp.getTime()) / MS_PER_DAY;
    if (daysSinceLastSignal <= 1) recencyScore = 15;
    else if (daysSinceLastSignal <= 3) recencyScore = 12;
    else if (daysSinceLastSignal <= 7) recencyScore = 8;
    else if (daysSinceLastSignal <= 14) recencyScore = 4;
    else recencyScore = 0;
  }
  factors.push({
    name: 'engagement_recency',
    weight: 0.15,
    value: recencyScore,
    description: lastSignal
      ? `Last signal ${Math.round((now.getTime() - lastSignal.timestamp.getTime()) / MS_PER_DAY)} days ago`
      : 'No signals recorded',
  });

  // Factor 5: Signal freshness — rewards accounts whose signals have high average
  // decay weight, meaning activity is concentrated in the recent past (0-10 points)
  const avgDecayWeight = signalCount > 0 ? totalDecaySum / signalCount : 0;
  let freshnessScore = 0;
  if (avgDecayWeight >= 0.8) freshnessScore = 10;
  else if (avgDecayWeight >= 0.6) freshnessScore = 8;
  else if (avgDecayWeight >= 0.4) freshnessScore = 6;
  else if (avgDecayWeight >= 0.2) freshnessScore = 3;
  else freshnessScore = 0;
  factors.push({
    name: 'signal_freshness',
    weight: 0.10,
    value: freshnessScore,
    description: `Average decay weight ${avgDecayWeight.toFixed(2)} across ${signalCount} signals`,
  });

  // Factor 6: Seniority signals — contacts with senior titles (0-10 points)
  const seniorContacts = seniorContactCount;
  const seniorityScore = Math.min(seniorContacts * 5, 10);
  factors.push({
    name: 'seniority_signals',
    weight: 0.10,
    value: seniorityScore,
    description: `${seniorContacts} contacts with senior titles`,
  });

  // Factor 7: Firmographic fit (0-10 points)
  let firmoScore = 5; // default middle
  if (company?.size) {
    const sizeScores: Record<string, number> = {
      STARTUP: 8,
      SMALL: 10,
      MEDIUM: 8,
      LARGE: 6,
      ENTERPRISE: 4,
    };
    firmoScore = sizeScores[company.size] || 5;
  }
  factors.push({
    name: 'firmographic_fit',
    weight: 0.10,
    value: firmoScore,
    description: company?.size ? `Company size: ${company.size}` : 'Company size unknown',
  });

  // Total score
  const totalSignals = signalCount; // for backward compat in upsert below
  const totalScore = Math.min(
    Math.round(factors.reduce((sum, f) => sum + f.value, 0)),
    100
  );

  // Get previous score for trend calculation and tier change detection
  const existingScore = await prisma.accountScore.findUnique({
    where: { accountId },
    select: { score: true, tier: true },
  });

  const tier = computeTier(totalScore, tierThresholds);
  const trend = computeTrend(totalScore, existingScore?.score ?? null);

  // Upsert the score
  const score = await prisma.accountScore.upsert({
    where: { accountId },
    create: {
      organization: { connect: { id: organizationId } },
      account: { connect: { id: accountId } },
      score: totalScore,
      tier,
      factors: factors as unknown as Prisma.InputJsonValue,
      signalCount: totalSignals,
      userCount,
      lastSignalAt: lastSignal?.timestamp || null,
      trend,
      computedAt: now,
    },
    update: {
      score: totalScore,
      tier,
      factors: factors as unknown as Prisma.InputJsonValue,
      signalCount: totalSignals,
      userCount,
      lastSignalAt: lastSignal?.timestamp || null,
      trend,
      computedAt: now,
    },
    include: {
      account: { select: { id: true, name: true, domain: true } },
    },
  });

  // Fire webhook event if score changed (fire-and-forget)
  const oldScore = existingScore?.score ?? null;
  if (oldScore === null || oldScore !== totalScore) {
    fireScoreChanged(
      organizationId,
      accountId,
      oldScore,
      totalScore,
      existingScore?.tier ?? null,
      tier,
    ).catch((err) => logger.error('Webhook fire error (score.changed):', err));
  }

  // Broadcast score change over WebSocket (fire-and-forget, never blocks scoring)
  const accountName = score.account?.name || 'Unknown';
  const previousScore = existingScore?.score ?? 0;
  const previousTier = existingScore?.tier ?? tier;
  if (previousScore !== totalScore || !existingScore) {
    broadcastScoreChange(organizationId, {
      accountId,
      companyName: accountName,
      oldScore: previousScore,
      newScore: totalScore,
      oldTier: previousTier,
      newTier: tier,
      delta: totalScore - previousScore,
      scoredAt: now.toISOString(),
    });
  }

  // Notify Slack on tier change (fire-and-forget)
  const oldTier = existingScore?.tier;
  if (oldTier && oldTier !== tier) {
    // Broadcast tier change over WebSocket (fire-and-forget)
    broadcastTierChange(organizationId, {
      accountId,
      companyName: accountName,
      oldTier,
      newTier: tier,
      score: totalScore,
    });

    notifyTierChange(organizationId, accountName, oldTier, tier, totalScore, totalSignals, userCount)
      .catch((err) => logger.error('Slack tier notification failed', { err }));

    // Send rich Slack alert when entering HOT tier (fire-and-forget)
    if (tier === 'HOT' && oldTier !== 'HOT') {
      sendAccountAlert(organizationId, accountId)
        .catch((err) => logger.error('Slack rich account alert failed', { err }));
    }

    // Enqueue workflow for score/tier change via BullMQ (async with retries)
    enqueueWorkflowExecution(organizationId, 'score_changed', {
      accountId,
      accountName,
      oldTier,
      newTier: tier,
      oldScore: existingScore?.score ?? null,
      newScore: totalScore,
      signalCount: totalSignals,
      userCount,
    }).catch((err) => logger.error('Workflow enqueue error:', err));
  }

  // Enqueue alert rule evaluation (fire-and-forget, async with retries)
  enqueueAlertEvaluation(organizationId, accountId, totalScore, oldScore)
    .catch((err) => logger.error('Alert evaluation enqueue error:', err));

  return score;
};

export const getAccountScore = async (organizationId: string, accountId: string) => {
  return prisma.accountScore.findFirst({
    where: { accountId, organizationId },
    include: {
      account: { select: { id: true, name: true, domain: true } },
    },
  });
};

export const getTopAccounts = async (organizationId: string, limit = 20, tier?: ScoreTier) => {
  return prisma.accountScore.findMany({
    where: {
      organizationId,
      ...(tier && { tier }),
    },
    take: limit,
    orderBy: { score: 'desc' },
    include: {
      account: {
        select: { id: true, name: true, domain: true, size: true, industry: true },
      },
    },
  });
};
