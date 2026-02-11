import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

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
  // Try to resolve account from actor's contact if actorId provided
  let accountId = data.accountId;
  if (!accountId && data.actorId) {
    const contact = await prisma.contact.findFirst({
      where: { id: data.actorId, organizationId },
      select: { companyId: true },
    });
    if (contact?.companyId) {
      accountId = contact.companyId;
    }
  }

  // Try to resolve via anonymousId (email domain matching)
  if (!accountId && data.anonymousId && data.anonymousId.includes('@')) {
    const domain = data.anonymousId.split('@')[1];
    const company = await prisma.company.findFirst({
      where: { organizationId, domain },
      select: { id: true },
    });
    if (company) {
      accountId = company.id;
    }
  }

  return prisma.signal.create({
    data: {
      organizationId,
      sourceId: data.sourceId,
      type: data.type,
      actorId: data.actorId || null,
      accountId: accountId || null,
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
};

export const ingestSignalBatch = async (organizationId: string, signals: SignalInput[]) => {
  const results = [];
  for (const signal of signals) {
    try {
      const result = await ingestSignal(organizationId, signal);
      results.push({ success: true, signal: result });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ success: false, error: message, input: signal });
    }
  }
  return results;
};

export const getSignals = async (organizationId: string, filters: SignalFilters) => {
  const { type, sourceId, accountId, actorId, from, to, page = 1, limit = 50 } = filters;
  const skip = (page - 1) * limit;

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
      take: limit,
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
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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
