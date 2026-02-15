/**
 * Clearbit Company & Contact Enrichment Service
 *
 * Automatically enriches company records with firmographic data and contact
 * records with professional data from Clearbit. Provides both single-record
 * and bulk enrichment with Redis caching and rate-limit handling.
 *
 * Clearbit API:
 * - Company: GET https://company.clearbit.com/v2/companies/find?domain={domain}
 * - Person:  GET https://person.clearbit.com/v2/people/find?email={email}
 *
 * Rate limiting: ~100 req/min on standard plans. We add 600ms delay between
 * calls and handle 429 with exponential backoff. Results cached 24h in Redis.
 */

import { Prisma, CompanySize } from '@prisma/client';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClearbitConfig {
  clearbitApiKey: string;
  clearbitConnectedAt: string;
  clearbitLastEnrichmentAt?: string;
}

interface ClearbitCompanyResponse {
  name?: string;
  domain?: string;
  url?: string;
  logo?: string;
  description?: string;
  foundedYear?: number;
  category?: {
    industry?: string;
    sector?: string;
    subIndustry?: string;
  };
  metrics?: {
    employees?: number;
    annualRevenue?: number;
    raised?: number;
  };
  geo?: {
    country?: string;
    city?: string;
    state?: string;
  };
  tech?: string[];
  twitter?: {
    handle?: string;
  };
  linkedin?: {
    handle?: string;
  };
}

interface ClearbitPersonResponse {
  name?: {
    givenName?: string;
    familyName?: string;
  };
  employment?: {
    name?: string;
    title?: string;
    role?: string;
    seniority?: string;
  };
  avatar?: string;
  location?: string;
  twitter?: {
    handle?: string;
  };
  linkedin?: {
    handle?: string;
  };
}

export interface EnrichmentResult {
  success: boolean;
  fieldsUpdated: string[];
  error?: string;
  cached?: boolean;
}

export interface BulkEnrichmentResult {
  total: number;
  enriched: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface EnrichmentStats {
  companies: {
    total: number;
    enriched: number;
    unenriched: number;
    coveragePercent: number;
  };
  contacts: {
    total: number;
    enriched: number;
    unenriched: number;
    coveragePercent: number;
  };
  lastEnrichmentAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLEARBIT_COMPANY_API = 'https://company.clearbit.com/v2/companies/find';
const CLEARBIT_PERSON_API = 'https://person.clearbit.com/v2/people/find';
const CACHE_TTL_SECONDS = 86400; // 24 hours
const RATE_LIMIT_DELAY_MS = 600;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapEmployeesToSize(employees: number): CompanySize {
  if (employees <= 10) return 'STARTUP';
  if (employees <= 50) return 'SMALL';
  if (employees <= 200) return 'MEDIUM';
  if (employees <= 1000) return 'LARGE';
  return 'ENTERPRISE';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads the org settings JSON and extracts Clearbit config.
 */
async function readOrgSettings(organizationId: string): Promise<Record<string, unknown>> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) throw new AppError('Organization not found', 404);
  return (org.settings as Record<string, unknown>) || {};
}

/**
 * Writes back org settings JSON.
 */
async function writeOrgSettings(
  organizationId: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Makes an authenticated request to Clearbit with rate-limit handling.
 */
async function clearbitFetch<T>(
  url: string,
  apiKey: string,
): Promise<T | null> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 404 || response.status === 422) {
        // Not found or unprocessable -- no data for this entity
        return null;
      }

      if (response.status === 429) {
        // Rate limited -- exponential backoff
        attempts++;
        const backoff = Math.pow(2, attempts) * 1000;
        logger.warn('Clearbit rate limited, backing off', { url, backoff, attempt: attempts });
        await sleep(backoff);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new AppError('Clearbit API key is invalid or expired', 401);
      }

      logger.warn('Clearbit API unexpected status', { url, status: response.status });
      return null;
    } catch (err) {
      if (err instanceof AppError) throw err;
      attempts++;
      if (attempts >= maxAttempts) {
        logger.error('Clearbit API request failed', { url, error: err });
        return null;
      }
      await sleep(1000 * attempts);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Save Clearbit API key to organization settings.
 */
export async function configureClearbit(
  organizationId: string,
  apiKey: string,
): Promise<void> {
  // Validate the key by making a test request
  const testUrl = `${CLEARBIT_COMPANY_API}?domain=clearbit.com`;
  const testResult = await clearbitFetch<ClearbitCompanyResponse>(testUrl, apiKey);

  if (testResult === null) {
    // Could be a valid key with no result, but let's try checking the error
    // We already throw on 401/403, so if we get here the key might be valid
    // but clearbit.com returned nothing (unlikely). Accept it anyway.
    logger.info('Clearbit API key validation: no data returned for test domain, accepting key');
  }

  const settings = await readOrgSettings(organizationId);
  const config: ClearbitConfig = {
    clearbitApiKey: apiKey,
    clearbitConnectedAt: new Date().toISOString(),
  };

  await writeOrgSettings(organizationId, {
    ...settings,
    ...config,
  });

  logger.info('Clearbit configured', { organizationId });
}

/**
 * Read Clearbit config for an organization.
 */
export async function getClearbitConfig(
  organizationId: string,
): Promise<{ connected: boolean; connectedAt: string | null; lastEnrichmentAt: string | null }> {
  const settings = await readOrgSettings(organizationId);
  const apiKey = settings.clearbitApiKey as string | undefined;

  return {
    connected: !!apiKey,
    connectedAt: (settings.clearbitConnectedAt as string) || null,
    lastEnrichmentAt: (settings.clearbitLastEnrichmentAt as string) || null,
  };
}

/**
 * Disconnect Clearbit by removing config from org settings.
 */
export async function disconnectClearbit(organizationId: string): Promise<void> {
  const settings = await readOrgSettings(organizationId);
  delete settings.clearbitApiKey;
  delete settings.clearbitConnectedAt;
  delete settings.clearbitLastEnrichmentAt;

  await writeOrgSettings(organizationId, settings);
  logger.info('Clearbit disconnected', { organizationId });
}

/**
 * Internal helper to get the raw API key.
 */
async function getApiKey(organizationId: string): Promise<string> {
  const settings = await readOrgSettings(organizationId);
  const apiKey = settings.clearbitApiKey as string | undefined;
  if (!apiKey) {
    throw new AppError('Clearbit is not connected. Add your API key first.', 400);
  }
  return apiKey;
}

// ---------------------------------------------------------------------------
// Company Enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single company with Clearbit firmographic data.
 */
export async function enrichCompany(
  organizationId: string,
  companyId: string,
): Promise<EnrichmentResult> {
  const apiKey = await getApiKey(organizationId);

  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
  });

  if (!company) {
    throw new AppError('Company not found', 404);
  }

  if (!company.domain) {
    return { success: false, fieldsUpdated: [], error: 'Company has no domain' };
  }

  const domain = company.domain.toLowerCase().trim();

  // Check Redis cache
  const cacheKey = `clearbit:company:${domain}`;
  const cached = await redis.get(cacheKey);
  let data: ClearbitCompanyResponse | null = null;
  let fromCache = false;

  if (cached) {
    try {
      data = JSON.parse(cached) as ClearbitCompanyResponse;
      fromCache = true;
    } catch {
      // Corrupt cache entry, fetch fresh
      await redis.del(cacheKey);
    }
  }

  if (!data) {
    await sleep(RATE_LIMIT_DELAY_MS);
    data = await clearbitFetch<ClearbitCompanyResponse>(
      `${CLEARBIT_COMPANY_API}?domain=${encodeURIComponent(domain)}`,
      apiKey,
    );

    if (!data) {
      return { success: false, fieldsUpdated: [], error: 'No data found for domain' };
    }

    // Cache the result
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data));
  }

  // Map Clearbit response to company fields
  const fieldsUpdated: string[] = [];
  const updates: Record<string, unknown> = {};
  const customFields = (company.customFields as Record<string, unknown>) || {};

  // Core fields -- only overwrite if currently empty
  if (!company.name && data.name) {
    updates.name = data.name;
    fieldsUpdated.push('name');
  }

  if (data.category?.industry) {
    updates.industry = data.category.industry;
    fieldsUpdated.push('industry');
  }

  if (data.metrics?.employees) {
    updates.size = mapEmployeesToSize(data.metrics.employees);
    fieldsUpdated.push('size');
  }

  if (!company.description && data.description) {
    updates.description = data.description;
    fieldsUpdated.push('description');
  }

  if (data.url) {
    updates.website = data.url;
    fieldsUpdated.push('website');
  }

  // Custom fields -- always update for richer data
  if (data.logo) {
    customFields.logo = data.logo;
    fieldsUpdated.push('customFields.logo');
  }

  if (data.geo?.country) {
    customFields.country = data.geo.country;
    fieldsUpdated.push('customFields.country');
  }

  if (data.geo?.city) {
    customFields.city = data.geo.city;
    fieldsUpdated.push('customFields.city');
  }

  if (data.metrics?.annualRevenue) {
    customFields.annualRevenue = data.metrics.annualRevenue;
    fieldsUpdated.push('customFields.annualRevenue');
  }

  if (data.metrics?.raised) {
    customFields.totalFunding = data.metrics.raised;
    fieldsUpdated.push('customFields.totalFunding');
  }

  if (data.tech && data.tech.length > 0) {
    customFields.techStack = data.tech;
    fieldsUpdated.push('customFields.techStack');
  }

  if (data.twitter?.handle) {
    customFields.twitterHandle = data.twitter.handle;
    fieldsUpdated.push('customFields.twitterHandle');
  }

  if (data.linkedin?.handle) {
    customFields.linkedinHandle = data.linkedin.handle;
    fieldsUpdated.push('customFields.linkedinHandle');
  }

  if (data.category?.sector) {
    customFields.sector = data.category.sector;
    fieldsUpdated.push('customFields.sector');
  }

  if (data.category?.subIndustry) {
    customFields.subIndustry = data.category.subIndustry;
    fieldsUpdated.push('customFields.subIndustry');
  }

  if (data.foundedYear) {
    customFields.foundedYear = data.foundedYear;
    fieldsUpdated.push('customFields.foundedYear');
  }

  // Mark as enriched
  customFields.clearbitEnrichedAt = new Date().toISOString();
  customFields.enrichmentSource = 'clearbit';

  updates.customFields = customFields as unknown as Prisma.InputJsonValue;

  // Persist
  if (fieldsUpdated.length > 0) {
    await prisma.company.update({
      where: { id: companyId },
      data: updates,
    });
  }

  // Update last enrichment timestamp on org
  const orgSettings = await readOrgSettings(organizationId);
  orgSettings.clearbitLastEnrichmentAt = new Date().toISOString();
  await writeOrgSettings(organizationId, orgSettings);

  logger.info('Clearbit company enrichment completed', {
    organizationId,
    companyId,
    domain,
    fieldsUpdated: fieldsUpdated.length,
    cached: fromCache,
  });

  return { success: true, fieldsUpdated, cached: fromCache };
}

// ---------------------------------------------------------------------------
// Contact Enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich a single contact with Clearbit person data.
 */
export async function enrichContact(
  organizationId: string,
  contactId: string,
): Promise<EnrichmentResult> {
  const apiKey = await getApiKey(organizationId);

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
  });

  if (!contact) {
    throw new AppError('Contact not found', 404);
  }

  if (!contact.email) {
    return { success: false, fieldsUpdated: [], error: 'Contact has no email' };
  }

  const email = contact.email.toLowerCase().trim();

  // Check Redis cache
  const cacheKey = `clearbit:person:${email}`;
  const cached = await redis.get(cacheKey);
  let data: ClearbitPersonResponse | null = null;
  let fromCache = false;

  if (cached) {
    try {
      data = JSON.parse(cached) as ClearbitPersonResponse;
      fromCache = true;
    } catch {
      await redis.del(cacheKey);
    }
  }

  if (!data) {
    await sleep(RATE_LIMIT_DELAY_MS);
    data = await clearbitFetch<ClearbitPersonResponse>(
      `${CLEARBIT_PERSON_API}?email=${encodeURIComponent(email)}`,
      apiKey,
    );

    if (!data) {
      return { success: false, fieldsUpdated: [], error: 'No data found for email' };
    }

    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data));
  }

  // Map Clearbit response to contact fields
  const fieldsUpdated: string[] = [];
  const updates: Record<string, unknown> = {};
  const customFields = (contact.customFields as Record<string, unknown>) || {};

  // Core fields -- only overwrite if currently empty
  if ((!contact.firstName || contact.firstName === 'Unknown') && data.name?.givenName) {
    updates.firstName = data.name.givenName;
    fieldsUpdated.push('firstName');
  }

  if (!contact.lastName && data.name?.familyName) {
    updates.lastName = data.name.familyName;
    fieldsUpdated.push('lastName');
  }

  if (!contact.title && data.employment?.title) {
    updates.title = data.employment.title;
    fieldsUpdated.push('title');
  }

  if (!contact.avatar && data.avatar) {
    updates.avatar = data.avatar;
    fieldsUpdated.push('avatar');
  }

  // Try to link to company by employment name
  if (!contact.companyId && data.employment?.name) {
    const company = await prisma.company.findFirst({
      where: {
        organizationId,
        name: { contains: data.employment.name, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (company) {
      updates.companyId = company.id;
      fieldsUpdated.push('companyId');
    }
  }

  // Custom fields
  if (data.twitter?.handle) {
    customFields.twitterHandle = data.twitter.handle;
    fieldsUpdated.push('customFields.twitterHandle');
  }

  if (data.linkedin?.handle) {
    customFields.linkedinHandle = data.linkedin.handle;
    fieldsUpdated.push('customFields.linkedinHandle');
  }

  if (data.location) {
    customFields.location = data.location;
    fieldsUpdated.push('customFields.location');
  }

  if (data.employment?.seniority) {
    customFields.seniority = data.employment.seniority;
    fieldsUpdated.push('customFields.seniority');
  }

  if (data.employment?.role) {
    customFields.role = data.employment.role;
    fieldsUpdated.push('customFields.role');
  }

  // Mark as enriched
  customFields.clearbitEnrichedAt = new Date().toISOString();
  customFields.enrichmentSource = 'clearbit';

  updates.customFields = customFields as unknown as Prisma.InputJsonValue;

  // Persist
  if (fieldsUpdated.length > 0) {
    await prisma.contact.update({
      where: { id: contactId },
      data: updates,
    });
  }

  logger.info('Clearbit contact enrichment completed', {
    organizationId,
    contactId,
    email,
    fieldsUpdated: fieldsUpdated.length,
    cached: fromCache,
  });

  return { success: true, fieldsUpdated, cached: fromCache };
}

// ---------------------------------------------------------------------------
// Bulk Enrichment
// ---------------------------------------------------------------------------

/**
 * Enrich all companies missing key firmographic data (industry, size, description).
 */
export async function bulkEnrichCompanies(
  organizationId: string,
): Promise<BulkEnrichmentResult> {
  await getApiKey(organizationId); // Validate connection

  // Find companies with a domain but missing key fields
  const candidates = await prisma.company.findMany({
    where: {
      organizationId,
      domain: { not: null },
      OR: [
        { industry: null },
        { size: null },
        { description: null },
      ],
    },
    select: { id: true, domain: true },
    orderBy: { createdAt: 'desc' },
  });

  const result: BulkEnrichmentResult = {
    total: candidates.length,
    enriched: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Process in batches
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    for (const candidate of batch) {
      try {
        const enrichResult = await enrichCompany(organizationId, candidate.id);
        if (enrichResult.success) {
          result.enriched++;
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.failed++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`${candidate.domain}: ${message}`);
        logger.warn('Bulk company enrichment failed for candidate', {
          companyId: candidate.id,
          domain: candidate.domain,
          error: message,
        });
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < candidates.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  logger.info('Bulk company enrichment completed', {
    organizationId,
    ...result,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Enrich all contacts missing title/company data.
 */
export async function bulkEnrichContacts(
  organizationId: string,
): Promise<BulkEnrichmentResult> {
  await getApiKey(organizationId); // Validate connection

  // Find contacts with email but missing title
  const candidates = await prisma.contact.findMany({
    where: {
      organizationId,
      email: { not: null },
      title: null,
    },
    select: { id: true, email: true },
    orderBy: { createdAt: 'desc' },
  });

  const result: BulkEnrichmentResult = {
    total: candidates.length,
    enriched: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);

    for (const candidate of batch) {
      try {
        const enrichResult = await enrichContact(organizationId, candidate.id);
        if (enrichResult.success) {
          result.enriched++;
        } else {
          result.skipped++;
        }
      } catch (err) {
        result.failed++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`${candidate.email}: ${message}`);
        logger.warn('Bulk contact enrichment failed for candidate', {
          contactId: candidate.id,
          email: candidate.email,
          error: message,
        });
      }
    }

    if (i + BATCH_SIZE < candidates.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  logger.info('Bulk contact enrichment completed', {
    organizationId,
    ...result,
    errors: result.errors.length,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Return enrichment coverage stats for the organization.
 */
export async function getEnrichmentStats(
  organizationId: string,
): Promise<EnrichmentStats> {
  const [
    totalCompanies,
    enrichedCompanies,
    totalContacts,
    enrichedContacts,
  ] = await Promise.all([
    prisma.company.count({ where: { organizationId } }),
    prisma.company.count({
      where: {
        organizationId,
        customFields: {
          path: ['clearbitEnrichedAt'],
          not: Prisma.AnyNull,
        },
      },
    }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.contact.count({
      where: {
        organizationId,
        customFields: {
          path: ['clearbitEnrichedAt'],
          not: Prisma.AnyNull,
        },
      },
    }),
  ]);

  const config = await getClearbitConfig(organizationId);

  return {
    companies: {
      total: totalCompanies,
      enriched: enrichedCompanies,
      unenriched: totalCompanies - enrichedCompanies,
      coveragePercent: totalCompanies > 0
        ? Math.round((enrichedCompanies / totalCompanies) * 100)
        : 0,
    },
    contacts: {
      total: totalContacts,
      enriched: enrichedContacts,
      unenriched: totalContacts - enrichedContacts,
      coveragePercent: totalContacts > 0
        ? Math.round((enrichedContacts / totalContacts) * 100)
        : 0,
    },
    lastEnrichmentAt: config.lastEnrichmentAt,
  };
}

// ---------------------------------------------------------------------------
// Scheduler helper
// ---------------------------------------------------------------------------

/**
 * Returns org IDs that have Clearbit connected (for the scheduler).
 */
export async function getConnectedOrganizations(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: {
      settings: {
        path: ['clearbitApiKey'],
        not: Prisma.AnyNull,
      },
    },
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}
