import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Plan limit definitions
// ---------------------------------------------------------------------------

export type PlanName = 'free' | 'pro' | 'growth' | 'scale';

export interface PlanLimits {
  contacts: number;
  signalsPerMonth: number;
  users: number;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: { contacts: 1_000, signalsPerMonth: 5_000, users: 1 },
  pro: { contacts: 25_000, signalsPerMonth: 100_000, users: 10 },
  growth: { contacts: 100_000, signalsPerMonth: 500_000, users: 25 },
  scale: { contacts: Infinity, signalsPerMonth: Infinity, users: Infinity },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function isPlanName(value: unknown): value is PlanName {
  return typeof value === 'string' && value in PLAN_LIMITS;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the plan stored in `organization.settings.plan`, defaulting to 'free'.
 */
export async function getPlanForOrg(organizationId: string): Promise<PlanName> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    logger.warn(`getPlanForOrg: organization ${organizationId} not found, defaulting to free`);
    return 'free';
  }

  const settings = org.settings as Record<string, unknown> | null;
  const plan = settings?.plan;

  if (isPlanName(plan)) {
    return plan;
  }

  return 'free';
}

/**
 * Return current usage counts for an organization.
 */
export async function getUsage(organizationId: string) {
  const [contactCount, signalCount, userCount] = await Promise.all([
    prisma.contact.count({ where: { organizationId } }),
    prisma.signal.count({
      where: {
        organizationId,
        timestamp: { gte: startOfMonth() },
      },
    }),
    prisma.userOrganization.count({ where: { organizationId } }),
  ]);

  return { contacts: contactCount, signals: signalCount, users: userCount };
}

export type Resource = 'contacts' | 'signals' | 'users';

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  plan: PlanName;
}

/**
 * Check whether the organization is within limits for a given resource.
 */
export async function checkLimit(
  organizationId: string,
  resource: Resource,
): Promise<LimitCheck> {
  const [plan, usage] = await Promise.all([
    getPlanForOrg(organizationId),
    getUsage(organizationId),
  ]);

  const limits = PLAN_LIMITS[plan];

  const resourceToLimit: Record<Resource, { current: number; limit: number }> = {
    contacts: { current: usage.contacts, limit: limits.contacts },
    signals: { current: usage.signals, limit: limits.signalsPerMonth },
    users: { current: usage.users, limit: limits.users },
  };

  const { current, limit } = resourceToLimit[resource];

  return {
    allowed: current < limit,
    current,
    limit,
    plan,
  };
}

// ---------------------------------------------------------------------------
// Usage summary — returns current usage vs limits for all dimensions
// ---------------------------------------------------------------------------

export interface UsageDimension {
  current: number;
  limit: number | null; // null = unlimited
  percentage: number;   // 0-100, capped at 100
}

export interface UsageSummary {
  plan: PlanName;
  contacts: UsageDimension;
  signals: UsageDimension;
  users: UsageDimension;
}

/**
 * Returns a complete usage summary for an organization, including
 * current counts, plan limits, and usage percentages.
 */
export async function getUsageSummary(organizationId: string): Promise<UsageSummary> {
  const [plan, usage] = await Promise.all([
    getPlanForOrg(organizationId),
    getUsage(organizationId),
  ]);

  const limits = PLAN_LIMITS[plan];

  function dimension(current: number, limit: number): UsageDimension {
    const isUnlimited = !isFinite(limit);
    return {
      current,
      limit: isUnlimited ? null : limit,
      percentage: isUnlimited ? 0 : Math.min(Math.round((current / limit) * 100), 100),
    };
  }

  return {
    plan,
    contacts: dimension(usage.contacts, limits.contacts),
    signals: dimension(usage.signals, limits.signalsPerMonth),
    users: dimension(usage.users, limits.users),
  };
}
