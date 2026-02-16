import { getOrgRecords } from '../middleware/api-usage';
import { getPlanForOrg } from './usage';
import type { PlanName } from './usage';

// ---------------------------------------------------------------------------
// Rate limit definitions per tier (requests per minute)
// ---------------------------------------------------------------------------

export interface RateLimitTier {
  label: string;
  pathPrefix: string;
  limit: number;
}

const RATE_LIMITS_BY_PLAN: Record<PlanName, RateLimitTier[]> = {
  free: [
    { label: 'Auth endpoints', pathPrefix: '/api/v1/auth', limit: 5 },
    { label: 'API endpoints', pathPrefix: '/api/', limit: 100 },
    { label: 'Webhook endpoints', pathPrefix: '/api/v1/webhooks', limit: 200 },
    { label: 'Signal ingest', pathPrefix: '/api/v1/signals', limit: 500 },
  ],
  pro: [
    { label: 'Auth endpoints', pathPrefix: '/api/v1/auth', limit: 10 },
    { label: 'API endpoints', pathPrefix: '/api/', limit: 200 },
    { label: 'Webhook endpoints', pathPrefix: '/api/v1/webhooks', limit: 400 },
    { label: 'Signal ingest', pathPrefix: '/api/v1/signals', limit: 1000 },
  ],
  growth: [
    { label: 'Auth endpoints', pathPrefix: '/api/v1/auth', limit: 20 },
    { label: 'API endpoints', pathPrefix: '/api/', limit: 500 },
    { label: 'Webhook endpoints', pathPrefix: '/api/v1/webhooks', limit: 1000 },
    { label: 'Signal ingest', pathPrefix: '/api/v1/signals', limit: 2500 },
  ],
  scale: [
    { label: 'Auth endpoints', pathPrefix: '/api/v1/auth', limit: 50 },
    { label: 'API endpoints', pathPrefix: '/api/', limit: 2000 },
    { label: 'Webhook endpoints', pathPrefix: '/api/v1/webhooks', limit: 5000 },
    { label: 'Signal ingest', pathPrefix: '/api/v1/signals', limit: 10000 },
  ],
};

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

function startOfDay(): number {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).getTime();
}

function startOfWeek(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), diff).getTime();
}

function startOfMonth(): number {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).getTime();
}

function toHourBucket(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface UsageSummary {
  requestsToday: number;
  requestsThisWeek: number;
  requestsThisMonth: number;
  avgResponseTimeMs: number;
  errorRate: number; // percentage 0-100
  topEndpoints: { endpoint: string; method: string; count: number }[];
}

/**
 * Returns a summary of API usage for the given organization.
 */
export function getUsageSummary(orgId: string): UsageSummary {
  const records = getOrgRecords(orgId);

  const todayCutoff = startOfDay();
  const weekCutoff = startOfWeek();
  const monthCutoff = startOfMonth();

  let requestsToday = 0;
  let requestsThisWeek = 0;
  let requestsThisMonth = 0;
  let totalResponseTime = 0;
  let errorCount = 0;

  const endpointCounts = new Map<string, { endpoint: string; method: string; count: number }>();

  for (const record of records) {
    if (record.timestamp >= todayCutoff) requestsToday++;
    if (record.timestamp >= weekCutoff) requestsThisWeek++;
    if (record.timestamp >= monthCutoff) requestsThisMonth++;

    totalResponseTime += record.responseTimeMs;
    if (record.statusCode >= 400) errorCount++;

    const key = `${record.method}:${record.endpoint}`;
    const existing = endpointCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      endpointCounts.set(key, {
        endpoint: record.endpoint,
        method: record.method,
        count: 1,
      });
    }
  }

  const topEndpoints = [...endpointCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    requestsToday,
    requestsThisWeek,
    requestsThisMonth,
    avgResponseTimeMs: records.length > 0 ? Math.round(totalResponseTime / records.length) : 0,
    errorRate: records.length > 0 ? Math.round((errorCount / records.length) * 10000) / 100 : 0,
    topEndpoints,
  };
}

export interface TimeSeriesPoint {
  hour: string; // YYYY-MM-DD-HH
  count: number;
  errors: number;
  avgResponseTimeMs: number;
}

/**
 * Returns hourly request counts for the given org over the last N hours.
 */
export function getUsageTimeSeries(orgId: string, hours: number = 24): TimeSeriesPoint[] {
  const records = getOrgRecords(orgId);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  // Build buckets for the requested range
  const buckets = new Map<string, { count: number; errors: number; totalMs: number }>();

  // Pre-fill all hourly buckets
  const now = Date.now();
  for (let h = 0; h < hours; h++) {
    const ts = now - (hours - 1 - h) * 60 * 60 * 1000;
    const bucket = toHourBucket(ts);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, { count: 0, errors: 0, totalMs: 0 });
    }
  }

  // Fill in actual data
  for (const record of records) {
    if (record.timestamp < cutoff) continue;
    const bucket = record.hourBucket;
    const data = buckets.get(bucket);
    if (data) {
      data.count++;
      data.totalMs += record.responseTimeMs;
      if (record.statusCode >= 400) data.errors++;
    } else {
      buckets.set(bucket, {
        count: 1,
        errors: record.statusCode >= 400 ? 1 : 0,
        totalMs: record.responseTimeMs,
      });
    }
  }

  // Convert to sorted array
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, data]) => ({
      hour,
      count: data.count,
      errors: data.errors,
      avgResponseTimeMs: data.count > 0 ? Math.round(data.totalMs / data.count) : 0,
    }));
}

export interface EndpointBreakdown {
  method: string;
  endpoint: string;
  count: number;
  avgResponseTimeMs: number;
  errorRate: number; // percentage 0-100
  errors: number;
}

/**
 * Returns the top 20 endpoints by request count with latency/error stats.
 */
export function getEndpointBreakdown(orgId: string): EndpointBreakdown[] {
  const records = getOrgRecords(orgId);

  const endpoints = new Map<string, {
    method: string;
    endpoint: string;
    count: number;
    totalMs: number;
    errors: number;
  }>();

  for (const record of records) {
    const key = `${record.method}:${record.endpoint}`;
    const existing = endpoints.get(key);
    if (existing) {
      existing.count++;
      existing.totalMs += record.responseTimeMs;
      if (record.statusCode >= 400) existing.errors++;
    } else {
      endpoints.set(key, {
        method: record.method,
        endpoint: record.endpoint,
        count: 1,
        totalMs: record.responseTimeMs,
        errors: record.statusCode >= 400 ? 1 : 0,
      });
    }
  }

  return [...endpoints.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((ep) => ({
      method: ep.method,
      endpoint: ep.endpoint,
      count: ep.count,
      avgResponseTimeMs: ep.count > 0 ? Math.round(ep.totalMs / ep.count) : 0,
      errorRate: ep.count > 0 ? Math.round((ep.errors / ep.count) * 10000) / 100 : 0,
      errors: ep.errors,
    }));
}

export interface RateLimitStatus {
  plan: PlanName;
  limits: {
    label: string;
    currentUsage: number;
    limit: number;
    percentage: number; // 0-100
  }[];
}

/**
 * Returns the current rate limit consumption vs tier limits for the org.
 */
export async function getRateLimitStatus(orgId: string): Promise<RateLimitStatus> {
  const plan = await getPlanForOrg(orgId);
  const records = getOrgRecords(orgId);
  const tierLimits = RATE_LIMITS_BY_PLAN[plan];

  // Count requests in the last minute per rate limit category
  const oneMinuteAgo = Date.now() - 60 * 1000;
  const recentRecords = records.filter((r) => r.timestamp >= oneMinuteAgo);

  const limits = tierLimits.map((tier) => {
    const matchingRequests = recentRecords.filter((r) => {
      const fullPath = `/api/v1${r.endpoint}`;
      return fullPath.startsWith(tier.pathPrefix) || r.endpoint.startsWith(tier.pathPrefix);
    });

    const currentUsage = matchingRequests.length;
    const percentage = tier.limit > 0
      ? Math.min(Math.round((currentUsage / tier.limit) * 100), 100)
      : 0;

    return {
      label: tier.label,
      currentUsage,
      limit: tier.limit,
      percentage,
    };
  });

  return { plan, limits };
}
