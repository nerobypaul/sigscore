/**
 * Enrichment Queue Service
 *
 * Manages bulk contact enrichment batches with database-backed persistence.
 * Each batch tracks per-contact status (pending, processing, success, failed)
 * and stores results in the organization's settings JSON so they survive
 * server restarts.
 *
 * Batch metadata is stored in organization.settings under the key
 * "enrichmentBatches" as an array of serializable batch objects. Individual
 * contact enrichment results are stored on each Contact's customFields under
 * the key "enrichmentBatchResults".
 */

import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
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

export interface SerializedBatch {
  batchId: string;
  organizationId: string;
  status: 'queued' | 'processing' | 'completed' | 'cancelled';
  sources: string[];
  contactIds: string[];
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
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Read enrichment batches array from organization settings.
 */
async function readBatches(organizationId: string): Promise<SerializedBatch[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return [];
  const settings = (org.settings as Record<string, unknown>) || {};
  return (settings.enrichmentBatches as SerializedBatch[]) || [];
}

/**
 * Write enrichment batches array back to organization settings.
 * Keeps only the most recent 50 batches to avoid unbounded growth.
 */
async function writeBatches(organizationId: string, batches: SerializedBatch[]): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return;

  const settings = ((org.settings as Record<string, unknown>) || {});
  // Keep only the latest 50 batches
  settings.enrichmentBatches = batches.slice(0, 50);

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Read a contact's batch enrichment result from its customFields.
 */
function readContactBatchResult(
  customFields: unknown,
  batchId: string,
): ContactEnrichmentResult | null {
  const fields = (customFields as Record<string, unknown>) || {};
  const results = (fields.enrichmentBatchResults as Record<string, ContactEnrichmentResult>) || {};
  return results[batchId] || null;
}

/**
 * Write a contact's batch enrichment result into its customFields.
 */
async function writeContactBatchResult(
  contactId: string,
  batchId: string,
  result: ContactEnrichmentResult,
): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { customFields: true },
  });
  if (!contact) return;

  const fields = ((contact.customFields as Record<string, unknown>) || {});
  const results = ((fields.enrichmentBatchResults as Record<string, unknown>) || {});
  results[batchId] = result;
  fields.enrichmentBatchResults = results;

  await prisma.contact.update({
    where: { id: contactId },
    data: { customFields: fields as unknown as Prisma.InputJsonValue },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a BatchSummary from a serialized batch + contact results fetched from DB.
 */
function summarizeFromResults(
  batch: SerializedBatch,
  contactResults: ContactEnrichmentResult[],
): BatchSummary {
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let skipped = 0;

  for (const contact of contactResults) {
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

  const total = batch.contactIds.length;
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

/**
 * Fetch all contact enrichment results for a given batch from the database.
 */
async function fetchContactResultsForBatch(
  batch: SerializedBatch,
): Promise<ContactEnrichmentResult[]> {
  if (batch.contactIds.length === 0) return [];

  const contacts = await prisma.contact.findMany({
    where: {
      id: { in: batch.contactIds },
      organizationId: batch.organizationId,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      customFields: true,
    },
  });

  const results: ContactEnrichmentResult[] = [];

  for (const contact of contacts) {
    const storedResult = readContactBatchResult(contact.customFields, batch.batchId);
    if (storedResult) {
      results.push(storedResult);
    } else {
      // Contact exists but has no stored result yet -- treat as pending
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
      results.push({
        contactId: contact.id,
        contactName: name,
        contactEmail: contact.email,
        status: 'pending',
        fieldsEnriched: [],
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// In-memory cache (for active batch performance -- backed by DB)
// ---------------------------------------------------------------------------

// Light in-memory cache for active batch IDs to avoid DB reads on every
// worker callback. The canonical data always lives in the database.
const activeBatchCache = new Map<string, SerializedBatch>();

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
      customFields: true,
    },
  });

  // Build batch
  const batchId = uuidv4();
  const now = new Date().toISOString();

  const serializedBatch: SerializedBatch = {
    batchId,
    organizationId,
    status: 'queued',
    sources,
    contactIds: contactRecords.map((c) => c.id),
    createdAt: now,
    updatedAt: now,
  };

  // Store initial pending results on each contact
  const contactResults: ContactEnrichmentResult[] = [];
  for (const contact of contactRecords) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unknown';
    const result: ContactEnrichmentResult = {
      contactId: contact.id,
      contactName: name,
      contactEmail: contact.email,
      status: 'pending',
      fieldsEnriched: [],
    };
    contactResults.push(result);
    await writeContactBatchResult(contact.id, batchId, result);
  }

  // Persist the batch metadata
  const existingBatches = await readBatches(organizationId);
  existingBatches.unshift(serializedBatch);
  await writeBatches(organizationId, existingBatches);

  // Cache for active tracking
  activeBatchCache.set(batchId, serializedBatch);

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

  // Update status to processing
  serializedBatch.status = 'processing';
  serializedBatch.updatedAt = new Date().toISOString();
  await updateBatchInDb(organizationId, serializedBatch);

  logger.info('Bulk enrichment batch started', {
    batchId,
    organizationId,
    contactCount: contactRecords.length,
    sources,
  });

  return summarizeFromResults(serializedBatch, contactResults);
}

/**
 * Update a batch record in the organization settings.
 */
async function updateBatchInDb(
  organizationId: string,
  updatedBatch: SerializedBatch,
): Promise<void> {
  const batches = await readBatches(organizationId);
  const idx = batches.findIndex((b) => b.batchId === updatedBatch.batchId);
  if (idx >= 0) {
    batches[idx] = updatedBatch;
  } else {
    batches.unshift(updatedBatch);
  }
  await writeBatches(organizationId, batches);
}

/**
 * Get the status of a specific batch.
 */
export async function getBatchStatus(batchId: string, organizationId?: string): Promise<BatchDetail | null> {
  // Try cache first
  let batch = activeBatchCache.get(batchId) || null;

  // If not cached, search the database
  if (!batch && organizationId) {
    const batches = await readBatches(organizationId);
    batch = batches.find((b) => b.batchId === batchId) || null;
  }

  // If still not found, scan all orgs with enrichmentBatches (fallback)
  if (!batch) {
    const orgs = await prisma.organization.findMany({
      where: {
        settings: {
          path: ['enrichmentBatches'],
          not: Prisma.AnyNull,
        },
      },
      select: { id: true, settings: true },
    });

    for (const org of orgs) {
      const settings = (org.settings as Record<string, unknown>) || {};
      const orgBatches = (settings.enrichmentBatches as SerializedBatch[]) || [];
      const found = orgBatches.find((b) => b.batchId === batchId);
      if (found) {
        batch = found;
        break;
      }
    }
  }

  if (!batch) return null;

  const contactResults = await fetchContactResultsForBatch(batch);
  const summary = summarizeFromResults(batch, contactResults);

  return {
    ...summary,
    contacts: contactResults,
  };
}

/**
 * List recent enrichment batches for an organization.
 */
export async function getBatchHistory(organizationId: string): Promise<BatchSummary[]> {
  const batches = await readBatches(organizationId);
  const summaries: BatchSummary[] = [];

  for (const batch of batches) {
    const contactResults = await fetchContactResultsForBatch(batch);
    summaries.push(summarizeFromResults(batch, contactResults));
  }

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return summaries;
}

/**
 * Retry failed contacts in a batch by re-queuing them.
 */
export async function retryFailedInBatch(batchId: string, organizationId: string): Promise<BatchSummary | null> {
  const batches = await readBatches(organizationId);
  const batch = batches.find((b) => b.batchId === batchId);
  if (!batch) return null;

  const contactResults = await fetchContactResultsForBatch(batch);
  const failedContacts: string[] = [];

  for (const result of contactResults) {
    if (result.status === 'failed') {
      // Reset to pending
      const resetResult: ContactEnrichmentResult = {
        ...result,
        status: 'pending',
        error: undefined,
        fieldsEnriched: [],
        completedAt: undefined,
      };
      await writeContactBatchResult(result.contactId, batchId, resetResult);
      failedContacts.push(result.contactId);
    }
  }

  if (failedContacts.length === 0) {
    return summarizeFromResults(batch, contactResults);
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
  await updateBatchInDb(organizationId, batch);
  activeBatchCache.set(batchId, batch);

  logger.info('Retrying failed contacts in batch', {
    batchId,
    retryCount: failedContacts.length,
  });

  const updatedResults = await fetchContactResultsForBatch(batch);
  return summarizeFromResults(batch, updatedResults);
}

/**
 * Update a contact's enrichment status within a batch.
 * Called by the enrichment worker callback or via polling.
 */
export async function updateContactStatus(
  batchId: string,
  contactId: string,
  status: ContactEnrichmentStatus,
  fieldsEnriched: string[] = [],
  error?: string,
): Promise<void> {
  // Read the contact to get current name/email for the result
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      customFields: true,
    },
  });

  if (!contact) return;

  const existingResult = readContactBatchResult(contact.customFields, batchId);
  const name = existingResult?.contactName
    || [contact.firstName, contact.lastName].filter(Boolean).join(' ')
    || 'Unknown';

  const updatedResult: ContactEnrichmentResult = {
    contactId: contact.id,
    contactName: name,
    contactEmail: existingResult?.contactEmail ?? contact.email,
    status,
    fieldsEnriched,
    error,
    completedAt: (status === 'success' || status === 'failed' || status === 'skipped')
      ? new Date().toISOString()
      : undefined,
  };

  await writeContactBatchResult(contactId, batchId, updatedResult);

  // Check if batch is now complete and update batch status
  const cached = activeBatchCache.get(batchId);
  if (cached && cached.status === 'processing') {
    const allResults = await fetchContactResultsForBatch(cached);
    const allDone = allResults.every(
      (c) => c.status === 'success' || c.status === 'failed' || c.status === 'skipped',
    );

    if (allDone) {
      cached.status = 'completed';
      cached.completedAt = new Date().toISOString();
      cached.updatedAt = new Date().toISOString();
      await updateBatchInDb(cached.organizationId, cached);
      activeBatchCache.delete(batchId);

      const succeeded = allResults.filter((c) => c.status === 'success').length;
      logger.info('Enrichment batch completed', {
        batchId: cached.batchId,
        total: cached.contactIds.length,
        succeeded,
      });
    } else {
      cached.updatedAt = new Date().toISOString();
    }
  }
}

/**
 * Cancel an active batch (marks remaining pending contacts as skipped).
 */
export async function cancelBatch(batchId: string, organizationId: string): Promise<BatchSummary | null> {
  const batches = await readBatches(organizationId);
  const batch = batches.find((b) => b.batchId === batchId);
  if (!batch) return null;

  const contactResults = await fetchContactResultsForBatch(batch);

  for (const result of contactResults) {
    if (result.status === 'pending' || result.status === 'processing') {
      const cancelled: ContactEnrichmentResult = {
        ...result,
        status: 'skipped',
        completedAt: new Date().toISOString(),
      };
      await writeContactBatchResult(result.contactId, batchId, cancelled);
    }
  }

  batch.status = 'cancelled';
  batch.completedAt = new Date().toISOString();
  batch.updatedAt = new Date().toISOString();
  await updateBatchInDb(organizationId, batch);
  activeBatchCache.delete(batchId);

  logger.info('Enrichment batch cancelled', { batchId });

  const updatedResults = await fetchContactResultsForBatch(batch);
  return summarizeFromResults(batch, updatedResults);
}

/**
 * Get aggregated enrichment queue stats.
 */
export async function getEnrichmentQueueStats(organizationId: string): Promise<EnrichmentQueueStats> {
  const batches = await readBatches(organizationId);

  let totalEnriched = 0;
  let totalAttempted = 0;
  let totalDurationMs = 0;
  let completedBatchCount = 0;
  let activeBatches = 0;

  for (const batch of batches) {
    if (batch.status === 'queued' || batch.status === 'processing') {
      activeBatches++;
    }

    if (batch.status === 'completed') {
      completedBatchCount++;
      const contactResults = await fetchContactResultsForBatch(batch);
      const succeeded = contactResults.filter((c) => c.status === 'success').length;
      totalEnriched += succeeded;
      totalAttempted += batch.contactIds.length;

      if (batch.completedAt) {
        const durationMs = new Date(batch.completedAt).getTime() - new Date(batch.createdAt).getTime();
        totalDurationMs += durationMs;
      }
    }
  }

  const avgTime = completedBatchCount > 0
    ? Math.round(totalDurationMs / completedBatchCount)
    : 0;

  const successRate = totalAttempted > 0
    ? Math.round((totalEnriched / totalAttempted) * 100)
    : 0;

  return {
    totalEnrichedAllTime: totalEnriched,
    overallSuccessRate: successRate,
    averageEnrichmentTimeMs: avgTime,
    activeBatches,
  };
}

/**
 * Find a batch ID that contains a given contact ID (used by workers).
 */
export async function findBatchForContact(contactId: string): Promise<string | null> {
  // Check active cache first
  for (const [batchId, batch] of activeBatchCache.entries()) {
    if (batch.status === 'processing' && batch.contactIds.includes(contactId)) {
      return batchId;
    }
  }
  return null;
}
