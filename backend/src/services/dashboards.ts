import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { Prisma, DealStage } from '@prisma/client';

// ---------------------------------------------------------------------------
// Widget type definitions
// ---------------------------------------------------------------------------

export type WidgetType =
  | 'total_contacts'
  | 'total_companies'
  | 'total_deals'
  | 'total_signals_today'
  | 'signals_by_source'
  | 'deal_pipeline'
  | 'hot_accounts'
  | 'recent_signals'
  | 'signal_trend'
  | 'top_companies_by_signals'
  | 'conversion_funnel'
  | 'team_activity';

const VALID_WIDGET_TYPES: WidgetType[] = [
  'total_contacts',
  'total_companies',
  'total_deals',
  'total_signals_today',
  'signals_by_source',
  'deal_pipeline',
  'hot_accounts',
  'recent_signals',
  'signal_trend',
  'top_companies_by_signals',
  'conversion_funnel',
  'team_activity',
];

// ---------------------------------------------------------------------------
// Dashboard CRUD
// ---------------------------------------------------------------------------

export async function getDashboards(organizationId: string, userId: string) {
  return prisma.dashboard.findMany({
    where: { organizationId, userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getDashboard(organizationId: string, dashboardId: string) {
  const dashboard = await prisma.dashboard.findFirst({
    where: { id: dashboardId, organizationId },
  });

  if (!dashboard) {
    throw new AppError('Dashboard not found', 404);
  }

  return dashboard;
}

export async function createDashboard(
  organizationId: string,
  userId: string,
  name: string,
  layout?: Prisma.InputJsonValue
) {
  const dashboard = await prisma.dashboard.create({
    data: {
      organizationId,
      userId,
      name,
      layout: layout ?? ([] as unknown as Prisma.InputJsonValue),
    },
  });

  logger.info('Dashboard created', { dashboardId: dashboard.id, userId });
  return dashboard;
}

export async function updateDashboard(
  organizationId: string,
  dashboardId: string,
  userId: string,
  data: { name?: string; layout?: Prisma.InputJsonValue }
) {
  const existing = await prisma.dashboard.findFirst({
    where: { id: dashboardId, organizationId },
  });

  if (!existing) {
    throw new AppError('Dashboard not found', 404);
  }

  if (existing.userId !== userId) {
    throw new AppError('Not authorized to update this dashboard', 403);
  }

  const dashboard = await prisma.dashboard.update({
    where: { id: dashboardId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.layout !== undefined && { layout: data.layout }),
    },
  });

  return dashboard;
}

export async function deleteDashboard(
  organizationId: string,
  dashboardId: string,
  userId: string
) {
  const existing = await prisma.dashboard.findFirst({
    where: { id: dashboardId, organizationId },
  });

  if (!existing) {
    throw new AppError('Dashboard not found', 404);
  }

  if (existing.userId !== userId) {
    throw new AppError('Not authorized to delete this dashboard', 403);
  }

  await prisma.dashboard.delete({ where: { id: dashboardId } });
  logger.info('Dashboard deleted', { dashboardId });
}

export async function setDefault(
  organizationId: string,
  userId: string,
  dashboardId: string
) {
  const existing = await prisma.dashboard.findFirst({
    where: { id: dashboardId, organizationId },
  });

  if (!existing) {
    throw new AppError('Dashboard not found', 404);
  }

  if (existing.userId !== userId) {
    throw new AppError('Not authorized to set this dashboard as default', 403);
  }

  // Clear existing defaults for this user
  await prisma.dashboard.updateMany({
    where: { organizationId, userId, isDefault: true },
    data: { isDefault: false },
  });

  // Set the new default
  const dashboard = await prisma.dashboard.update({
    where: { id: dashboardId },
    data: { isDefault: true },
  });

  return dashboard;
}

// ---------------------------------------------------------------------------
// Widget data fetchers
// ---------------------------------------------------------------------------

export async function getWidgetData(
  organizationId: string,
  widgetType: string,
  _config: Record<string, unknown> = {}
) {
  if (!VALID_WIDGET_TYPES.includes(widgetType as WidgetType)) {
    throw new AppError(`Unknown widget type: ${widgetType}`, 400);
  }

  switch (widgetType as WidgetType) {
    case 'total_contacts':
      return fetchTotalContacts(organizationId);
    case 'total_companies':
      return fetchTotalCompanies(organizationId);
    case 'total_deals':
      return fetchTotalDeals(organizationId);
    case 'total_signals_today':
      return fetchTotalSignalsToday(organizationId);
    case 'signals_by_source':
      return fetchSignalsBySource(organizationId);
    case 'deal_pipeline':
      return fetchDealPipeline(organizationId);
    case 'hot_accounts':
      return fetchHotAccounts(organizationId);
    case 'recent_signals':
      return fetchRecentSignals(organizationId);
    case 'signal_trend':
      return fetchSignalTrend(organizationId);
    case 'top_companies_by_signals':
      return fetchTopCompaniesBySignals(organizationId);
    case 'conversion_funnel':
      return fetchConversionFunnel(organizationId);
    case 'team_activity':
      return fetchTeamActivity(organizationId);
    default:
      throw new AppError(`Widget type not implemented: ${widgetType}`, 400);
  }
}

// --- Individual widget data fetchers ---

async function fetchTotalContacts(organizationId: string) {
  const total = await prisma.contact.count({ where: { organizationId } });

  // Yesterday count for trend
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const addedToday = await prisma.contact.count({
    where: { organizationId, createdAt: { gte: todayStart } },
  });

  return { value: total, trend: addedToday, label: 'Total Contacts' };
}

async function fetchTotalCompanies(organizationId: string) {
  const total = await prisma.company.count({ where: { organizationId } });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const addedToday = await prisma.company.count({
    where: { organizationId, createdAt: { gte: todayStart } },
  });

  return { value: total, trend: addedToday, label: 'Total Companies' };
}

async function fetchTotalDeals(organizationId: string) {
  const total = await prisma.deal.count({ where: { organizationId } });

  const agg = await prisma.deal.aggregate({
    where: { organizationId },
    _sum: { amount: true },
  });

  return {
    value: total,
    totalValue: agg._sum.amount ?? 0,
    label: 'Total Deals',
  };
}

async function fetchTotalSignalsToday(organizationId: string) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const count = await prisma.signal.count({
    where: { organizationId, timestamp: { gte: todayStart } },
  });

  // Compare to yesterday
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const yesterdayCount = await prisma.signal.count({
    where: {
      organizationId,
      timestamp: { gte: yesterdayStart, lt: todayStart },
    },
  });

  const trend = yesterdayCount > 0
    ? Math.round(((count - yesterdayCount) / yesterdayCount) * 100)
    : count > 0 ? 100 : 0;

  return { value: count, trend, label: 'Signals Today' };
}

async function fetchSignalsBySource(organizationId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const signals = await prisma.signal.groupBy({
    by: ['sourceId'],
    where: { organizationId, timestamp: { gte: thirtyDaysAgo } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  // Fetch source names
  const sourceIds = signals.map((s) => s.sourceId);
  const sources = await prisma.signalSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, name: true, type: true },
  });
  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  return {
    data: signals.map((s) => ({
      source: sourceMap.get(s.sourceId)?.name ?? 'Unknown',
      type: sourceMap.get(s.sourceId)?.type ?? 'UNKNOWN',
      count: s._count.id,
    })),
  };
}

async function fetchDealPipeline(organizationId: string) {
  const deals = await prisma.deal.groupBy({
    by: ['stage'],
    where: { organizationId },
    _count: { id: true },
    _sum: { amount: true },
  });

  const stageOrder = [
    'ANONYMOUS_USAGE',
    'IDENTIFIED',
    'ACTIVATED',
    'TEAM_ADOPTION',
    'EXPANSION_SIGNAL',
    'SALES_QUALIFIED',
    'NEGOTIATION',
    'CLOSED_WON',
    'CLOSED_LOST',
  ];

  const sortedDeals = deals.sort(
    (a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage)
  );

  return {
    data: sortedDeals.map((d) => ({
      stage: d.stage,
      count: d._count.id,
      value: d._sum.amount ?? 0,
    })),
  };
}

async function fetchHotAccounts(organizationId: string) {
  const scores = await prisma.accountScore.findMany({
    where: { organizationId, tier: 'HOT' },
    orderBy: { score: 'desc' },
    take: 5,
    include: {
      account: { select: { id: true, name: true, domain: true } },
    },
  });

  return {
    data: scores.map((s) => ({
      id: s.id,
      accountId: s.accountId,
      name: s.account.name,
      domain: s.account.domain,
      score: s.score,
      trend: s.trend,
      signalCount: s.signalCount,
      userCount: s.userCount,
    })),
  };
}

async function fetchRecentSignals(organizationId: string) {
  const signals = await prisma.signal.findMany({
    where: { organizationId },
    orderBy: { timestamp: 'desc' },
    take: 10,
    include: {
      source: { select: { id: true, name: true, type: true } },
      actor: { select: { id: true, firstName: true, lastName: true } },
      account: { select: { id: true, name: true } },
    },
  });

  return {
    data: signals.map((s) => ({
      id: s.id,
      type: s.type,
      timestamp: s.timestamp,
      source: s.source?.name ?? 'Unknown',
      actor: s.actor
        ? `${s.actor.firstName} ${s.actor.lastName}`
        : null,
      account: s.account?.name ?? null,
    })),
  };
}

async function fetchSignalTrend(organizationId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Use raw query for date-based grouping
  const result = await prisma.$queryRaw<
    Array<{ day: Date; count: bigint }>
  >`
    SELECT DATE_TRUNC('day', "timestamp") as day, COUNT(*)::bigint as count
    FROM signals
    WHERE "organizationId" = ${organizationId}
      AND "timestamp" >= ${thirtyDaysAgo}
    GROUP BY day
    ORDER BY day ASC
  `;

  // Fill in missing days
  const dayMap = new Map<string, number>();
  for (const row of result) {
    const key = new Date(row.day).toISOString().slice(0, 10);
    dayMap.set(key, Number(row.count));
  }

  const days: Array<{ date: string; count: number }> = [];
  const current = new Date(thirtyDaysAgo);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  while (current <= today) {
    const key = current.toISOString().slice(0, 10);
    days.push({ date: key, count: dayMap.get(key) ?? 0 });
    current.setDate(current.getDate() + 1);
  }

  return { data: days };
}

async function fetchTopCompaniesBySignals(organizationId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const groups = await prisma.signal.groupBy({
    by: ['accountId'],
    where: {
      organizationId,
      accountId: { not: null },
      timestamp: { gte: thirtyDaysAgo },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const accountIds = groups
    .map((g) => g.accountId)
    .filter((id): id is string => id !== null);

  const companies = await prisma.company.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, name: true, domain: true },
  });
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  return {
    data: groups
      .filter((g) => g.accountId !== null)
      .map((g) => ({
        companyId: g.accountId!,
        name: companyMap.get(g.accountId!)?.name ?? 'Unknown',
        domain: companyMap.get(g.accountId!)?.domain ?? null,
        signalCount: g._count.id,
      })),
  };
}

async function fetchConversionFunnel(organizationId: string) {
  // Same as deal_pipeline but structured for funnel display
  const deals = await prisma.deal.groupBy({
    by: ['stage'],
    where: { organizationId },
    _count: { id: true },
  });

  const stageOrder = [
    'ANONYMOUS_USAGE',
    'IDENTIFIED',
    'ACTIVATED',
    'TEAM_ADOPTION',
    'EXPANSION_SIGNAL',
    'SALES_QUALIFIED',
    'NEGOTIATION',
    'CLOSED_WON',
  ];

  const stageLabels: Record<string, string> = {
    ANONYMOUS_USAGE: 'Anonymous Usage',
    IDENTIFIED: 'Identified',
    ACTIVATED: 'Activated',
    TEAM_ADOPTION: 'Team Adoption',
    EXPANSION_SIGNAL: 'Expansion Signal',
    SALES_QUALIFIED: 'Sales Qualified',
    NEGOTIATION: 'Negotiation',
    CLOSED_WON: 'Closed Won',
  };

  const dealMap = new Map(deals.map((d) => [d.stage, d._count.id]));

  return {
    data: stageOrder.map((stage) => ({
      stage,
      label: stageLabels[stage] ?? stage,
      count: dealMap.get(stage as DealStage) ?? 0,
    })),
  };
}

async function fetchTeamActivity(organizationId: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const activities = await prisma.activity.groupBy({
    by: ['userId'],
    where: { organizationId, createdAt: { gte: sevenDaysAgo } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const userIds = activities.map((a) => a.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, avatar: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  return {
    data: activities.map((a) => ({
      userId: a.userId,
      name: userMap.has(a.userId)
        ? `${userMap.get(a.userId)!.firstName} ${userMap.get(a.userId)!.lastName}`
        : 'Unknown',
      avatar: userMap.get(a.userId)?.avatar ?? null,
      activityCount: a._count.id,
    })),
  };
}
