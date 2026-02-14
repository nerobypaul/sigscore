import { Prisma, ScoreTier } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  value: string;
}

export interface ScoringRule {
  id: string;
  name: string;
  description: string;
  signalType: string; // 'npm_download', 'github_star', 'api_call', etc. or '*' for any
  weight: number; // 0-100
  decay: 'none' | '7d' | '14d' | '30d' | '90d';
  conditions: ScoringCondition[];
  enabled: boolean;
}

export interface TierThresholds {
  HOT: number;
  WARM: number;
  COLD: number;
}

export interface ScoringConfig {
  rules: ScoringRule[];
  tierThresholds: TierThresholds;
  maxScore: number;
}

export interface ScorePreviewEntry {
  accountId: string;
  accountName: string;
  domain: string | null;
  currentScore: number;
  currentTier: ScoreTier;
  projectedScore: number;
  projectedTier: ScoreTier;
  delta: number;
}

// ---------------------------------------------------------------------------
// Default scoring rules — matches the 6-factor model in account-scores.ts
// ---------------------------------------------------------------------------

const DEFAULT_RULES: ScoringRule[] = [
  {
    id: 'default_user_count',
    name: 'User Count',
    description: 'Distinct active users in last 30 days (max 25 points)',
    signalType: '*',
    weight: 25,
    decay: '30d',
    conditions: [],
    enabled: true,
  },
  {
    id: 'default_usage_velocity',
    name: 'Usage Velocity',
    description: 'Ratio of recent signals (7d) to total signals (30d)',
    signalType: '*',
    weight: 20,
    decay: '7d',
    conditions: [],
    enabled: true,
  },
  {
    id: 'default_feature_breadth',
    name: 'Feature Breadth',
    description: 'Number of distinct signal types observed',
    signalType: '*',
    weight: 20,
    decay: '30d',
    conditions: [],
    enabled: true,
  },
  {
    id: 'default_engagement_recency',
    name: 'Engagement Recency',
    description: 'How recently the account last interacted',
    signalType: '*',
    weight: 15,
    decay: '14d',
    conditions: [],
    enabled: true,
  },
  {
    id: 'default_seniority_signals',
    name: 'Seniority Signals',
    description: 'Contacts with senior titles (VP, Director, CTO, etc.)',
    signalType: '*',
    weight: 10,
    decay: 'none',
    conditions: [],
    enabled: true,
  },
  {
    id: 'default_firmographic_fit',
    name: 'Firmographic Fit',
    description: 'Company size alignment with ideal customer profile',
    signalType: '*',
    weight: 10,
    decay: 'none',
    conditions: [],
    enabled: true,
  },
];

const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  HOT: 80,
  WARM: 50,
  COLD: 20,
};

const DEFAULT_MAX_SCORE = 100;

export function getDefaultScoringConfig(): ScoringConfig {
  return {
    rules: DEFAULT_RULES,
    tierThresholds: { ...DEFAULT_TIER_THRESHOLDS },
    maxScore: DEFAULT_MAX_SCORE,
  };
}

// ---------------------------------------------------------------------------
// Settings helpers — scoring config lives in Organization.settings JSON
// ---------------------------------------------------------------------------

async function getOrgSettings(organizationId: string): Promise<Record<string, unknown>> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  return (org.settings as Record<string, unknown>) ?? {};
}

async function updateOrgSettings(organizationId: string, patch: Record<string, unknown>): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const current = (org.settings as Record<string, unknown>) ?? {};
  const merged = { ...current, ...patch };

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: merged as Prisma.InputJsonValue },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the organization's custom scoring config, or return defaults.
 */
export async function getScoringConfig(organizationId: string): Promise<ScoringConfig> {
  const settings = await getOrgSettings(organizationId);
  const stored = settings.scoringConfig as ScoringConfig | undefined;

  if (stored && stored.rules && stored.tierThresholds) {
    return {
      rules: stored.rules,
      tierThresholds: stored.tierThresholds,
      maxScore: stored.maxScore ?? DEFAULT_MAX_SCORE,
    };
  }

  return getDefaultScoringConfig();
}

/**
 * Save custom scoring rules to org settings.
 */
export async function updateScoringConfig(organizationId: string, config: ScoringConfig): Promise<ScoringConfig> {
  // Validate total weight is reasonable
  const enabledRules = config.rules.filter((r) => r.enabled);
  const totalWeight = enabledRules.reduce((sum, r) => sum + r.weight, 0);

  if (totalWeight === 0 && enabledRules.length > 0) {
    throw new AppError('Total weight of enabled rules must be greater than 0', 400);
  }

  // Validate tier thresholds are ordered: HOT > WARM > COLD
  if (config.tierThresholds.HOT <= config.tierThresholds.WARM) {
    throw new AppError('HOT threshold must be greater than WARM threshold', 400);
  }
  if (config.tierThresholds.WARM <= config.tierThresholds.COLD) {
    throw new AppError('WARM threshold must be greater than COLD threshold', 400);
  }

  const normalized: ScoringConfig = {
    rules: config.rules,
    tierThresholds: config.tierThresholds,
    maxScore: config.maxScore ?? DEFAULT_MAX_SCORE,
  };

  await updateOrgSettings(organizationId, { scoringConfig: normalized });

  logger.info('Scoring config updated', { organizationId, ruleCount: config.rules.length });

  return normalized;
}

/**
 * Reset scoring config to built-in defaults.
 */
export async function resetToDefaults(organizationId: string): Promise<ScoringConfig> {
  const defaults = getDefaultScoringConfig();
  await updateOrgSettings(organizationId, { scoringConfig: defaults });
  logger.info('Scoring config reset to defaults', { organizationId });
  return defaults;
}

/**
 * Compute tier from score and custom thresholds.
 */
export function computeTierWithThresholds(score: number, thresholds: TierThresholds): ScoreTier {
  if (score >= thresholds.HOT) return 'HOT';
  if (score >= thresholds.WARM) return 'WARM';
  if (score >= thresholds.COLD) return 'COLD';
  return 'INACTIVE';
}

/**
 * Compute a score for a single account using custom rules.
 * Returns the raw numeric score (0 to maxScore).
 */
async function computeScoreForAccount(
  organizationId: string,
  accountId: string,
  config: ScoringConfig,
): Promise<number> {
  const now = new Date();
  const enabledRules = config.rules.filter((r) => r.enabled);

  if (enabledRules.length === 0) return 0;

  const totalWeight = enabledRules.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return 0;

  // Precompute time windows
  const windows: Record<string, Date> = {
    '7d': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    '14d': new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
    '30d': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    '90d': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
  };

  // Fetch all signal data we might need
  const thirtyDaysAgo = windows['30d'];
  const sevenDaysAgo = windows['7d'];

  const [totalSignals, recentSignals, uniqueActors, signalsByType, lastSignal, company, signalsBySignalType] =
    await Promise.all([
      prisma.signal.count({
        where: { accountId, organizationId, timestamp: { gte: thirtyDaysAgo } },
      }),
      prisma.signal.count({
        where: { accountId, organizationId, timestamp: { gte: sevenDaysAgo } },
      }),
      prisma.signal.findMany({
        where: { accountId, organizationId, actorId: { not: null }, timestamp: { gte: thirtyDaysAgo } },
        distinct: ['actorId'],
        select: { actorId: true },
      }),
      prisma.signal.groupBy({
        by: ['type'],
        where: { accountId, organizationId, timestamp: { gte: thirtyDaysAgo } },
        _count: true,
      }),
      prisma.signal.findFirst({
        where: { accountId, organizationId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      }),
      prisma.company.findFirst({
        where: { id: accountId, organizationId },
        select: { size: true, industry: true, contacts: { select: { title: true } } },
      }),
      // For per-signal-type rules: count by type
      prisma.signal.groupBy({
        by: ['type'],
        where: { accountId, organizationId, timestamp: { gte: thirtyDaysAgo } },
        _count: true,
      }),
    ]);

  const userCount = uniqueActors.length;
  const signalTypeCount = signalsByType.length;
  const signalTypeMap = new Map(signalsBySignalType.map((s) => [s.type, s._count]));

  // Build a lookup of well-known factor computations
  const factorComputers: Record<string, () => number> = {
    // Default factors
    default_user_count: () => Math.min(userCount * 5, 25),
    default_usage_velocity: () => {
      const ratio = totalSignals > 0 ? recentSignals / totalSignals : 0;
      return Math.round(ratio * 20);
    },
    default_feature_breadth: () => Math.min(signalTypeCount * 4, 20),
    default_engagement_recency: () => {
      if (!lastSignal) return 0;
      const days = (now.getTime() - lastSignal.timestamp.getTime()) / (1000 * 60 * 60 * 24);
      if (days <= 1) return 15;
      if (days <= 3) return 12;
      if (days <= 7) return 8;
      if (days <= 14) return 4;
      return 0;
    },
    default_seniority_signals: () => {
      const seniorTitles = ['vp', 'director', 'head', 'cto', 'ceo', 'founder', 'chief', 'president'];
      const seniorContacts = (company?.contacts || []).filter(
        (c: { title: string | null }) =>
          c.title && seniorTitles.some((t) => c.title!.toLowerCase().includes(t)),
      ).length;
      return Math.min(seniorContacts * 5, 10);
    },
    default_firmographic_fit: () => {
      if (!company?.size) return 5;
      const sizeScores: Record<string, number> = {
        STARTUP: 8,
        SMALL: 10,
        MEDIUM: 8,
        LARGE: 6,
        ENTERPRISE: 4,
      };
      return sizeScores[company.size] || 5;
    },
  };

  // Evaluate each enabled rule
  let weightedSum = 0;

  for (const rule of enabledRules) {
    let rawScore = 0;

    // If this is a well-known default factor, use its built-in computation
    if (factorComputers[rule.id]) {
      rawScore = factorComputers[rule.id]();
    } else {
      // Custom rule: compute based on signal type matching and conditions
      rawScore = computeCustomRuleScore(rule, {
        totalSignals,
        recentSignals,
        userCount,
        signalTypeCount,
        signalTypeMap,
        lastSignal,
        company,
        now,
        windows,
      });
    }

    // Apply time decay
    const decayMultiplier = getDecayMultiplier(rule.decay, lastSignal?.timestamp || null, now);

    // Normalize: each rule contributes (rawScore / maxPossible) * weight
    // We cap rawScore at 100 as a generic maximum for custom rules
    const normalizedScore = Math.min(rawScore, 100);
    weightedSum += (normalizedScore / 100) * rule.weight * decayMultiplier;
  }

  // Scale to maxScore
  const finalScore = Math.min(
    Math.round((weightedSum / totalWeight) * config.maxScore),
    config.maxScore,
  );

  return Math.max(0, finalScore);
}

interface SignalContext {
  totalSignals: number;
  recentSignals: number;
  userCount: number;
  signalTypeCount: number;
  signalTypeMap: Map<string, number>;
  lastSignal: { timestamp: Date } | null;
  company: { size: string | null; industry: string | null; contacts: { title: string | null }[] } | null;
  now: Date;
  windows: Record<string, Date>;
}

/**
 * Compute score for a custom (user-defined) rule.
 * For signal-type-specific rules, use the signal count for that type.
 * For wildcard rules, use total signal volume.
 */
function computeCustomRuleScore(rule: ScoringRule, ctx: SignalContext): number {
  let signalCount: number;

  if (rule.signalType === '*') {
    signalCount = ctx.totalSignals;
  } else {
    signalCount = ctx.signalTypeMap.get(rule.signalType) || 0;
  }

  // Evaluate conditions — if any condition fails, score is 0
  for (const cond of rule.conditions) {
    if (!evaluateCondition(cond, { signalCount, ...ctx })) {
      return 0;
    }
  }

  // Base score: logarithmic scaling of signal count (0-100)
  if (signalCount === 0) return 0;
  const logScore = Math.min(Math.round(Math.log2(signalCount + 1) * 15), 100);
  return logScore;
}

function evaluateCondition(
  cond: ScoringCondition,
  ctx: { signalCount: number; userCount: number; totalSignals: number },
): boolean {
  // Supported fields: signal_count, user_count
  let fieldValue: number | string;

  switch (cond.field) {
    case 'signal_count':
      fieldValue = ctx.signalCount;
      break;
    case 'user_count':
      fieldValue = ctx.userCount;
      break;
    case 'total_signals':
      fieldValue = ctx.totalSignals;
      break;
    default:
      // Unknown field — pass condition by default
      return true;
  }

  const condValue = typeof cond.value === 'string' ? parseFloat(cond.value) : Number(cond.value);

  switch (cond.operator) {
    case 'gt':
      return Number(fieldValue) > condValue;
    case 'lt':
      return Number(fieldValue) < condValue;
    case 'eq':
      return String(fieldValue) === String(cond.value);
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(cond.value).toLowerCase());
    default:
      return true;
  }
}

function getDecayMultiplier(decay: ScoringRule['decay'], lastSignalAt: Date | null, now: Date): number {
  if (decay === 'none' || !lastSignalAt) return 1.0;

  const daysSinceSignal = (now.getTime() - lastSignalAt.getTime()) / (1000 * 60 * 60 * 24);

  const decayDays: Record<string, number> = {
    '7d': 7,
    '14d': 14,
    '30d': 30,
    '90d': 90,
  };

  const window = decayDays[decay] || 30;

  // Linear decay: full strength at 0 days, 0 at window boundary
  if (daysSinceSignal >= window) return 0;
  return 1.0 - daysSinceSignal / window;
}

// ---------------------------------------------------------------------------
// Preview: dry-run scoring with proposed rules
// ---------------------------------------------------------------------------

/**
 * Preview how proposed scoring config would affect top accounts.
 * Returns up to 10 accounts with current vs projected scores.
 */
export async function previewScores(
  organizationId: string,
  proposedConfig: ScoringConfig,
): Promise<ScorePreviewEntry[]> {
  // Get current top accounts (existing scores)
  const existingScores = await prisma.accountScore.findMany({
    where: { organizationId },
    orderBy: { score: 'desc' },
    take: 10,
    include: {
      account: { select: { id: true, name: true, domain: true } },
    },
  });

  if (existingScores.length === 0) {
    return [];
  }

  // Compute projected scores for each account using proposed config
  const previews: ScorePreviewEntry[] = [];

  for (const existing of existingScores) {
    const accountId = existing.accountId;
    const projectedScore = await computeScoreForAccount(organizationId, accountId, proposedConfig);
    const projectedTier = computeTierWithThresholds(projectedScore, proposedConfig.tierThresholds);

    previews.push({
      accountId,
      accountName: existing.account?.name || 'Unknown',
      domain: existing.account?.domain || null,
      currentScore: existing.score,
      currentTier: existing.tier,
      projectedScore,
      projectedTier,
      delta: projectedScore - existing.score,
    });
  }

  // Sort by absolute delta (biggest changes first)
  previews.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return previews;
}

// ---------------------------------------------------------------------------
// Apply config and recompute all account scores
// ---------------------------------------------------------------------------

/**
 * Save config AND recompute all account scores for the organization.
 */
export async function applyAndRecompute(
  organizationId: string,
  config: ScoringConfig,
): Promise<{ updated: number; config: ScoringConfig }> {
  // Save the config first
  const savedConfig = await updateScoringConfig(organizationId, config);

  // Get all accounts that have existing scores
  const accounts = await prisma.accountScore.findMany({
    where: { organizationId },
    select: { accountId: true, score: true, tier: true },
  });

  let updated = 0;

  for (const account of accounts) {
    try {
      const newScore = await computeScoreForAccount(organizationId, account.accountId, savedConfig);
      const newTier = computeTierWithThresholds(newScore, savedConfig.tierThresholds);

      const trend =
        newScore > account.score + 5
          ? 'RISING'
          : newScore < account.score - 5
            ? 'FALLING'
            : 'STABLE';

      await prisma.accountScore.update({
        where: { accountId: account.accountId },
        data: {
          score: newScore,
          tier: newTier,
          trend,
          computedAt: new Date(),
        },
      });

      updated++;
    } catch (err) {
      logger.error('Failed to recompute score for account', {
        accountId: account.accountId,
        err,
      });
    }
  }

  logger.info('Score recomputation complete', { organizationId, updated, total: accounts.length });

  return { updated, config: savedConfig };
}
