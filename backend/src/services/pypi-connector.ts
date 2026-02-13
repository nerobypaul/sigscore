import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const PYPI_STATS_API = 'https://pypistats.org/api/packages';
const PYPI_REGISTRY_API = 'https://pypi.org/pypi';
const REQUEST_TIMEOUT_MS = 10_000;

interface PypiDownloadsResponse {
  data: {
    last_week: number;
  };
}

interface PypiRegistryResponse {
  info: {
    name: string;
    version: string;
    summary: string | null;
    author: string | null;
    author_email: string | null;
    maintainer: string | null;
    maintainer_email: string | null;
    home_page: string | null;
  };
}

interface PypiSourceConfig {
  packages: string[];
}

interface SyncResult {
  synced: number;
  errors: string[];
}

interface TestResult {
  healthy: boolean;
  results: Array<{
    package: string;
    downloads: number | null;
    error?: string;
  }>;
}

/**
 * Fetches weekly download stats for a single PyPI package.
 */
async function fetchDownloads(packageName: string): Promise<PypiDownloadsResponse> {
  const url = `${PYPI_STATS_API}/${encodeURIComponent(packageName)}/recent`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`PyPI stats API returned ${response.status} for ${packageName}`);
  }

  return response.json() as Promise<PypiDownloadsResponse>;
}

/**
 * Fetches registry metadata for a single PyPI package.
 */
async function fetchRegistryMetadata(packageName: string): Promise<PypiRegistryResponse> {
  const url = `${PYPI_REGISTRY_API}/${encodeURIComponent(packageName)}/json`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`PyPI registry API returned ${response.status} for ${packageName}`);
  }

  return response.json() as Promise<PypiRegistryResponse>;
}

/**
 * Extracts a domain from an email address.
 * Filters out generic email providers that cannot be meaningfully matched to companies.
 */
function extractCompanyDomain(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;

  const domain = parts[1].toLowerCase();

  const genericProviders = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
    'outlook.com',
    'protonmail.com',
    'icloud.com',
    'live.com',
    'aol.com',
    'mail.com',
    'zoho.com',
    'fastmail.com',
    'pm.me',
    'proton.me',
    'hey.com',
    'tutanota.com',
  ]);

  if (genericProviders.has(domain)) return null;

  return domain;
}

/**
 * Extracts individual email addresses from a PyPI email field.
 * PyPI may store multiple emails in a single comma-separated string.
 */
function parseEmails(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));
}

/**
 * Syncs download data for a single PyPI signal source.
 *
 * Reads the signal source config from DB, fetches download stats and registry
 * metadata for each configured package, creates idempotent signals, and
 * attempts to match maintainer/author email domains to existing company records.
 */
export async function syncPypiSource(
  organizationId: string,
  sourceId: string,
): Promise<SyncResult> {
  const source = await prisma.signalSource.findFirst({
    where: { id: sourceId, organizationId, type: 'PYPI' },
  });

  if (!source) {
    throw new Error(`PYPI signal source ${sourceId} not found for organization ${organizationId}`);
  }

  const config = source.config as unknown as PypiSourceConfig;

  if (!config?.packages || !Array.isArray(config.packages) || config.packages.length === 0) {
    await prisma.signalSource.update({
      where: { id: sourceId },
      data: {
        status: 'ERROR',
        errorMessage: 'No packages configured',
      },
    });
    return { synced: 0, errors: ['No packages configured in source'] };
  }

  let synced = 0;
  const errors: string[] = [];

  for (const packageName of config.packages) {
    try {
      // Fetch download stats
      const downloads = await fetchDownloads(packageName);

      // Fetch registry metadata (best-effort, do not block on failure)
      let registryData: PypiRegistryResponse | null = null;
      try {
        registryData = await fetchRegistryMetadata(packageName);
      } catch (regErr) {
        logger.warn('Failed to fetch PyPI registry metadata', {
          package: packageName,
          error: regErr,
        });
      }

      // Attempt company domain matching from maintainer/author emails
      let accountId: string | null = null;
      if (registryData?.info) {
        const candidateEmails = [
          ...parseEmails(registryData.info.maintainer_email),
          ...parseEmails(registryData.info.author_email),
        ];

        for (const email of candidateEmails) {
          const domain = extractCompanyDomain(email);
          if (!domain) continue;

          const company = await prisma.company.findFirst({
            where: { organizationId, domain },
            select: { id: true },
          });
          if (company) {
            accountId = company.id;
            break;
          }
        }
      }

      // Build metadata
      const today = new Date().toISOString().slice(0, 10);
      const metadata: Record<string, unknown> = {
        package: packageName,
        downloads: downloads.data.last_week,
        period: 'last-week',
      };

      if (registryData?.info) {
        if (registryData.info.version) metadata.latestVersion = registryData.info.version;
        if (registryData.info.summary) metadata.summary = registryData.info.summary;
        if (registryData.info.author) metadata.author = registryData.info.author;
        if (registryData.info.home_page) metadata.homePage = registryData.info.home_page;
      }

      const idempotencyKey = `pypi_${packageName}_${today}`;

      // Create signal (skip gracefully on duplicate idempotency key)
      try {
        await prisma.signal.create({
          data: {
            organizationId,
            sourceId: source.id,
            type: 'pypi_downloads',
            actorId: null,
            accountId,
            anonymousId: null,
            metadata: metadata as unknown as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: new Date(),
          },
        });
        synced++;
      } catch (createErr: unknown) {
        // Prisma P2002 = unique constraint violation (idempotency key)
        if (
          createErr instanceof Prisma.PrismaClientKnownRequestError &&
          createErr.code === 'P2002'
        ) {
          logger.debug('Skipping duplicate PyPI signal', {
            package: packageName,
            idempotencyKey,
          });
        } else {
          throw createErr;
        }
      }
    } catch (pkgErr: unknown) {
      const message =
        pkgErr instanceof Error ? pkgErr.message : `Unknown error for ${packageName}`;
      logger.error('Failed to sync PyPI package', { package: packageName, error: pkgErr });
      errors.push(`${packageName}: ${message}`);
    }
  }

  // Update source status
  const hasErrors = errors.length > 0;
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: {
      lastSyncAt: new Date(),
      status: hasErrors && synced === 0 ? 'ERROR' : 'ACTIVE',
      errorMessage: hasErrors ? errors.join('; ') : null,
    },
  });

  logger.info('PyPI source sync completed', {
    sourceId,
    organizationId,
    synced,
    errors: errors.length,
  });

  return { synced, errors };
}

/**
 * Syncs all ACTIVE PyPI sources across all organizations.
 * Intended to be called from a cron job on a regular schedule.
 */
export async function syncAllPypiSources(): Promise<void> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'PYPI', status: 'ACTIVE' },
    select: { id: true, organizationId: true, name: true },
  });

  logger.info(`Starting sync for ${sources.length} PyPI source(s)`);

  for (const source of sources) {
    try {
      const result = await syncPypiSource(source.organizationId, source.id);
      logger.info('PyPI source synced', {
        sourceId: source.id,
        name: source.name,
        synced: result.synced,
        errors: result.errors.length,
      });
    } catch (err) {
      logger.error('Failed to sync PyPI source', {
        sourceId: source.id,
        name: source.name,
        error: err,
      });
    }
  }
}

/**
 * Tests whether the PyPI API is reachable for the given package names.
 * Returns per-package download counts or errors without persisting any data.
 */
export async function testPypiConnection(packages: string[]): Promise<TestResult> {
  const results: TestResult['results'] = [];
  let allHealthy = true;

  for (const packageName of packages) {
    try {
      const downloads = await fetchDownloads(packageName);
      results.push({
        package: packageName,
        downloads: downloads.data.last_week,
      });
    } catch (err: unknown) {
      allHealthy = false;
      const message = err instanceof Error ? err.message : 'Unknown error';
      results.push({
        package: packageName,
        downloads: null,
        error: message,
      });
    }
  }

  return { healthy: allHealthy, results };
}
