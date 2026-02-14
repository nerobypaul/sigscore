import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { broadcastSignalCreated } from './websocket';
import { resolveSignalIdentity } from './identity-resolution';

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
  accountId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const ingestSignal = async (organizationId: string, data: SignalInput) => {
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
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    },
    include: {
      source: { select: { id: true, name: true, type: true } },
      actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      account: { select: { id: true, name: true, domain: true } },
    },
  });

  broadcastSignalCreated(organizationId, signal);

  return signal;
};

export const ingestSignalBatch = async (organizationId: string, signals: SignalInput[]) => {
  const results: { success: boolean; signal?: unknown; error?: string; input?: SignalInput }[] = [];

  try {
    const created = await prisma.$transaction(async (tx) => {
      const txResults = [];

      // Pre-resolve identities outside transaction for each signal
      const resolvedList = await Promise.all(
        signals.map((data) =>
          resolveSignalIdentity(organizationId, {
            actorId: data.actorId,
            accountId: data.accountId,
            anonymousId: data.anonymousId,
            metadata: data.metadata,
          }),
        ),
      );

      for (let idx = 0; idx < signals.length; idx++) {
        const data = signals[idx];
        const resolved = resolvedList[idx];

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
            timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
          },
          include: {
            source: { select: { id: true, name: true, type: true } },
            actor: { select: { id: true, firstName: true, lastName: true, email: true } },
            account: { select: { id: true, name: true, domain: true } },
          },
        });

        txResults.push(signal);
      }

      return txResults;
    });

    // All succeeded — map to success results and broadcast each
    for (let i = 0; i < created.length; i++) {
      results.push({ success: true, signal: created[i] });
      broadcastSignalCreated(organizationId, created[i]);
    }
  } catch (error: unknown) {
    // Transaction failed — all signals rolled back, report each as failed
    const message = error instanceof Error ? error.message : 'Unknown error';
    for (const signal of signals) {
      results.push({ success: false, error: message, input: signal });
    }
  }

  return results;
};

export const getSignals = async (organizationId: string, filters: SignalFilters) => {
  const { type, sourceId, accountId, actorId, from, to, page = 1, limit } = filters;
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 50));
  const skip = (page - 1) * clampedLimit;

  const where: Prisma.SignalWhereInput = {
    organizationId,
    ...(type && { type }),
    ...(sourceId && { sourceId }),
    ...(accountId && { accountId }),
    ...(actorId && { actorId }),
    ...((from || to) && {
      timestamp: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
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
