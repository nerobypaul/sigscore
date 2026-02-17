import { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// In-memory API usage tracking middleware
//
// Tracks per-org request counts, endpoint paths, methods, status codes,
// and response times in a rolling 24h window. Data is stored in memory
// and grouped by hour for efficient time-series queries.
//
// This is designed to be lightweight — it adds < 1ms overhead per request.
// ---------------------------------------------------------------------------

/** A single recorded API request. */
export interface ApiRequestRecord {
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  timestamp: number; // epoch ms
  hourBucket: string; // YYYY-MM-DD-HH
}

/** Per-org rolling buffer of API request records. */
const orgUsageStore = new Map<string, ApiRequestRecord[]>();

/** How long to retain records (24 hours). */
const RETENTION_MS = 24 * 60 * 60 * 1000;

/** How often to run eviction (every 5 minutes). */
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Eviction — remove records older than 24h
// ---------------------------------------------------------------------------

function evictStaleRecords(): void {
  const cutoff = Date.now() - RETENTION_MS;
  for (const [orgId, records] of orgUsageStore.entries()) {
    // Records are appended in order, so we can find the first valid index
    let firstValid = 0;
    while (firstValid < records.length && records[firstValid].timestamp < cutoff) {
      firstValid++;
    }
    if (firstValid === records.length) {
      orgUsageStore.delete(orgId);
    } else if (firstValid > 0) {
      orgUsageStore.set(orgId, records.slice(firstValid));
    }
  }
}

// Run periodic eviction
const evictionTimer = setInterval(evictStaleRecords, EVICTION_INTERVAL_MS);
// Allow the process to exit cleanly without waiting for the timer
if (evictionTimer.unref) {
  evictionTimer.unref();
}

// ---------------------------------------------------------------------------
// Helper: get hour bucket string from a timestamp
// ---------------------------------------------------------------------------

function toHourBucket(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}-${hh}`;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware that records API usage per organization.
 * Must be placed after authentication middleware so that `req.organizationId`
 * is available.
 */
export function apiUsageTracker(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Hook into the response finish event to capture status code + timing
  res.on('finish', () => {
    const orgId = req.organizationId;
    if (!orgId) return; // Skip requests without org context (e.g., auth endpoints)

    // Skip requests from the web frontend — only track external/programmatic API usage
    if (req.headers['x-client'] === 'web') return;

    const now = Date.now();
    const record: ApiRequestRecord = {
      endpoint: normalizeEndpoint(req.route?.path || req.path),
      method: req.method,
      statusCode: res.statusCode,
      responseTimeMs: now - startTime,
      timestamp: now,
      hourBucket: toHourBucket(now),
    };

    let records = orgUsageStore.get(orgId);
    if (!records) {
      records = [];
      orgUsageStore.set(orgId, records);
    }
    records.push(record);
  });

  next();
}

// ---------------------------------------------------------------------------
// Normalize endpoint paths — replace UUIDs and numeric IDs with :id
// ---------------------------------------------------------------------------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_ID_RE = /\/\d+(?=\/|$)/g;

function normalizeEndpoint(path: string): string {
  return path
    .replace(UUID_RE, ':id')
    .replace(NUMERIC_ID_RE, '/:id');
}

// ---------------------------------------------------------------------------
// Public accessor — used by the api-usage service
// ---------------------------------------------------------------------------

/**
 * Get all records for an organization within the retention window.
 * Returns a shallow copy to prevent external mutation.
 */
export function getOrgRecords(orgId: string): ApiRequestRecord[] {
  const records = orgUsageStore.get(orgId);
  if (!records) return [];

  // Opportunistic eviction for this org
  const cutoff = Date.now() - RETENTION_MS;
  let firstValid = 0;
  while (firstValid < records.length && records[firstValid].timestamp < cutoff) {
    firstValid++;
  }
  if (firstValid > 0) {
    records.splice(0, firstValid);
  }

  return [...records];
}
