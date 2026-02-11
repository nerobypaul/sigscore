import { ScoreTier, ScoreTrend } from '@prisma/client';
import { prisma } from '../config/database';

interface ScoreFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

const computeTier = (score: number): ScoreTier => {
  if (score >= 80) return 'HOT';
  if (score >= 50) return 'WARM';
  if (score >= 20) return 'COLD';
  return 'INACTIVE';
};

const computeTrend = (currentScore: number, previousScore: number | null): ScoreTrend => {
  if (previousScore === null) return 'STABLE';
  const delta = currentScore - previousScore;
  if (delta >= 5) return 'RISING';
  if (delta <= -5) return 'FALLING';
  return 'STABLE';
};

export const computeAccountScore = async (organizationId: string, accountId: string) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch signal data for scoring
  const [totalSignals, recentSignals, uniqueActors, signalsByType, lastSignal, company] =
    await Promise.all([
      // Total signals in last 30 days
      prisma.signal.count({
        where: { accountId, organizationId, timestamp: { gte: thirtyDaysAgo } },
      }),
      // Signals in last 7 days (recency)
      prisma.signal.count({
        where: { accountId, organizationId, timestamp: { gte: sevenDaysAgo } },
      }),
      // Unique actors (user count)
      prisma.signal.findMany({
        where: { accountId, organizationId, actorId: { not: null }, timestamp: { gte: thirtyDaysAgo } },
        distinct: ['actorId'],
        select: { actorId: true },
      }),
      // Signals grouped by type (feature breadth)
      prisma.signal.groupBy({
        by: ['type'],
        where: { accountId, organizationId, timestamp: { gte: thirtyDaysAgo } },
        _count: true,
      }),
      // Most recent signal
      prisma.signal.findFirst({
        where: { accountId, organizationId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      // Company info for firmographic fit
      prisma.company.findFirst({
        where: { id: accountId, organizationId },
        select: { size: true, industry: true, contacts: { select: { title: true } } },
      }),
    ]);

  const userCount = uniqueActors.length;
  const signalTypeCount = signalsByType.length;

  // Compute individual factors
  const factors: ScoreFactor[] = [];

  // Factor 1: User count (0-25 points)
  const userScore = Math.min(userCount * 5, 25);
  factors.push({
    name: 'user_count',
    weight: 0.25,
    value: userScore,
    description: `${userCount} distinct users active in last 30 days`,
  });

  // Factor 2: Usage velocity — recent signals vs total (0-20 points)
  const velocityRatio = totalSignals > 0 ? recentSignals / totalSignals : 0;
  const velocityScore = Math.round(velocityRatio * 20);
  factors.push({
    name: 'usage_velocity',
    weight: 0.20,
    value: velocityScore,
    description: `${recentSignals} signals in last 7 days out of ${totalSignals} in 30 days`,
  });

  // Factor 3: Feature breadth — distinct signal types (0-20 points)
  const breadthScore = Math.min(signalTypeCount * 4, 20);
  factors.push({
    name: 'feature_breadth',
    weight: 0.20,
    value: breadthScore,
    description: `${signalTypeCount} different signal types observed`,
  });

  // Factor 4: Engagement recency (0-15 points)
  let recencyScore = 0;
  if (lastSignal) {
    const daysSinceLastSignal = (now.getTime() - lastSignal.timestamp.getTime()) / (1000 * 60 * 60 * 24);
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
      ? `Last signal ${Math.round((now.getTime() - lastSignal.timestamp.getTime()) / (1000 * 60 * 60 * 24))} days ago`
      : 'No signals recorded',
  });

  // Factor 5: Seniority signals — contacts with senior titles (0-10 points)
  const seniorTitles = ['vp', 'director', 'head', 'cto', 'ceo', 'founder', 'chief', 'president'];
  const seniorContacts = (company?.contacts || []).filter((c: { title: string | null }) =>
    c.title && seniorTitles.some((t) => c.title!.toLowerCase().includes(t))
  ).length;
  const seniorityScore = Math.min(seniorContacts * 5, 10);
  factors.push({
    name: 'seniority_signals',
    weight: 0.10,
    value: seniorityScore,
    description: `${seniorContacts} contacts with senior titles`,
  });

  // Factor 6: Firmographic fit (0-10 points)
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
  const totalScore = Math.min(
    Math.round(factors.reduce((sum, f) => sum + f.value, 0)),
    100
  );

  // Get previous score for trend calculation
  const existingScore = await prisma.accountScore.findUnique({
    where: { accountId },
    select: { score: true },
  });

  const tier = computeTier(totalScore);
  const trend = computeTrend(totalScore, existingScore?.score ?? null);

  // Upsert the score
  const score = await prisma.accountScore.upsert({
    where: { accountId },
    create: {
      organization: { connect: { id: organizationId } },
      account: { connect: { id: accountId } },
      score: totalScore,
      tier,
      factors: factors as any,
      signalCount: totalSignals,
      userCount,
      lastSignalAt: lastSignal?.timestamp || null,
      trend,
      computedAt: now,
    },
    update: {
      score: totalScore,
      tier,
      factors: factors as any,
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
