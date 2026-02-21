import fs from 'fs';
import path from 'path';
import os from 'os';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import type { DataExportJobData } from '../jobs/queue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportResult {
  filePath: string;
  fileName: string;
  totalRecords: number;
  recordCounts: Record<string, number>;
  format: 'json' | 'csv';
  sizeBytes: number;
}

export interface ExportStatus {
  jobId: string;
  organizationId: string;
  userId: string;
  format: 'json' | 'csv';
  entities: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filePath?: string;
  fileName?: string;
  totalRecords?: number;
  recordCounts?: Record<string, number>;
  sizeBytes?: number;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Redis-backed export history store (shared across app + worker processes)
// ---------------------------------------------------------------------------

const EXPORT_KEY_PREFIX = 'sigscore:export:';
const EXPORT_ORG_PREFIX = 'sigscore:exports:org:';
const EXPORT_TTL = 86400; // 24 hours — exports auto-expire

export async function getExportStatus(jobId: string): Promise<ExportStatus | undefined> {
  try {
    const raw = await redis.get(`${EXPORT_KEY_PREFIX}${jobId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export async function getExportHistory(organizationId: string): Promise<ExportStatus[]> {
  try {
    const jobIds = await redis.smembers(`${EXPORT_ORG_PREFIX}${organizationId}`);
    if (jobIds.length === 0) return [];

    const pipeline = redis.pipeline();
    for (const jobId of jobIds) {
      pipeline.get(`${EXPORT_KEY_PREFIX}${jobId}`);
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const entries: ExportStatus[] = [];
    for (const [err, val] of results) {
      if (!err && val) {
        try { entries.push(JSON.parse(val as string)); } catch { /* skip */ }
      }
    }
    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return entries;
  } catch {
    return [];
  }
}

export async function setExportStatus(jobId: string, status: ExportStatus): Promise<void> {
  try {
    await redis.set(
      `${EXPORT_KEY_PREFIX}${jobId}`,
      JSON.stringify(status),
      'EX',
      EXPORT_TTL,
    );
    // Track job ID in org set for listing
    await redis.sadd(`${EXPORT_ORG_PREFIX}${status.organizationId}`, jobId);
    await redis.expire(`${EXPORT_ORG_PREFIX}${status.organizationId}`, EXPORT_TTL);
  } catch (err) {
    logger.warn('Failed to persist export status to Redis', { jobId, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// CSV Helpers
// ---------------------------------------------------------------------------

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(fields: string[], record: Record<string, unknown>): string {
  return fields.map((f) => escapeCsvField(record[f])).join(',');
}

function buildCsvHeader(fields: string[]): string {
  return fields.map((f) => escapeCsvField(f)).join(',');
}

// ---------------------------------------------------------------------------
// Entity field definitions (controls which columns appear in export)
// ---------------------------------------------------------------------------

const ENTITY_FIELDS: Record<string, string[]> = {
  contacts: [
    'id', 'firstName', 'lastName', 'email', 'phone', 'mobile', 'title',
    'address', 'city', 'state', 'postalCode', 'country',
    'linkedIn', 'twitter', 'github',
    'companyId', 'notes', 'customFields',
    'createdAt', 'updatedAt',
  ],
  companies: [
    'id', 'name', 'domain', 'industry', 'size', 'logo',
    'email', 'phone', 'website',
    'address', 'city', 'state', 'postalCode', 'country',
    'linkedIn', 'twitter', 'githubOrg',
    'description', 'customFields',
    'createdAt', 'updatedAt',
  ],
  deals: [
    'id', 'title', 'amount', 'currency', 'stage', 'probability',
    'contactId', 'companyId', 'ownerId',
    'expectedCloseDate', 'closedAt',
    'description', 'customFields',
    'createdAt', 'updatedAt',
  ],
  signals: [
    'id', 'sourceId', 'type', 'actorId', 'accountId', 'anonymousId',
    'metadata', 'idempotencyKey', 'timestamp',
    'createdAt',
  ],
  activities: [
    'id', 'type', 'title', 'description', 'status', 'priority',
    'dueDate', 'completedAt',
    'userId', 'contactId', 'companyId', 'dealId',
    'customFields',
    'createdAt', 'updatedAt',
  ],
};

// Map entity name to Prisma model accessor name
const ENTITY_MODEL_MAP: Record<string, string> = {
  contacts: 'contact',
  companies: 'company',
  deals: 'deal',
  signals: 'signal',
  activities: 'activity',
};

const VALID_ENTITIES = Object.keys(ENTITY_FIELDS);
const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Core export generator
// ---------------------------------------------------------------------------

/**
 * Generate a full data export for the given job configuration.
 * Streams records in batches of 1000 to handle large datasets.
 */
export async function generateExport(jobData: DataExportJobData): Promise<ExportResult> {
  const { organizationId, format, entities } = jobData;

  // Validate entity names
  const validEntities = entities.filter((e) => VALID_ENTITIES.includes(e));
  if (validEntities.length === 0) {
    throw new Error(`No valid entities specified. Valid options: ${VALID_ENTITIES.join(', ')}`);
  }

  // Fetch organization name for metadata
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  const orgName = org?.name ?? 'Unknown';

  // Create a temp directory for the export
  const exportDir = path.join(os.tmpdir(), 'sigscore-exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `sigscore-export-${timestamp}.${format === 'csv' ? 'csv' : 'json'}`;
  const filePath = path.join(exportDir, fileName);

  const recordCounts: Record<string, number> = {};
  let totalRecords = 0;

  if (format === 'json') {
    await generateJsonExport(filePath, organizationId, orgName, validEntities, recordCounts);
  } else {
    await generateCsvExport(filePath, organizationId, validEntities, recordCounts);
  }

  for (const count of Object.values(recordCounts)) {
    totalRecords += count;
  }

  const stat = fs.statSync(filePath);

  logger.info('Data export generated', {
    organizationId,
    format,
    entities: validEntities,
    totalRecords,
    sizeBytes: stat.size,
    filePath,
  });

  return {
    filePath,
    fileName,
    totalRecords,
    recordCounts,
    format,
    sizeBytes: stat.size,
  };
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

async function generateJsonExport(
  filePath: string,
  organizationId: string,
  orgName: string,
  entities: string[],
  recordCounts: Record<string, number>,
): Promise<void> {
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });

  // Build metadata header
  const metadata = {
    exportDate: new Date().toISOString(),
    organizationName: orgName,
    organizationId,
    entities,
    format: 'json' as const,
  };

  writeStream.write('{\n');
  writeStream.write(`  "metadata": ${JSON.stringify(metadata, null, 2).split('\n').join('\n  ')},\n`);

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const isLast = i === entities.length - 1;

    writeStream.write(`  "${entity}": [\n`);

    let offset = 0;
    let batchCount = 0;
    let firstRecord = true;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const records = await fetchBatch(entity, organizationId, offset, BATCH_SIZE);
      if (records.length === 0) break;

      for (const record of records) {
        if (!firstRecord) {
          writeStream.write(',\n');
        }
        writeStream.write(`    ${JSON.stringify(record)}`);
        firstRecord = false;
      }

      batchCount += records.length;
      offset += records.length;

      if (records.length < BATCH_SIZE) break;
    }

    recordCounts[entity] = batchCount;
    writeStream.write(`\n  ]${isLast ? '' : ','}\n`);
  }

  writeStream.write('}\n');

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

async function generateCsvExport(
  filePath: string,
  organizationId: string,
  entities: string[],
  recordCounts: Record<string, number>,
): Promise<void> {
  const writeStream = fs.createWriteStream(filePath, { encoding: 'utf-8' });

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const fields = ENTITY_FIELDS[entity];
    if (!fields) continue;

    // Section header for multi-entity CSV
    if (entities.length > 1) {
      writeStream.write(`# --- ${entity.toUpperCase()} ---\n`);
    }

    // Write CSV header row
    writeStream.write(buildCsvHeader(fields) + '\n');

    let offset = 0;
    let batchCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const records = await fetchBatch(entity, organizationId, offset, BATCH_SIZE);
      if (records.length === 0) break;

      for (const record of records) {
        writeStream.write(buildCsvRow(fields, record as Record<string, unknown>) + '\n');
      }

      batchCount += records.length;
      offset += records.length;

      if (records.length < BATCH_SIZE) break;
    }

    recordCounts[entity] = batchCount;

    // Blank line between entity sections
    if (i < entities.length - 1) {
      writeStream.write('\n');
    }
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve());
    writeStream.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Batch fetcher (Prisma cursor-based pagination via skip/take)
// ---------------------------------------------------------------------------

async function fetchBatch(
  entity: string,
  organizationId: string,
  skip: number,
  take: number,
): Promise<Record<string, unknown>[]> {
  const modelName = ENTITY_MODEL_MAP[entity];
  if (!modelName) return [];

  const fields = ENTITY_FIELDS[entity];
  if (!fields) return [];

  // Build a select object from the field list
  const select: Record<string, boolean> = {};
  for (const field of fields) {
    select[field] = true;
  }

  // Use prisma dynamic model access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[modelName];
  if (!model) return [];

  const records = await model.findMany({
    where: { organizationId },
    select,
    skip,
    take,
    orderBy: { createdAt: 'asc' },
  });

  return records as Record<string, unknown>[];
}
