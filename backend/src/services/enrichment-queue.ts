/**
 * Enrichment Queue Service
 *
 * Manages bulk contact enrichment batches with in-memory progress tracking.
 * Each batch tracks per-contact status (pending, processing, success, failed)
 * and auto-evicts after 24 hours.
 *
 * This service is separate from clearbit-enrichment.ts to avoid modifying
 * the existing enrichment pipeline. It orchestrates batches on top of the
 * existing enrichment queue infrastructure.
 */

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { enrichmentQueue, EnrichmentJobData } from '../jobs/queue';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContactEnrichmentStatus = 'pending' | 'processing' | 'success' | 'failed' | 'skipped';

export interface ContactEnrichmentResult {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  status: ContactEnrichmentStatus;
  fieldsEnriched: string[];
  error?: string;
  completedAt?: string;
}

export interface EnrichmentBatch {
  batchId: string;
  organizationId: string;
  status: 'queued' | 'processing' | 'completed' | 'cancelled';
  sources: string[];
  contacts: Map<string, ContactEnrichmentResult>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface BatchSummary {
  batchId: string;
  status: 'queued' | 'processing' | 'completed' | 'cancelled';
  total: number;
  completed: number;
  failed: number;
  pending: number;
  skipped: number;
  successRate: number;
  sources: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface BatchDetail extends BatchSummary {
  contacts: ContactEnrichmentResult[];
}

export interface EnrichmentQueueStats {
  totalEnrichedAllTime: number;
  overallSuccessRate: number;
  averageEnrichmentTimeMs: number;
  activeBatches: number;
}

// ---------------------------------------------------------------------------
// In-memory batch store with auto-eviction
// ---------------------------------------------------------------------------

const batchStore = new Map<string, EnrichmentBatch>();

const EVICTION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const EVICTION_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

// Stats accumulator (survives batch eviction)
let statsAccumulator = {
  totalEnriched: 0,
  totalAttempted: 0,
  totalDurationMs: 0,
  completedBatches: 0,
};

// Eviction timer
const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [batchId, batch] of batchStore.entries()) {
    const createdAt = new Date(batch.createdAt).getTime();
    if (now - createdAt > EVICTION_TTL_MS) {
      batchStore.delete(batchId);
      logger.debug('Evicted stale enrichment batch', { batchId });
    }
  }
}, EVICTION_INTERVAL_MS);

// Prevent the timer from keeping the process alive
if (evictionTimer.unref) {
  evictionTimer.unref();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeBatch(batch: EnrichmentBatch): BatchSummary {
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let skipped = 0;

  for (const contact of batch.contacts.values()) {
    switch (contact.status) {
      case 'success':
        completed++;
        break;
      case 'failed':
        failed++;
        break;
      case 'skipped':
        skipped++;
        break;
      case 'pending':
      case 'processing':
        pending++;
        break;
    }
  }

  const total = batch.contacts.size;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const createdMs = new Date(batch.createdAt).getTime();
  const endMs = batch.completedAt
    ? new Date(batch.completedAt).getTime()
    : Date.now();
  const durationMs = batch.status === 'completed' || batch.status === 'cancelled'
    ? endMs - createdMs
    : undefined;

  return {
    batchId: batch.batchId,
    status: batch.status,
    total,
    completed,
    failed,
    pending,
    skipped,
    successRate,
    sources: batch.sources,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    completedAt: batch.completedAt,
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Start a bulk enrichment batch for selected contacts.
 */
export async function startBulkEnrichment(
  organizationId: string,
  contactIds: string[] | 'all',
  options: { sources?: string[] } = {},
): Promise<BatchSummary> {
  const sources = options.sources ?? ['clearbit', 'github', 'npm', 'email'];

  // Resolve contact IDs
  let resolvedIds: string[];

  if (contactIds === 'all') {
    const contacts = await prisma.contact.findMany({
      where: { organizationId },
      select: { id: true },
      take: 10000, // Safety limit
    });
    resolvedIds = contacts.map((c) => c.id);
  } else {
    resolvedIds = contactIds;
  }

  if (resolvedIds.length === 0) {
    throw new Error('No contacts to enrich');
  }

  // Fetch contact info for display
  const contactRecords = await prisma.contact.findMany({
    where: {
      id: { in: resolvedIds },
      organizationId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });

  // Build batch
  const batchId = uuidv4();
  const now = new Date().toISOString();

  const contacts = new Map<string, ContactEnrichmentResult>();
  for (const contact of contactRecords) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
    contacts.set(contact.id, {
      contactId: contact.id,
      contactName: name,
      contactEmail: contact.email,
      status: 'pending',
      fieldsEnriched: [],
    });
  }

  const batch: EnrichmentBatch = {
    batchId,
    organizationId,
    status: 'queued',
    sources,
    contacts,
    createdAt: now,
    updatedAt: now,
  };

  batchStore.set(batchId, batch);

  // Queue individual enrichment jobs via BullMQ
  const jobs = contactRecords.map((contact) => ({
    name: `enrich-contact-batch-${batchId}`,
    data: {
      organizationId,
      contactId: contact.id,
    } as EnrichmentJobData,
    opts: {
      jobId: `batch-${batchId}-${contact.id}`,
    },
  }));

  await enrichmentQueue.addBulk(jobs);

  batch.status = 'processing';
  batch.updatedAt = new Date().toISOString();

  logger.info('Bulk enrichment batch started', {
    batchId,
    organizationId,
    contactCount: contactRecords.length,
    sources,
  });

  return summarizeBatch(batch);
}

/**
 * Get the status of a specific batch.
 */
export function getBatchStatus(batchId: string): BatchDetail | null {
  const batch = batchStore.get(batchId);
  if (!batch) return null;

  const summary = summarizeBatch(batch);
  const contacts = Array.from(batch.contacts.values());

  return {
    ...summary,
    contacts,
  };
}

/**
 * List recent enrichment batches for an organization.
 */
export function getBatchHistory(organizationId: string): BatchSummary[] {
  const batches: BatchSummary[] = [];

  for (const batch of batchStore.values()) {
    if (batch.organizationId === organizationId) {
      batches.push(summarizeBatch(batch));
    }
  }

  // Sort by createdAt descending
  batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return batches;
}

/**
 * Retry failed contacts in a batch by re-queuing them.
 */
export async function retryFailedInBatch(batchId: string): Promise<BatchSummary | null> {
  const batch = batchStore.get(batchId);
  if (!batch) return null;

  const failedContacts: string[] = [];

  for (const [contactId, result] of batch.contacts) {
    if (result.status === 'failed') {
      result.status = 'pending';
      result.error = undefined;
      result.fieldsEnriched = [];
      result.completedAt = undefined;
      failedContacts.push(contactId);
    }
  }

  if (failedContacts.length === 0) {
    return summarizeBatch(batch);
  }

  // Re-queue failed contacts
  const jobs = failedContacts.map((contactId) => ({
    name: `enrich-contact-batch-${batchId}-retry`,
    data: {
      organizationId: batch.organizationId,
      contactId,
    } as EnrichmentJobData,
    opts: {
      jobId: `batch-${batchId}-${contactId}-retry-${Date.now()}`,
    },
  }));

  await enrichmentQueue.addBulk(jobs);

  batch.status = 'processing';
  batch.updatedAt = new Date().toISOString();
  batch.completedAt = undefined;

  logger.info('Retrying failed contacts in batch', {
    batchId,
    retryCount: failedContacts.length,
  });

  return summarizeBatch(batch);
}

/**
 * Update a contact's enrichment status within a batch.
 * Called by the enrichment worker callback or via polling.
 */
export function updateContactStatus(
  batchId: string,
  contactId: string,
  status: ContactEnrichmentStatus,
  fieldsEnriched: string[] = [],
  error?: string,
): void {
  const batch = batchStore.get(batchId);
  if (!batch) return;

  const contact = batch.contacts.get(contactId);
  if (!contact) return;

  contact.status = status;
  contact.fieldsEnriched = fieldsEnriched;
  contact.error = error;
  if (status === 'success' || status === 'failed' || status === 'skipped') {
    contact.completedAt = new Date().toISOString();
  }

  batch.updatedAt = new Date().toISOString();

  // Check if the batch is complete
  let allDone = true;
  for (const c of batch.contacts.values()) {
    if (c.status === 'pending' || c.status === 'processing') {
      allDone = false;
      break;
    }
  }

  if (allDone && batch.status === 'processing') {
    batch.status = 'completed';
    batch.completedAt = new Date().toISOString();

    // Update stats accumulator
    let succeeded = 0;
    for (const c of batch.contacts.values()) {
      if (c.status === 'success') succeeded++;
    }
    statsAccumulator.totalEnriched += succeeded;
    statsAccumulator.totalAttempted += batch.contacts.size;
    statsAccumulator.completedBatches++;
    const durationMs = new Date(batch.completedAt).getTime() - new Date(batch.createdAt).getTime();
    statsAccumulator.totalDurationMs += durationMs;

    logger.info('Enrichment batch completed', {
      batchId: batch.batchId,
      total: batch.contacts.size,
      succeeded,
    });
  }
}

/**
 * Cancel an active batch (marks remaining pending contacts as skipped).
 */
export function cancelBatch(batchId: string): BatchSummary | null {
  const batch = batchStore.get(batchId);
  if (!batch) return null;

  for (const contact of batch.contacts.values()) {
    if (contact.status === 'pending' || contact.status === 'processing') {
      contact.status = 'skipped';
      contact.completedAt = new Date().toISOString();
    }
  }

  batch.status = 'cancelled';
  batch.completedAt = new Date().toISOString();
  batch.updatedAt = new Date().toISOString();

  logger.info('Enrichment batch cancelled', { batchId });

  return summarizeBatch(batch);
}

/**
 * Get aggregated enrichment queue stats.
 */
export function getEnrichmentQueueStats(): EnrichmentQueueStats {
  let activeBatches = 0;
  for (const batch of batchStore.values()) {
    if (batch.status === 'queued' || batch.status === 'processing') {
      activeBatches++;
    }
  }

  const avgTime = statsAccumulator.completedBatches > 0
    ? Math.round(statsAccumulator.totalDurationMs / statsAccumulator.completedBatches)
    : 0;

  const successRate = statsAccumulator.totalAttempted > 0
    ? Math.round((statsAccumulator.totalEnriched / statsAccumulator.totalAttempted) * 100)
    : 0;

  return {
    totalEnrichedAllTime: statsAccumulator.totalEnriched,
    overallSuccessRate: successRate,
    averageEnrichmentTimeMs: avgTime,
    activeBatches,
  };
}

/**
 * Find a batch ID that contains a given contact ID (used by workers).
 */
export function findBatchForContact(contactId: string): string | null {
  for (const [batchId, batch] of batchStore.entries()) {
    if (batch.status === 'processing' && batch.contacts.has(contactId)) {
      return batchId;
    }
  }
  return null;
}
