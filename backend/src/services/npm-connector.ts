import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const NPM_DOWNLOADS_API = 'https://api.npmjs.org/downloads/point/last-week';
const NPM_REGISTRY_API = 'https://registry.npmjs.org';
const REQUEST_TIMEOUT_MS = 10_000;

interface NpmDownloadsResponse {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

interface NpmRegistryResponse {
  name: string;
  description?: string;
  'dist-tags'?: Record<string, string>;
  maintainers?: Array<{ name: string; email: string }>;
}

interface NpmSourceConfig {
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
 * Fetches weekly download stats for a single npm package.
 */
async function fetchDownloads(packageName: string): Promise<NpmDownloadsResponse> {
  const url = `${NPM_DOWNLOADS_API}/${encodeURIComponent(packageName)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`npm downloads API returned ${response.status} for ${packageName}`);
  }

  return response.json() as Promise<NpmDownloadsResponse>;
}

/**
 * Fetches registry metadata for a single npm package.
 */
async function fetchRegistryMetadata(packageName: string): Promise<NpmRegistryResponse> {
  const url = `${NPM_REGISTRY_API}/${encodeURIComponent(packageName)}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`npm registry API returned ${response.status} for ${packageName}`);
  }

  return response.json() as Promise<NpmRegistryResponse>;
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
 * Syncs download data for a single npm signal source.
 *
 * Reads the signal source config from DB, fetches download stats and registry
 * metadata for each configured package, creates idempotent signals, and
 * attempts to match maintainer email domains to existing company records.
 */
export async function syncNpmSource(
  organizationId: string,
  sourceId: string,
): Promise<SyncResult> {
  const source = await prisma.signalSource.findFirst({
    where: { id: sourceId, organizationId, type: 'NPM' },
  });

  if (!source) {
    throw new Error(`NPM signal source ${sourceId} not found for organization ${organizationId}`);
  }

  const config = source.config as unknown as NpmSourceConfig;

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
      let registryData: NpmRegistryResponse | null = null;
      try {
        registryData = await fetchRegistryMetadata(packageName);
      } catch (regErr) {
        logger.warn('Failed to fetch npm registry metadata', {
          package: packageName,
          error: regErr,
        });
      }

      // Attempt company domain matching from maintainer emails
      let accountId: string | null = null;
      if (registryData?.maintainers) {
        for (const maintainer of registryData.maintainers) {
          if (!maintainer.email) continue;
          const domain = extractCompanyDomain(maintainer.email);
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
      const metadata: Record<string, unknown> = {
        package: packageName,
        downloads: downloads.downloads,
        period: 'last-week',
        start: downloads.start,
        end: downloads.end,
      };

      if (registryData) {
        const latestTag = registryData['dist-tags']?.latest;
        if (latestTag) metadata.latestVersion = latestTag;
        if (registryData.description) metadata.description = registryData.description;
        if (registryData.maintainers) {
          metadata.maintainers = registryData.maintainers.map((m) => m.name);
        }
      }

      const idempotencyKey = `npm_${packageName}_${downloads.end}`;

      // Create signal (skip gracefully on duplicate idempotency key)
      try {
        await prisma.signal.create({
          data: {
            organizationId,
            sourceId: source.id,
            type: 'npm_downloads',
            actorId: null,
            accountId,
            anonymousId: null,
            metadata: metadata as unknown as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: new Date(downloads.end),
          },
        });
        synced++;
      } catch (createErr: unknown) {
        // Prisma P2002 = unique constraint violation (idempotency key)
        if (
          createErr instanceof Prisma.PrismaClientKnownRequestError &&
          createErr.code === 'P2002'
        ) {
          logger.debug('Skipping duplicate npm signal', {
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
      logger.error('Failed to sync npm package', { package: packageName, error: pkgErr });
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

  logger.info('npm source sync completed', {
    sourceId,
    organizationId,
    synced,
    errors: errors.length,
  });

  return { synced, errors };
}

/**
 * Syncs all ACTIVE npm sources across all organizations.
 * Intended to be called from a cron job on a regular schedule.
 */
export async function syncAllNpmSources(): Promise<void> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'NPM', status: 'ACTIVE' },
    select: { id: true, organizationId: true, name: true },
  });

  logger.info(`Starting sync for ${sources.length} npm source(s)`);

  for (const source of sources) {
    try {
      const result = await syncNpmSource(source.organizationId, source.id);
      logger.info('npm source synced', {
        sourceId: source.id,
        name: source.name,
        synced: result.synced,
        errors: result.errors.length,
      });
    } catch (err) {
      logger.error('Failed to sync npm source', {
        sourceId: source.id,
        name: source.name,
        error: err,
      });
    }
  }
}

/**
 * Tests whether the npm API is reachable for the given package names.
 * Returns per-package download counts or errors without persisting any data.
 */
export async function testNpmConnection(packages: string[]): Promise<TestResult> {
  const results: TestResult['results'] = [];
  let allHealthy = true;

  for (const packageName of packages) {
    try {
      const downloads = await fetchDownloads(packageName);
      results.push({
        package: packageName,
        downloads: downloads.downloads,
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
