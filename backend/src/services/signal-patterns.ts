/**
 * Signal Pattern Clustering & ICP (Ideal Customer Profile) Matching Service
 *
 * Provides three core capabilities:
 *   1. Signal Profiles — build a behavioral fingerprint per account from
 *      the last 90 days of signal data (type distribution, velocity, trend).
 *   2. Lookalike Detection — given a reference account, find the most similar
 *      accounts via cosine similarity on signal-type vectors.
 *   3. ICP Matching — score all accounts against a user-defined ICP definition.
 *   4. Signal Sequence Detection — discover common signal-type sequences that
 *      precede high PQA scores.
 *
 * No ML libraries required — all math is done inline (cosine similarity, etc.).
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EngagementPattern = 'accelerating' | 'steady' | 'decelerating' | 'dormant';

export interface SignalProfile {
  accountId: string;
  accountName: string;
  signalTypeCounts: Record<string, number>;
  signalVelocity: number; // signals per day (last 30 days)
  topSignalTypes: string[]; // top 3 signal types by volume
  engagementPattern: EngagementPattern;
  firmographics: { industry?: string; size?: string; domain?: string };
  totalSignals: number;
}

export interface ICPDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  criteria: {
    minScore?: number;
    signalTypes?: string[];
    minSignalCount?: number;
    engagementPatterns?: string[];
    industries?: string[];
    companySize?: string[];
  };
  createdAt: string;
}

export interface LookalikeResult {
  accountId: string;
  companyName: string;
  score: number; // PQA score
  matchScore: number; // 0-100 similarity to reference
  matchReasons: string[];
  signalProfile: SignalProfile;
}

export interface ICPMatchResult {
  accountId: string;
  companyName: string;
  score: number; // PQA score
  matchPercentage: number; // 0-100
  matchedCriteria: string[];
  missedCriteria: string[];
  signalProfile: SignalProfile;
}

export interface SignalSequence {
  sequence: string[];
  occurrences: number;
  accountNames: string[];
  avgScore: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface RawSignalGroup {
  type: string;
  count: bigint;
}

interface RawRecentCount {
  count: bigint;
}

/**
 * Compute cosine similarity between two sparse vectors represented as
 * Record<string, number>. Returns 0-1.
 */
function cosineSimilarity(
  a: Record<string, number>,
  b: Record<string, number>,
): number {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const key of allKeys) {
    const va = a[key] ?? 0;
    const vb = b[key] ?? 0;
    dotProduct += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Determine engagement pattern based on recent vs overall signal velocity.
 */
function classifyEngagement(
  last7dCount: number,
  last30dCount: number,
  last14dCount: number,
): EngagementPattern {
  if (last14dCount === 0) return 'dormant';

  const avgDaily30d = last30dCount / 30;
  const avgDaily7d = last7dCount / 7;

  if (avgDaily30d === 0) return 'dormant';

  if (avgDaily7d > avgDaily30d * 1.2) return 'accelerating';
  if (avgDaily7d < avgDaily30d * 0.5) return 'decelerating';

  return 'steady';
}

// ---------------------------------------------------------------------------
// Core: Build Signal Profile
// ---------------------------------------------------------------------------

/**
 * Build a signal profile for a single account from the last 90 days of signals.
 */
export async function buildSignalProfile(
  accountId: string,
  organizationId: string,
): Promise<SignalProfile | null> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - NINETY_DAYS_MS);
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const fourteenDaysAgo = new Date(now.getTime() - FOURTEEN_DAYS_MS);
  const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);

  // Get the account info
  const account = await prisma.company.findFirst({
    where: { id: accountId, organizationId },
    select: { id: true, name: true, industry: true, size: true, domain: true },
  });

  if (!account) return null;

  // Get signal type counts for last 90 days
  const signalGroups = await prisma.$queryRaw<RawSignalGroup[]>`
    SELECT "type", COUNT(*)::bigint AS count
    FROM "signals"
    WHERE "organizationId" = ${organizationId}
      AND "accountId" = ${accountId}
      AND "timestamp" >= ${ninetyDaysAgo}
    GROUP BY "type"
    ORDER BY count DESC
  `;

  const signalTypeCounts: Record<string, number> = {};
  let totalSignals = 0;
  for (const row of signalGroups) {
    const c = Number(row.count);
    signalTypeCounts[row.type] = c;
    totalSignals += c;
  }

  // Top 3 signal types
  const topSignalTypes = Object.entries(signalTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  // Signal velocity: signals per day over last 30 days
  const [velocityRow] = await prisma.$queryRaw<RawRecentCount[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "signals"
    WHERE "organizationId" = ${organizationId}
      AND "accountId" = ${accountId}
      AND "timestamp" >= ${thirtyDaysAgo}
  `;
  const last30dCount = Number(velocityRow?.count ?? 0);
  const signalVelocity = Math.round((last30dCount / 30) * 100) / 100;

  // Engagement pattern
  const [recentRow14] = await prisma.$queryRaw<RawRecentCount[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "signals"
    WHERE "organizationId" = ${organizationId}
      AND "accountId" = ${accountId}
      AND "timestamp" >= ${fourteenDaysAgo}
  `;
  const last14dCount = Number(recentRow14?.count ?? 0);

  const [recentRow7] = await prisma.$queryRaw<RawRecentCount[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "signals"
    WHERE "organizationId" = ${organizationId}
      AND "accountId" = ${accountId}
      AND "timestamp" >= ${sevenDaysAgo}
  `;
  const last7dCount = Number(recentRow7?.count ?? 0);

  const engagementPattern = classifyEngagement(last7dCount, last30dCount, last14dCount);

  return {
    accountId: account.id,
    accountName: account.name,
    signalTypeCounts,
    signalVelocity,
    topSignalTypes,
    engagementPattern,
    firmographics: {
      industry: account.industry ?? undefined,
      size: account.size ?? undefined,
      domain: account.domain ?? undefined,
    },
    totalSignals,
  };
}

// ---------------------------------------------------------------------------
// Core: Find Lookalikes
// ---------------------------------------------------------------------------

interface AccountWithSignals {
  accountId: string;
  name: string;
  industry: string | null;
  size: string | null;
  domain: string | null;
}

/**
 * Find accounts most similar to a reference account based on signal-type
 * distribution using cosine similarity.
 */
export async function findLookalikes(
  referenceAccountId: string,
  organizationId: string,
  limit: number = 10,
): Promise<LookalikeResult[]> {
  // Build reference profile
  const refProfile = await buildSignalProfile(referenceAccountId, organizationId);
  if (!refProfile) {
    logger.warn('Lookalike search failed: reference account not found', {
      referenceAccountId,
      organizationId,
    });
    return [];
  }

  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  // Find all accounts with signals in the last 90 days (excluding reference)
  const accountsWithSignals = await prisma.signal.findMany({
    where: {
      organizationId,
      accountId: { not: null, notIn: [referenceAccountId] },
      timestamp: { gte: ninetyDaysAgo },
    },
    distinct: ['accountId'],
    select: { accountId: true },
  });

  const accountIds = accountsWithSignals
    .map((s) => s.accountId)
    .filter((id): id is string => id !== null);

  if (accountIds.length === 0) return [];

  // Load account metadata in bulk for efficiency
  const accountMap = new Map<string, AccountWithSignals>();
  const accounts = await prisma.company.findMany({
    where: { id: { in: accountIds }, organizationId },
    select: { id: true, name: true, industry: true, size: true, domain: true },
  });
  for (const acc of accounts) {
    accountMap.set(acc.id, {
      accountId: acc.id,
      name: acc.name,
      industry: acc.industry,
      size: acc.size,
      domain: acc.domain,
    });
  }

  // Load PQA scores in bulk
  const scores = await prisma.accountScore.findMany({
    where: { organizationId, accountId: { in: accountIds } },
    select: { accountId: true, score: true },
  });
  const scoreMap = new Map(scores.map((s) => [s.accountId, s.score]));

  // Build profiles and compute similarity for each account
  const results: LookalikeResult[] = [];

  // Process in batches to avoid excessive query load
  const BATCH_SIZE = 50;
  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);

    const profilePromises = batch.map((id) => buildSignalProfile(id, organizationId));
    const profiles = await Promise.all(profilePromises);

    for (const profile of profiles) {
      if (!profile || profile.totalSignals === 0) continue;

      // Cosine similarity on signal type vectors
      let similarity = cosineSimilarity(
        refProfile.signalTypeCounts,
        profile.signalTypeCounts,
      );

      // Build match reasons
      const matchReasons: string[] = [];

      // Bonus for matching industry
      const accMeta = accountMap.get(profile.accountId);
      if (
        accMeta?.industry &&
        refProfile.firmographics.industry &&
        accMeta.industry === refProfile.firmographics.industry
      ) {
        similarity += 0.1;
        matchReasons.push(`Same industry: ${accMeta.industry}`);
      }

      // Bonus for matching size
      if (
        accMeta?.size &&
        refProfile.firmographics.size &&
        accMeta.size === refProfile.firmographics.size
      ) {
        similarity += 0.05;
        matchReasons.push(`Same company size: ${accMeta.size}`);
      }

      // Clamp to 1.0
      similarity = Math.min(similarity, 1.0);

      // Add common signal types as match reasons
      const commonTypes = profile.topSignalTypes.filter((t) =>
        refProfile.topSignalTypes.includes(t),
      );
      if (commonTypes.length > 0) {
        matchReasons.push(`Shared top signals: ${commonTypes.join(', ')}`);
      }

      // Same engagement pattern
      if (profile.engagementPattern === refProfile.engagementPattern) {
        matchReasons.push(`Same engagement pattern: ${profile.engagementPattern}`);
      }

      const matchScore = Math.round(similarity * 100);

      results.push({
        accountId: profile.accountId,
        companyName: profile.accountName,
        score: scoreMap.get(profile.accountId) ?? 0,
        matchScore,
        matchReasons,
        signalProfile: profile,
      });
    }
  }

  // Sort by matchScore descending and return top N
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Core: ICP Matching
// ---------------------------------------------------------------------------

/**
 * Find all accounts that match a given ICP definition and score how well
 * each one fits.
 */
export async function matchICP(
  icpDef: ICPDefinition,
  organizationId: string,
): Promise<ICPMatchResult[]> {
  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  // Find all accounts with signals in the last 90 days
  const accountsWithSignals = await prisma.signal.findMany({
    where: {
      organizationId,
      accountId: { not: null },
      timestamp: { gte: ninetyDaysAgo },
    },
    distinct: ['accountId'],
    select: { accountId: true },
  });

  const accountIds = accountsWithSignals
    .map((s) => s.accountId)
    .filter((id): id is string => id !== null);

  if (accountIds.length === 0) return [];

  // Load scores in bulk
  const scores = await prisma.accountScore.findMany({
    where: { organizationId, accountId: { in: accountIds } },
    select: { accountId: true, score: true },
  });
  const scoreMap = new Map(scores.map((s) => [s.accountId, s.score]));

  // Load company metadata
  const companies = await prisma.company.findMany({
    where: { id: { in: accountIds }, organizationId },
    select: { id: true, name: true, industry: true, size: true },
  });
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  const results: ICPMatchResult[] = [];
  const criteria = icpDef.criteria;
  const totalCriteria = countCriteria(criteria);

  // Build profiles and check each criterion
  const BATCH_SIZE = 50;
  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);

    const profilePromises = batch.map((id) => buildSignalProfile(id, organizationId));
    const profiles = await Promise.all(profilePromises);

    for (const profile of profiles) {
      if (!profile) continue;

      const matched: string[] = [];
      const missed: string[] = [];
      const company = companyMap.get(profile.accountId);
      const pqaScore = scoreMap.get(profile.accountId) ?? 0;

      // Check minScore
      if (criteria.minScore !== undefined) {
        if (pqaScore >= criteria.minScore) {
          matched.push(`PQA score >= ${criteria.minScore}`);
        } else {
          missed.push(`PQA score >= ${criteria.minScore} (actual: ${pqaScore})`);
        }
      }

      // Check signalTypes (must have at least one)
      if (criteria.signalTypes && criteria.signalTypes.length > 0) {
        const hasAny = criteria.signalTypes.some((t) => (profile.signalTypeCounts[t] ?? 0) > 0);
        if (hasAny) {
          const found = criteria.signalTypes.filter((t) => (profile.signalTypeCounts[t] ?? 0) > 0);
          matched.push(`Has signal types: ${found.join(', ')}`);
        } else {
          missed.push(`Missing signal types: ${criteria.signalTypes.join(', ')}`);
        }
      }

      // Check minSignalCount
      if (criteria.minSignalCount !== undefined) {
        if (profile.totalSignals >= criteria.minSignalCount) {
          matched.push(`Signal count >= ${criteria.minSignalCount}`);
        } else {
          missed.push(`Signal count >= ${criteria.minSignalCount} (actual: ${profile.totalSignals})`);
        }
      }

      // Check engagementPatterns
      if (criteria.engagementPatterns && criteria.engagementPatterns.length > 0) {
        if (criteria.engagementPatterns.includes(profile.engagementPattern)) {
          matched.push(`Engagement: ${profile.engagementPattern}`);
        } else {
          missed.push(`Engagement: expected ${criteria.engagementPatterns.join('/')}, actual ${profile.engagementPattern}`);
        }
      }

      // Check industries
      if (criteria.industries && criteria.industries.length > 0) {
        if (company?.industry && criteria.industries.includes(company.industry)) {
          matched.push(`Industry: ${company.industry}`);
        } else {
          missed.push(`Industry: expected ${criteria.industries.join('/')}`);
        }
      }

      // Check companySize
      if (criteria.companySize && criteria.companySize.length > 0) {
        if (company?.size && criteria.companySize.includes(company.size)) {
          matched.push(`Size: ${company.size}`);
        } else {
          missed.push(`Size: expected ${criteria.companySize.join('/')}`);
        }
      }

      // Only include accounts that match at least one criterion
      if (matched.length === 0) continue;

      const matchPercentage = totalCriteria > 0
        ? Math.round((matched.length / totalCriteria) * 100)
        : 0;

      results.push({
        accountId: profile.accountId,
        companyName: profile.accountName,
        score: pqaScore,
        matchPercentage,
        matchedCriteria: matched,
        missedCriteria: missed,
        signalProfile: profile,
      });
    }
  }

  // Sort by match percentage descending, then by score
  results.sort((a, b) => {
    if (b.matchPercentage !== a.matchPercentage) return b.matchPercentage - a.matchPercentage;
    return b.score - a.score;
  });

  return results;
}

function countCriteria(criteria: ICPDefinition['criteria']): number {
  let count = 0;
  if (criteria.minScore !== undefined) count++;
  if (criteria.signalTypes && criteria.signalTypes.length > 0) count++;
  if (criteria.minSignalCount !== undefined) count++;
  if (criteria.engagementPatterns && criteria.engagementPatterns.length > 0) count++;
  if (criteria.industries && criteria.industries.length > 0) count++;
  if (criteria.companySize && criteria.companySize.length > 0) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Core: Detect Signal Sequences
// ---------------------------------------------------------------------------

interface AccountTimeline {
  accountId: string;
  name: string;
  score: number;
  types: string[];
}

/**
 * Discover common 2-3 signal-type sequences that precede high PQA scores
 * (accounts scored > 70). Analyzes the last 90 days of signal data.
 */
export async function detectSignalSequences(
  organizationId: string,
): Promise<SignalSequence[]> {
  // Find high-scoring accounts
  const highScoreAccounts = await prisma.accountScore.findMany({
    where: { organizationId, score: { gte: 70 } },
    select: { accountId: true, score: true },
    orderBy: { score: 'desc' },
    take: 100,
  });

  if (highScoreAccounts.length === 0) return [];

  const accountIds = highScoreAccounts.map((a) => a.accountId);
  const scoreMap = new Map(highScoreAccounts.map((a) => [a.accountId, a.score]));

  // Load company names
  const companies = await prisma.company.findMany({
    where: { id: { in: accountIds }, organizationId },
    select: { id: true, name: true },
  });
  const nameMap = new Map(companies.map((c) => [c.id, c.name]));

  const ninetyDaysAgo = new Date(Date.now() - NINETY_DAYS_MS);

  // Build per-account timelines (ordered signal types)
  const timelines: AccountTimeline[] = [];

  for (const accountId of accountIds) {
    const signals = await prisma.signal.findMany({
      where: {
        organizationId,
        accountId,
        timestamp: { gte: ninetyDaysAgo },
      },
      select: { type: true },
      orderBy: { timestamp: 'asc' },
      take: 200, // cap to prevent huge reads
    });

    if (signals.length < 2) continue;

    // Deduplicate consecutive same types to get unique transitions
    const types: string[] = [];
    for (const sig of signals) {
      if (types.length === 0 || types[types.length - 1] !== sig.type) {
        types.push(sig.type);
      }
    }

    timelines.push({
      accountId,
      name: nameMap.get(accountId) ?? 'Unknown',
      score: scoreMap.get(accountId) ?? 0,
      types,
    });
  }

  // Extract 2-gram and 3-gram sequences
  const sequenceMap = new Map<string, { accounts: Set<string>; totalScore: number }>();

  for (const tl of timelines) {
    const seenInThisAccount = new Set<string>();

    // 2-grams
    for (let i = 0; i < tl.types.length - 1; i++) {
      const seq = `${tl.types[i]}|${tl.types[i + 1]}`;
      if (!seenInThisAccount.has(seq)) {
        seenInThisAccount.add(seq);
        const entry = sequenceMap.get(seq) ?? { accounts: new Set(), totalScore: 0 };
        entry.accounts.add(tl.accountId);
        entry.totalScore += tl.score;
        sequenceMap.set(seq, entry);
      }
    }

    // 3-grams
    for (let i = 0; i < tl.types.length - 2; i++) {
      const seq = `${tl.types[i]}|${tl.types[i + 1]}|${tl.types[i + 2]}`;
      if (!seenInThisAccount.has(seq)) {
        seenInThisAccount.add(seq);
        const entry = sequenceMap.get(seq) ?? { accounts: new Set(), totalScore: 0 };
        entry.accounts.add(tl.accountId);
        entry.totalScore += tl.score;
        sequenceMap.set(seq, entry);
      }
    }
  }

  // Filter sequences that appear in at least 2 accounts and sort by frequency
  const results: SignalSequence[] = [];

  for (const [seqKey, data] of sequenceMap) {
    if (data.accounts.size < 2) continue;

    const accountNames = [...data.accounts]
      .map((id) => nameMap.get(id) ?? 'Unknown')
      .slice(0, 5); // cap name list

    results.push({
      sequence: seqKey.split('|'),
      occurrences: data.accounts.size,
      accountNames,
      avgScore: Math.round(data.totalScore / data.accounts.size),
    });
  }

  results.sort((a, b) => b.occurrences - a.occurrences);
  return results.slice(0, 20);
}

// ---------------------------------------------------------------------------
// ICP CRUD (stored in organization.settings JSON)
// ---------------------------------------------------------------------------

/**
 * Get all ICP definitions for an organization.
 */
export async function getICPDefinitions(
  organizationId: string,
): Promise<ICPDefinition[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org?.settings) return [];

  const settings = org.settings as Record<string, unknown>;
  const icps = settings.icpDefinitions as ICPDefinition[] | undefined;
  return icps ?? [];
}

/**
 * Create a new ICP definition.
 */
export async function createICPDefinition(
  organizationId: string,
  data: { name: string; description: string; criteria: ICPDefinition['criteria'] },
): Promise<ICPDefinition> {
  const id = `icp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const definition: ICPDefinition = {
    id,
    organizationId,
    name: data.name,
    description: data.description,
    criteria: data.criteria,
    createdAt: new Date().toISOString(),
  };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings as Record<string, unknown>) ?? {};
  const existingICPs = (settings.icpDefinitions as ICPDefinition[]) ?? [];
  existingICPs.push(definition);
  settings.icpDefinitions = existingICPs;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });

  logger.info('ICP definition created', { organizationId, icpId: id, name: data.name });

  return definition;
}

/**
 * Delete an ICP definition by id.
 */
export async function deleteICPDefinition(
  organizationId: string,
  icpId: string,
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org?.settings) return false;

  const settings = org.settings as Record<string, unknown>;
  const existingICPs = (settings.icpDefinitions as ICPDefinition[]) ?? [];
  const idx = existingICPs.findIndex((d) => d.id === icpId);

  if (idx === -1) return false;

  existingICPs.splice(idx, 1);
  settings.icpDefinitions = existingICPs;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });

  logger.info('ICP definition deleted', { organizationId, icpId });
  return true;
}
