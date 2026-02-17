import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { broadcastSignalCreated } from './websocket';
import { resolveSignalIdentity } from './identity-resolution';
import { fireSignalCreated } from './webhook-events';
import { logger } from '../utils/logger';
import { generateDeduplicationKey } from '../utils/deduplication';

/** 24-hour deduplication window */
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SignalInput {
  sourceId: string;
  type: string;
  actorId?: string;
  accountId?: string;
  anonymousId?: string;
  metadata: Record<string, unknown>;
  idempotencyKey?: string;
  timestamp?: string;
}

export interface SignalFilters {
  type?: string;
  sourceId?: string;
  sourceType?: string;
  accountId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const ingestSignal = async (organizationId: string, data: SignalInput) => {
  // Look up the source type for dedup key generation
  const source = await prisma.signalSource.findUnique({
    where: { id: data.sourceId },
    select: { type: true },
  });

  if (!source) {
    throw Object.assign(
      new Error(`Signal source '${data.sourceId}' not found. Create a signal source first via POST /api/v1/signal-sources, or use the SDK.`),
      { statusCode: 400 },
    );
  }

  const sourceType = source.type;

  // Generate deduplication key
  const dedupKey = generateDeduplicationKey(
    sourceType,
    data.actorId,
    data.type,
    data.metadata,
  );

  // Check for an existing signal with the same dedup key within the 24h window
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await prisma.signal.findFirst({
    where: {
      organizationId,
      deduplicationKey: dedupKey,
      timestamp: { gte: windowStart },
    },
    include: {
      source: { select: { id: true, name: true, type: true } },
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      account: { select: { id: true, name: true, domain: true } },
    },
  });

  if (existing) {
    logger.info(`Signal deduplicated: key=${dedupKey} existingId=${existing.id}`);
    return { ...existing, deduplicated: true };
  }

  // Run identity resolution engine for comprehensive actor/account matching
  const resolved = await resolveSignalIdentity(organizationId, {
    actorId: data.actorId,
    accountId: data.accountId,
    anonymousId: data.anonymousId,
    metadata: data.metadata,
  });

  const signal = await prisma.signal.create({
    data: {
      organizationId,
      sourceId: data.sourceId,
      type: data.type,
      actorId: resolved.actorId,
      accountId: resolved.accountId,
      anonymousId: data.anonymousId || null,
      metadata: data.metadata as Prisma.InputJsonValue,
      idempotencyKey: data.idempotencyKey || null,
      deduplicationKey: dedupKey,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    },
    include: {
      source: { select: { id: true, name: true, type: true } },
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      account: { select: { id: true, name: true, domain: true } },
    },
  });

  broadcastSignalCreated(organizationId, signal);

  // Fire webhook event to Zapier/Make subscribers (fire-and-forget)
  fireSignalCreated(organizationId, signal as unknown as Record<string, unknown>)
    .catch((err) => logger.error('Webhook fire error (signal.created):', err));

  return { ...signal, deduplicated: false };
};

export const ingestSignalBatch = async (organizationId: string, signals: SignalInput[]) => {
  const results: { success: boolean; signal?: unknown; error?: string; input?: SignalInput; deduplicated?: boolean }[] = [];

  // Pre-fetch source types for all unique sourceIds in the batch
  const uniqueSourceIds = [...new Set(signals.map((s) => s.sourceId))];
  const sources = await prisma.signalSource.findMany({
    where: { id: { in: uniqueSourceIds } },
    select: { id: true, type: true },
  });
  const sourceTypeMap = new Map(sources.map((s) => [s.id, s.type]));

  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS);

  // Generate dedup keys for the whole batch
  const dedupKeys = signals.map((data) => {
    const srcType = sourceTypeMap.get(data.sourceId) ?? 'UNKNOWN';
    return generateDeduplicationKey(srcType, data.actorId, data.type, data.metadata);
  });

  // Batch-check existing dedup keys within the window
  const existingSignals = await prisma.signal.findMany({
    where: {
      organizationId,
      deduplicationKey: { in: dedupKeys },
      timestamp: { gte: windowStart },
    },
    include: {
      source: { select: { id: true, name: true, type: true } },
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      account: { select: { id: true, name: true, domain: true } },
    },
  });
  const existingByKey = new Map(
    existingSignals.map((s) => [s.deduplicationKey, s]),
  );

  // Separate duplicates from new signals
  const newSignals: { idx: number; data: SignalInput; dedupKey: string }[] = [];
  for (let i = 0; i < signals.length; i++) {
    const dup = existingByKey.get(dedupKeys[i]);
    if (dup) {
      logger.info(`Batch signal deduplicated: key=${dedupKeys[i]} existingId=${dup.id}`);
      results[i] = { success: true, signal: dup, deduplicated: true };
    } else {
      newSignals.push({ idx: i, data: signals[i], dedupKey: dedupKeys[i] });
    }
  }

  if (newSignals.length > 0) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const txResults: { idx: number; signal: unknown }[] = [];

        // Pre-resolve identities outside transaction for each new signal
        const resolvedList = await Promise.all(
          newSignals.map(({ data }) =>
            resolveSignalIdentity(organizationId, {
              actorId: data.actorId,
              accountId: data.accountId,
              anonymousId: data.anonymousId,
              metadata: data.metadata,
            }),
          ),
        );

        for (let j = 0; j < newSignals.length; j++) {
          const { idx, data, dedupKey } = newSignals[j];
          const resolved = resolvedList[j];

          const signal = await tx.signal.create({
            data: {
              organizationId,
              sourceId: data.sourceId,
              type: data.type,
              actorId: resolved.actorId,
              accountId: resolved.accountId,
              anonymousId: data.anonymousId || null,
              metadata: data.metadata as Prisma.InputJsonValue,
              idempotencyKey: data.idempotencyKey || null,
              deduplicationKey: dedupKey,
              timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
            },
            include: {
              source: { select: { id: true, name: true, type: true } },
              actor: { select: { id: true, firstName: true, lastName: true, email: true } },
              account: { select: { id: true, name: true, domain: true } },
            },
          });

          txResults.push({ idx, signal });
        }

        return txResults;
      });

      // All succeeded -- map to success results and broadcast each
      for (const { idx, signal } of created) {
        results[idx] = { success: true, signal, deduplicated: false };
        broadcastSignalCreated(organizationId, signal);
      }
    } catch (error: unknown) {
      // Transaction failed -- all new signals rolled back, report each as failed
      const message = error instanceof Error ? error.message : 'Unknown error';
      for (const { idx, data } of newSignals) {
        results[idx] = { success: false, error: message, input: data };
      }
    }
  }

  return results;
};

export const getSignals = async (organizationId: string, filters: SignalFilters) => {
  const { type, sourceId, sourceType, accountId, actorId, from, to, search, page = 1, limit } = filters;
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 50));
  const skip = (page - 1) * clampedLimit;

  const where: Prisma.SignalWhereInput = {
    organizationId,
    ...(type && { type }),
    ...(sourceId && { sourceId }),
    ...(sourceType && { source: { type: sourceType as Prisma.EnumSignalSourceTypeFilter['equals'] } }),
    ...(accountId && { accountId }),
    ...(actorId && { actorId }),
    ...((from || to) && {
      timestamp: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
    ...(search && {
      OR: [
        { type: { contains: search, mode: 'insensitive' as const } },
        { metadata: { path: [], string_contains: search } },
        { actor: { OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ] } },
        { account: { name: { contains: search, mode: 'insensitive' as const } } },
      ],
    }),
  };

  const [signals, total] = await Promise.all([
    prisma.signal.findMany({
      where,
      skip,
      take: clampedLimit,
      include: {
        source: { select: { id: true, name: true, type: true } },
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        account: { select: { id: true, name: true, domain: true } },
      },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.signal.count({ where }),
  ]);

  return {
    signals,
    pagination: { page, limit: clampedLimit, total, totalPages: Math.ceil(total / clampedLimit) },
  };
};

export const getSignalsByAccount = async (organizationId: string, accountId: string, limit = 50) => {
  return prisma.signal.findMany({
    where: { organizationId, accountId },
    take: limit,
    include: {
      source: { select: { id: true, name: true, type: true } },
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { timestamp: 'desc' },
  });
};

export const getAccountTimeline = async (organizationId: string, accountId: string, limit = 100) => {
  const [signals, activities] = await Promise.all([
    prisma.signal.findMany({
      where: { organizationId, accountId },
      take: limit,
      include: {
        source: { select: { id: true, name: true, type: true } },
        actor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.activity.findMany({
      where: { organizationId, companyId: accountId },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Merge and sort by timestamp
  type TimelineEntry =
    | { kind: 'signal'; timestamp: Date; data: (typeof signals)[number] }
    | { kind: 'activity'; timestamp: Date; data: (typeof activities)[number] };

  const timeline: TimelineEntry[] = [
    ...signals.map((s) => ({ kind: 'signal' as const, timestamp: s.timestamp, data: s })),
    ...activities.map((a) => ({ kind: 'activity' as const, timestamp: a.createdAt, data: a })),
  ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return timeline.slice(0, limit);
};

/**
 * Returns deduplication statistics for an organization.
 * - Total signals ingested (last 24h and last 7d)
 * - Count of signals with a deduplicationKey set (indicates dedup-eligible)
 * - Duplicate groups: distinct dedup keys that appear more than once
 *   (these would have been blocked, so the deduplicated count is inferred
 *    from the total attempted minus total stored)
 */
export const getDeduplicationStats = async (organizationId: string) => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - DEDUP_WINDOW_MS);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DEDUP_WINDOW_MS);

  const [total24h, total7d, withDedupKey24h, withDedupKey7d, duplicateGroups24h, duplicateGroups7d] =
    await Promise.all([
      // Total signals in last 24h
      prisma.signal.count({
        where: { organizationId, timestamp: { gte: twentyFourHoursAgo } },
      }),
      // Total signals in last 7d
      prisma.signal.count({
        where: { organizationId, timestamp: { gte: sevenDaysAgo } },
      }),
      // Signals with dedup keys in last 24h (dedup-enabled signals)
      prisma.signal.count({
        where: {
          organizationId,
          deduplicationKey: { not: null },
          timestamp: { gte: twentyFourHoursAgo },
        },
      }),
      // Signals with dedup keys in last 7d
      prisma.signal.count({
        where: {
          organizationId,
          deduplicationKey: { not: null },
          timestamp: { gte: sevenDaysAgo },
        },
      }),
      // Count duplicate groups in 24h (dedup keys appearing > 1 time)
      prisma.$queryRaw<{ deduplicated_count: bigint }[]>`
        SELECT COALESCE(SUM(cnt - 1), 0) as deduplicated_count
        FROM (
          SELECT "deduplicationKey", COUNT(*)::bigint as cnt
          FROM "signals"
          WHERE "organizationId" = ${organizationId}
            AND "deduplicationKey" IS NOT NULL
            AND "timestamp" >= ${twentyFourHoursAgo}
          GROUP BY "deduplicationKey"
          HAVING COUNT(*) > 1
        ) dupes
      `,
      // Count duplicate groups in 7d
      prisma.$queryRaw<{ deduplicated_count: bigint }[]>`
        SELECT COALESCE(SUM(cnt - 1), 0) as deduplicated_count
        FROM (
          SELECT "deduplicationKey", COUNT(*)::bigint as cnt
          FROM "signals"
          WHERE "organizationId" = ${organizationId}
            AND "deduplicationKey" IS NOT NULL
            AND "timestamp" >= ${sevenDaysAgo}
          GROUP BY "deduplicationKey"
          HAVING COUNT(*) > 1
        ) dupes
      `,
    ]);

  const deduplicatedCount24h = Number(duplicateGroups24h[0]?.deduplicated_count ?? 0);
  const deduplicatedCount7d = Number(duplicateGroups7d[0]?.deduplicated_count ?? 0);

  // The effective total includes stored signals + blocked duplicates
  const effectiveTotal24h = total24h + deduplicatedCount24h;
  const effectiveTotal7d = total7d + deduplicatedCount7d;

  return {
    last24h: {
      totalIngested: effectiveTotal24h,
      totalStored: total24h,
      deduplicated: deduplicatedCount24h,
      dedupEligible: withDedupKey24h,
      dedupRate: effectiveTotal24h > 0
        ? Math.round((deduplicatedCount24h / effectiveTotal24h) * 10000) / 100
        : 0,
    },
    last7d: {
      totalIngested: effectiveTotal7d,
      totalStored: total7d,
      deduplicated: deduplicatedCount7d,
      dedupEligible: withDedupKey7d,
      dedupRate: effectiveTotal7d > 0
        ? Math.round((deduplicatedCount7d / effectiveTotal7d) * 10000) / 100
        : 0,
    },
  };
};
