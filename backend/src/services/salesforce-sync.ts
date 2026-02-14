import { Prisma, DealStage } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { logAudit } from './audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalesforceSyncResult {
  contacts: { created: number; updated: number; failed: number };
  accounts: { created: number; updated: number; failed: number };
  opportunities: { created: number; updated: number; failed: number };
  tasks: { synced: number; failed: number };
  errors: string[];
}

export interface SalesforceSyncStatus {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncResult: SalesforceSyncResult | null;
  syncInProgress: boolean;
  instanceUrl: string | null;
  totalContactsSynced: number;
  totalAccountsSynced: number;
  totalOpportunitiesSynced: number;
}

interface SalesforceSettings {
  salesforceAccessToken?: string;
  salesforceRefreshToken?: string;
  salesforceInstanceUrl?: string;
  salesforceLastSyncAt?: string;
  salesforceLastSyncResult?: SalesforceSyncResult;
  salesforceSyncInProgress?: boolean;
  salesforceTotalContactsSynced?: number;
  salesforceTotalAccountsSynced?: number;
  salesforceTotalOpportunitiesSynced?: number;
}

interface SalesforceTokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  token_type: string;
}

interface SalesforceQueryResponse<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

interface SalesforceCompositeResponse {
  id: string;
  success: boolean;
  errors: Array<{ statusCode: string; message: string; fields: string[] }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SF_API_VERSION = 'v59.0';
const BATCH_SIZE = 200; // Salesforce Composite API max per call

// DevSignal -> Salesforce Opportunity stage mapping
const DEAL_STAGE_TO_SF: Record<string, string> = {
  [DealStage.ANONYMOUS_USAGE]: 'Prospecting',
  [DealStage.IDENTIFIED]: 'Prospecting',
  [DealStage.ACTIVATED]: 'Qualification',
  [DealStage.TEAM_ADOPTION]: 'Proposal/Price Quote',
  [DealStage.EXPANSION_SIGNAL]: 'Negotiation/Review',
  [DealStage.SALES_QUALIFIED]: 'Negotiation/Review',
  [DealStage.NEGOTIATION]: 'Negotiation/Review',
  [DealStage.CLOSED_WON]: 'Closed Won',
  [DealStage.CLOSED_LOST]: 'Closed Lost',
};

// Custom fields to register on first connect
interface CustomFieldDef {
  fullName: string;
  label: string;
  type: string;
  length?: number;
  scale?: number;
  precision?: number;
}

const CUSTOM_FIELDS: Record<string, CustomFieldDef[]> = {
  Contact: [
    { fullName: 'Contact.PQA_Score__c', label: 'DevSignal PQA Score', type: 'Number', length: 18, scale: 0, precision: 3 },
    { fullName: 'Contact.Signal_Count__c', label: 'DevSignal Signal Count', type: 'Number', length: 18, scale: 0, precision: 8 },
    { fullName: 'Contact.Last_Signal_Date__c', label: 'DevSignal Last Signal Date', type: 'Date' },
    { fullName: 'Contact.DevSignal_Source__c', label: 'DevSignal Source', type: 'Text', length: 255 },
  ],
  Account: [
    { fullName: 'Account.PQA_Score__c', label: 'DevSignal PQA Score', type: 'Number', length: 18, scale: 0, precision: 3 },
    { fullName: 'Account.Signal_Count__c', label: 'DevSignal Signal Count', type: 'Number', length: 18, scale: 0, precision: 8 },
    { fullName: 'Account.Last_Signal_Date__c', label: 'DevSignal Last Signal Date', type: 'Date' },
    { fullName: 'Account.DevSignal_Source__c', label: 'DevSignal Source', type: 'Text', length: 255 },
  ],
  Opportunity: [
    { fullName: 'Opportunity.DevSignal_Deal_Id__c', label: 'DevSignal Deal ID', type: 'Text', length: 255 },
    { fullName: 'Opportunity.DevSignal_Source__c', label: 'DevSignal Source', type: 'Text', length: 255 },
  ],
};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

async function getOrgSettings(organizationId: string): Promise<{
  salesforce: SalesforceSettings;
  rawSettings: Record<string, unknown>;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const rawSettings = (org.settings as Record<string, unknown>) ?? {};
  const salesforce: SalesforceSettings = {
    salesforceAccessToken: rawSettings.salesforceAccessToken as string | undefined,
    salesforceRefreshToken: rawSettings.salesforceRefreshToken as string | undefined,
    salesforceInstanceUrl: rawSettings.salesforceInstanceUrl as string | undefined,
    salesforceLastSyncAt: rawSettings.salesforceLastSyncAt as string | undefined,
    salesforceLastSyncResult: rawSettings.salesforceLastSyncResult as SalesforceSyncResult | undefined,
    salesforceSyncInProgress: rawSettings.salesforceSyncInProgress as boolean | undefined,
    salesforceTotalContactsSynced: rawSettings.salesforceTotalContactsSynced as number | undefined,
    salesforceTotalAccountsSynced: rawSettings.salesforceTotalAccountsSynced as number | undefined,
    salesforceTotalOpportunitiesSynced: rawSettings.salesforceTotalOpportunitiesSynced as number | undefined,
  };

  return { salesforce, rawSettings };
}

async function updateOrgSettings(
  organizationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return;

  const current = (org.settings as Record<string, unknown>) ?? {};
  const merged = { ...current, ...patch };

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: merged as Prisma.InputJsonValue },
  });
}

// ---------------------------------------------------------------------------
// Salesforce API helper
// ---------------------------------------------------------------------------

/**
 * Make an authenticated Salesforce REST API call with automatic token refresh on 401.
 */
async function salesforceApi(
  organizationId: string,
  instanceUrl: string,
  accessToken: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const { method = 'GET', body } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const fetchOptions: RequestInit = { method, headers };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${instanceUrl}/services/data/${SF_API_VERSION}${path}`, fetchOptions);

  // Rate limit handling
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
    logger.warn('Salesforce rate limit hit, waiting', { waitMs, path });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    // Retry once
    const retryResponse = await fetch(
      `${instanceUrl}/services/data/${SF_API_VERSION}${path}`,
      fetchOptions,
    );
    if (!retryResponse.ok) {
      const errorBody = await retryResponse.text();
      throw new AppError(`Salesforce API error after retry: ${retryResponse.status} - ${errorBody}`, retryResponse.status);
    }
    if (retryResponse.status === 204) return null;
    return retryResponse.json();
  }

  // Token expired -- attempt refresh
  if (response.status === 401) {
    logger.info('Salesforce token expired, attempting refresh', { organizationId });
    const newToken = await refreshAccessToken(organizationId);

    // Retry with new token
    const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
    const retryOptions: RequestInit = { method, headers: retryHeaders };
    if (body) retryOptions.body = JSON.stringify(body);

    const retryResponse = await fetch(
      `${instanceUrl}/services/data/${SF_API_VERSION}${path}`,
      retryOptions,
    );

    if (!retryResponse.ok) {
      const errorBody = await retryResponse.text();
      logger.error('Salesforce API error after token refresh', {
        status: retryResponse.status,
        path,
        body: errorBody,
      });
      throw new AppError(
        `Salesforce API error: ${retryResponse.status} - ${errorBody}`,
        retryResponse.status,
      );
    }

    if (retryResponse.status === 204) return null;
    return retryResponse.json();
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Salesforce API error', {
      status: response.status,
      path,
      body: errorBody,
    });
    throw new AppError(
      `Salesforce API error: ${response.status} - ${errorBody}`,
      response.status,
    );
  }

  if (response.status === 204 || response.status === 201) {
    // 201 may have a body, 204 does not
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return response.json();
}

/**
 * Refresh the Salesforce OAuth2 access token using the refresh token.
 */
async function refreshAccessToken(organizationId: string): Promise<string> {
  const { salesforce } = await getOrgSettings(organizationId);

  if (!salesforce.salesforceRefreshToken) {
    throw new AppError('Salesforce refresh token not available', 401);
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError(
      'Salesforce OAuth credentials not configured (SALESFORCE_CLIENT_ID, SALESFORCE_CLIENT_SECRET)',
      500,
    );
  }

  const response = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: salesforce.salesforceRefreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('Salesforce token refresh failed', {
      status: response.status,
      body: errorBody,
    });
    throw new AppError('Failed to refresh Salesforce access token', 401);
  }

  const data = (await response.json()) as SalesforceTokenResponse;

  // Store new tokens (Salesforce may or may not return a new refresh_token)
  const patch: Record<string, unknown> = {
    salesforceAccessToken: data.access_token,
  };
  if (data.refresh_token) {
    patch.salesforceRefreshToken = data.refresh_token;
  }
  if (data.instance_url) {
    patch.salesforceInstanceUrl = data.instance_url;
  }

  await updateOrgSettings(organizationId, patch);

  return data.access_token;
}

/**
 * Get valid access token and instance URL, refreshing if needed.
 */
async function getValidCredentials(organizationId: string): Promise<{
  accessToken: string;
  instanceUrl: string;
}> {
  const { salesforce } = await getOrgSettings(organizationId);

  if (!salesforce.salesforceAccessToken || !salesforce.salesforceInstanceUrl) {
    throw new AppError('Salesforce is not connected', 400);
  }

  // Quick validation call
  try {
    await salesforceApi(
      organizationId,
      salesforce.salesforceInstanceUrl,
      salesforce.salesforceAccessToken,
      '/query?q=' + encodeURIComponent('SELECT Id FROM Contact LIMIT 1'),
    );
    return {
      accessToken: salesforce.salesforceAccessToken,
      instanceUrl: salesforce.salesforceInstanceUrl,
    };
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401 && salesforce.salesforceRefreshToken) {
      const newToken = await refreshAccessToken(organizationId);
      // Re-read instance URL in case it changed
      const { salesforce: updated } = await getOrgSettings(organizationId);
      return {
        accessToken: newToken,
        instanceUrl: updated.salesforceInstanceUrl || salesforce.salesforceInstanceUrl,
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Custom Field Registration
// ---------------------------------------------------------------------------

/**
 * Register DevSignal custom fields on Salesforce objects using the Tooling API.
 * Fields that already exist are silently skipped.
 */
export async function registerCustomFields(
  organizationId: string,
): Promise<void> {
  const { salesforce } = await getOrgSettings(organizationId);
  if (!salesforce.salesforceAccessToken || !salesforce.salesforceInstanceUrl) {
    throw new AppError('Salesforce is not connected', 400);
  }

  const instanceUrl = salesforce.salesforceInstanceUrl;
  const token = salesforce.salesforceAccessToken;

  for (const [_objectName, fields] of Object.entries(CUSTOM_FIELDS)) {
    for (const field of fields) {
      try {
        const metadata: Record<string, unknown> = {
          FullName: field.fullName,
          Metadata: {
            label: field.label,
            type: field.type,
            ...(field.type === 'Text' && { length: field.length }),
            ...(field.type === 'Number' && {
              precision: field.precision,
              scale: field.scale,
            }),
          },
        };

        await salesforceApi(
          organizationId,
          instanceUrl,
          token,
          '/tooling/sobjects/CustomField',
          { method: 'POST', body: metadata },
        );
        logger.info(`Created Salesforce custom field: ${field.fullName}`);
      } catch (error) {
        // Field may already exist (DUPLICATE_VALUE) -- that's fine
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('DUPLICATE') || msg.includes('already exists')) {
          logger.debug(`Salesforce field already exists: ${field.fullName}`);
        } else {
          logger.warn(`Could not create Salesforce field ${field.fullName}`, {
            error: msg,
          });
        }
      }
    }
  }

  logger.info('Salesforce custom field registration complete', { organizationId });
}

// ---------------------------------------------------------------------------
// Contact Sync
// ---------------------------------------------------------------------------

/**
 * Query Salesforce contacts modified since last sync and upsert into DevSignal,
 * then push DevSignal contacts back to Salesforce.
 */
async function syncContacts(
  organizationId: string,
  accessToken: string,
  instanceUrl: string,
  since: Date | null,
): Promise<{ created: number; updated: number; failed: number }> {
  const result = { created: 0, updated: 0, failed: 0 };

  // --- Pull from Salesforce ---
  const sinceStr = since ? since.toISOString() : '1970-01-01T00:00:00.000Z';
  const soql = `SELECT Id,Email,FirstName,LastName,Title,Account.Name FROM Contact WHERE LastModifiedDate > ${sinceStr} AND Email != null`;

  try {
    const queryResult = (await salesforceApi(
      organizationId,
      instanceUrl,
      accessToken,
      `/query?q=${encodeURIComponent(soql)}`,
    )) as SalesforceQueryResponse<{
      Id: string;
      Email: string;
      FirstName: string | null;
      LastName: string | null;
      Title: string | null;
      Account?: { Name: string } | null;
    }>;

    for (const sfContact of queryResult.records) {
      if (!sfContact.Email) continue;

      try {
        const existing = await prisma.contact.findFirst({
          where: { organizationId, email: sfContact.Email },
        });

        if (existing) {
          const existingCustom = (existing.customFields as Record<string, unknown>) ?? {};
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              firstName: sfContact.FirstName || existing.firstName,
              lastName: sfContact.LastName || existing.lastName,
              title: sfContact.Title || existing.title,
              customFields: { ...existingCustom, salesforceId: sfContact.Id } as unknown as Prisma.InputJsonValue,
            },
          });
          result.updated++;
        } else {
          await prisma.contact.create({
            data: {
              organizationId,
              email: sfContact.Email,
              firstName: sfContact.FirstName || 'Unknown',
              lastName: sfContact.LastName || sfContact.Email.split('@')[0],
              title: sfContact.Title || null,
              customFields: { salesforceId: sfContact.Id, source: 'salesforce' } as unknown as Prisma.InputJsonValue,
            },
          });
          result.created++;
        }
      } catch (error) {
        result.failed++;
        logger.warn('Failed to upsert contact from Salesforce', {
          sfContactId: sfContact.Id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Salesforce contact pull failed', { organizationId, error: msg });
  }

  // --- Push DevSignal contacts to Salesforce ---
  const dsWhere: Record<string, unknown> = {
    organizationId,
    email: { not: null },
  };
  if (since) {
    dsWhere.updatedAt = { gte: since };
  }

  const dsContacts = await prisma.contact.findMany({
    where: dsWhere,
    include: {
      company: {
        include: { score: true },
      },
    },
  });

  if (dsContacts.length === 0) return result;

  // Push in batches using Composite API
  for (let i = 0; i < dsContacts.length; i += BATCH_SIZE) {
    const batch = dsContacts.slice(i, i + BATCH_SIZE);

    const records = batch
      .filter((c) => c.email)
      .map((contact) => {
        const rec: Record<string, unknown> = {
          attributes: { type: 'Contact' },
          Email: contact.email,
          FirstName: contact.firstName || '',
          LastName: contact.lastName || contact.email?.split('@')[0] || 'Unknown',
        };

        if (contact.title) rec.Title = contact.title;
        if (contact.phone) rec.Phone = contact.phone;

        // DevSignal custom fields
        if (contact.company?.score) {
          rec.PQA_Score__c = contact.company.score.score;
          rec.Signal_Count__c = contact.company.score.signalCount;
          if (contact.company.score.lastSignalAt) {
            rec.Last_Signal_Date__c = contact.company.score.lastSignalAt
              .toISOString()
              .split('T')[0];
          }
        }
        rec.DevSignal_Source__c = 'DevSignal';

        return rec;
      });

    if (records.length === 0) continue;

    try {
      const compositeResult = (await salesforceApi(
        organizationId,
        instanceUrl,
        accessToken,
        '/composite/sobjects',
        {
          method: 'POST',
          body: {
            allOrNone: false,
            records,
          },
        },
      )) as SalesforceCompositeResponse[];

      for (const r of compositeResult) {
        if (r.success) {
          result.updated++;
        } else {
          result.failed++;
          logger.warn('Salesforce contact push failed', {
            sfId: r.id,
            errors: r.errors,
          });
        }
      }
    } catch (error) {
      result.failed += records.length;
      logger.error('Salesforce contact batch push failed', {
        error: error instanceof Error ? error.message : String(error),
        count: records.length,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Account Sync
// ---------------------------------------------------------------------------

/**
 * Sync companies (DevSignal) <-> accounts (Salesforce) bidirectionally.
 */
async function syncAccounts(
  organizationId: string,
  accessToken: string,
  instanceUrl: string,
  since: Date | null,
): Promise<{ created: number; updated: number; failed: number }> {
  const result = { created: 0, updated: 0, failed: 0 };

  // --- Pull Salesforce accounts ---
  const sinceStr = since ? since.toISOString() : '1970-01-01T00:00:00.000Z';
  const soql = `SELECT Id,Name,Website,Industry,Phone FROM Account WHERE LastModifiedDate > ${sinceStr}`;

  try {
    const queryResult = (await salesforceApi(
      organizationId,
      instanceUrl,
      accessToken,
      `/query?q=${encodeURIComponent(soql)}`,
    )) as SalesforceQueryResponse<{
      Id: string;
      Name: string;
      Website: string | null;
      Industry: string | null;
      Phone: string | null;
    }>;

    for (const sfAccount of queryResult.records) {
      try {
        // Try to match by domain (extracted from Website)
        let domain: string | null = null;
        if (sfAccount.Website) {
          try {
            domain = new URL(
              sfAccount.Website.startsWith('http')
                ? sfAccount.Website
                : `https://${sfAccount.Website}`,
            ).hostname.replace(/^www\./, '');
          } catch {
            domain = null;
          }
        }

        const existing = domain
          ? await prisma.company.findFirst({
              where: { organizationId, domain },
              select: { id: true, name: true, industry: true, phone: true, customFields: true },
            })
          : null;

        if (existing) {
          const existingCustom = (existing.customFields as Record<string, unknown>) ?? {};
          await prisma.company.update({
            where: { id: existing.id },
            data: {
              name: sfAccount.Name || existing.name,
              industry: sfAccount.Industry || existing.industry,
              phone: sfAccount.Phone || existing.phone,
              customFields: { ...existingCustom, salesforceId: sfAccount.Id } as unknown as Prisma.InputJsonValue,
            },
          });
          result.updated++;
        } else {
          await prisma.company.create({
            data: {
              organizationId,
              name: sfAccount.Name,
              domain: domain,
              website: sfAccount.Website,
              industry: sfAccount.Industry,
              phone: sfAccount.Phone,
              customFields: { salesforceId: sfAccount.Id, source: 'salesforce' } as unknown as Prisma.InputJsonValue,
            },
          });
          result.created++;
        }
      } catch (error) {
        result.failed++;
        logger.warn('Failed to upsert account from Salesforce', {
          sfAccountId: sfAccount.Id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Salesforce account pull failed', { organizationId, error: msg });
  }

  // --- Push DevSignal companies to Salesforce ---
  const dsWhere: Record<string, unknown> = {
    organizationId,
    domain: { not: null },
  };
  if (since) {
    dsWhere.updatedAt = { gte: since };
  }

  const dsCompanies = await prisma.company.findMany({
    where: dsWhere,
    include: {
      score: true,
      _count: { select: { contacts: true } },
    },
  });

  if (dsCompanies.length === 0) return result;

  for (let i = 0; i < dsCompanies.length; i += BATCH_SIZE) {
    const batch = dsCompanies.slice(i, i + BATCH_SIZE);

    const records = batch.map((company) => {
      const rec: Record<string, unknown> = {
        attributes: { type: 'Account' },
        Name: company.name,
      };

      if (company.domain) rec.Website = `https://${company.domain}`;
      if (company.industry) rec.Industry = company.industry;
      if (company.phone) rec.Phone = company.phone;

      // Custom fields
      if (company.score) {
        rec.PQA_Score__c = company.score.score;
        rec.Signal_Count__c = company.score.signalCount;
        if (company.score.lastSignalAt) {
          rec.Last_Signal_Date__c = company.score.lastSignalAt
            .toISOString()
            .split('T')[0];
        }
      }
      rec.DevSignal_Source__c = 'DevSignal';

      return rec;
    });

    try {
      const compositeResult = (await salesforceApi(
        organizationId,
        instanceUrl,
        accessToken,
        '/composite/sobjects',
        {
          method: 'POST',
          body: { allOrNone: false, records },
        },
      )) as SalesforceCompositeResponse[];

      for (const r of compositeResult) {
        if (r.success) {
          result.updated++;
        } else {
          result.failed++;
          logger.warn('Salesforce account push failed', {
            sfId: r.id,
            errors: r.errors,
          });
        }
      }
    } catch (error) {
      result.failed += records.length;
      logger.error('Salesforce account batch push failed', {
        error: error instanceof Error ? error.message : String(error),
        count: records.length,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Opportunity Sync
// ---------------------------------------------------------------------------

/**
 * Map DevSignal deals to Salesforce Opportunities.
 */
async function syncOpportunities(
  organizationId: string,
  accessToken: string,
  instanceUrl: string,
  since: Date | null,
): Promise<{ created: number; updated: number; failed: number }> {
  const result = { created: 0, updated: 0, failed: 0 };

  const where: Record<string, unknown> = { organizationId };
  if (since) {
    where.updatedAt = { gte: since };
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      company: true,
      contact: true,
    },
  });

  if (deals.length === 0) return result;

  for (const deal of deals) {
    try {
      // Check if opportunity already exists by DevSignal_Deal_Id__c
      const searchSoql = `SELECT Id FROM Opportunity WHERE DevSignal_Deal_Id__c = '${deal.id}' LIMIT 1`;
      const existingResult = (await salesforceApi(
        organizationId,
        instanceUrl,
        accessToken,
        `/query?q=${encodeURIComponent(searchSoql)}`,
      )) as SalesforceQueryResponse<{ Id: string }>;

      const sfStage = DEAL_STAGE_TO_SF[deal.stage] || 'Prospecting';
      const closeDate = deal.expectedCloseDate
        ? deal.expectedCloseDate.toISOString().split('T')[0]
        : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Default 90 days

      const oppData: Record<string, unknown> = {
        Name: deal.title,
        StageName: sfStage,
        CloseDate: closeDate,
        DevSignal_Deal_Id__c: deal.id,
        DevSignal_Source__c: 'DevSignal',
      };

      if (deal.amount !== null) {
        oppData.Amount = Number(deal.amount);
      }
      if (deal.description) {
        oppData.Description = deal.description;
      }

      if (existingResult.records.length > 0) {
        // Update existing
        const sfId = existingResult.records[0].Id;
        await salesforceApi(
          organizationId,
          instanceUrl,
          accessToken,
          `/sobjects/Opportunity/${sfId}`,
          { method: 'PATCH', body: oppData },
        );
        result.updated++;
      } else {
        // Create new
        await salesforceApi(
          organizationId,
          instanceUrl,
          accessToken,
          '/sobjects/Opportunity',
          { method: 'POST', body: oppData },
        );
        result.created++;
      }
    } catch (error) {
      result.failed++;
      logger.warn('Failed to sync deal to Salesforce Opportunity', {
        dealId: deal.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Signal-to-Task Sync
// ---------------------------------------------------------------------------

/**
 * Push recent signals as Salesforce Tasks on Contact records.
 */
async function syncSignalTasks(
  organizationId: string,
  accessToken: string,
  instanceUrl: string,
  since: Date | null,
): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 };

  const where: Record<string, unknown> = {
    organizationId,
    actorId: { not: null },
  };
  if (since) {
    where.createdAt = { gte: since };
  }

  const signals = await prisma.signal.findMany({
    where,
    include: {
      actor: true,
      account: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 500, // Limit to prevent overwhelming Salesforce
  });

  if (signals.length === 0) return result;

  for (const signal of signals) {
    try {
      if (!signal.actor?.email) continue;

      // Find the Salesforce Contact by email
      const soql = `SELECT Id FROM Contact WHERE Email = '${signal.actor.email.replace(/'/g, "\\'")}' LIMIT 1`;
      const contactResult = (await salesforceApi(
        organizationId,
        instanceUrl,
        accessToken,
        `/query?q=${encodeURIComponent(soql)}`,
      )) as SalesforceQueryResponse<{ Id: string }>;

      if (contactResult.records.length === 0) continue;

      const sfContactId = contactResult.records[0].Id;

      // Format the signal as a Task
      const metadata = signal.metadata as Record<string, unknown>;
      const packageName = (metadata?.packageName as string) || '';
      const companyName = signal.account?.name || 'Unknown Company';

      const taskData: Record<string, unknown> = {
        Subject: `DevSignal: ${signal.type}`,
        Description: [
          `Signal Type: ${signal.type}`,
          packageName ? `Package: ${packageName}` : '',
          `Company: ${companyName}`,
          metadata?.version ? `Version: ${metadata.version}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        WhoId: sfContactId,
        Status: 'Completed',
        Priority: 'Normal',
        ActivityDate: signal.timestamp.toISOString().split('T')[0],
      };

      await salesforceApi(
        organizationId,
        instanceUrl,
        accessToken,
        '/sobjects/Task',
        { method: 'POST', body: taskData },
      );

      result.synced++;
    } catch (error) {
      result.failed++;
      logger.warn('Failed to sync signal as Salesforce Task', {
        signalId: signal.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect Salesforce by storing OAuth tokens + instance URL and registering custom fields.
 */
export async function connectSalesforce(
  organizationId: string,
  accessToken: string,
  refreshToken: string,
  instanceUrl: string,
): Promise<void> {
  // Store tokens in org settings
  await updateOrgSettings(organizationId, {
    salesforceAccessToken: accessToken,
    salesforceRefreshToken: refreshToken,
    salesforceInstanceUrl: instanceUrl,
  });

  // Register custom fields
  await registerCustomFields(organizationId);

  logAudit({
    organizationId,
    action: 'salesforce_connect',
    entityType: 'integration',
    entityName: 'Salesforce',
    metadata: { instanceUrl } as unknown as Record<string, unknown>,
  });

  logger.info('Salesforce connected', { organizationId, instanceUrl });
}

/**
 * Disconnect Salesforce by removing tokens and settings.
 */
export async function disconnectSalesforce(
  organizationId: string,
): Promise<void> {
  const { rawSettings } = await getOrgSettings(organizationId);

  // Remove all Salesforce-related settings
  const {
    salesforceAccessToken: _a,
    salesforceRefreshToken: _b,
    salesforceInstanceUrl: _c,
    salesforceLastSyncAt: _d,
    salesforceLastSyncResult: _e,
    salesforceSyncInProgress: _f,
    salesforceTotalContactsSynced: _g,
    salesforceTotalAccountsSynced: _h,
    salesforceTotalOpportunitiesSynced: _i,
    ...rest
  } = rawSettings;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: rest as Prisma.InputJsonValue },
  });

  logAudit({
    organizationId,
    action: 'salesforce_disconnect',
    entityType: 'integration',
    entityName: 'Salesforce',
  });

  logger.info('Salesforce disconnected', { organizationId });
}

/**
 * Get the current Salesforce sync status.
 */
export async function getSyncStatus(
  organizationId: string,
): Promise<SalesforceSyncStatus> {
  const { salesforce } = await getOrgSettings(organizationId);

  return {
    connected: !!salesforce.salesforceAccessToken,
    lastSyncAt: salesforce.salesforceLastSyncAt || null,
    lastSyncResult: salesforce.salesforceLastSyncResult || null,
    syncInProgress: salesforce.salesforceSyncInProgress || false,
    instanceUrl: salesforce.salesforceInstanceUrl || null,
    totalContactsSynced: salesforce.salesforceTotalContactsSynced || 0,
    totalAccountsSynced: salesforce.salesforceTotalAccountsSynced || 0,
    totalOpportunitiesSynced: salesforce.salesforceTotalOpportunitiesSynced || 0,
  };
}

/**
 * Run a full or incremental sync with Salesforce.
 * This is the main entry point called by the BullMQ worker.
 */
export async function runSync(
  organizationId: string,
  fullSync = false,
): Promise<SalesforceSyncResult> {
  const { salesforce } = await getOrgSettings(organizationId);

  if (!salesforce.salesforceAccessToken || !salesforce.salesforceInstanceUrl) {
    throw new AppError('Salesforce is not connected', 400);
  }

  // Mark sync as in progress
  await updateOrgSettings(organizationId, {
    salesforceSyncInProgress: true,
  });

  const result: SalesforceSyncResult = {
    contacts: { created: 0, updated: 0, failed: 0 },
    accounts: { created: 0, updated: 0, failed: 0 },
    opportunities: { created: 0, updated: 0, failed: 0 },
    tasks: { synced: 0, failed: 0 },
    errors: [],
  };

  try {
    const { accessToken, instanceUrl } = await getValidCredentials(organizationId);
    const since =
      !fullSync && salesforce.salesforceLastSyncAt
        ? new Date(salesforce.salesforceLastSyncAt)
        : null;

    // Sync contacts
    try {
      result.contacts = await syncContacts(organizationId, accessToken, instanceUrl, since);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Contact sync failed: ${msg}`);
      logger.error('Salesforce contact sync failed', { organizationId, error: msg });
    }

    // Sync accounts
    try {
      result.accounts = await syncAccounts(organizationId, accessToken, instanceUrl, since);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Account sync failed: ${msg}`);
      logger.error('Salesforce account sync failed', { organizationId, error: msg });
    }

    // Sync opportunities
    try {
      result.opportunities = await syncOpportunities(organizationId, accessToken, instanceUrl, since);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Opportunity sync failed: ${msg}`);
      logger.error('Salesforce opportunity sync failed', { organizationId, error: msg });
    }

    // Sync signal tasks
    try {
      result.tasks = await syncSignalTasks(organizationId, accessToken, instanceUrl, since);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Signal task sync failed: ${msg}`);
      logger.error('Salesforce signal task sync failed', { organizationId, error: msg });
    }

    // Update sync status
    await updateOrgSettings(organizationId, {
      salesforceLastSyncAt: new Date().toISOString(),
      salesforceLastSyncResult: result as unknown as Prisma.InputJsonValue,
      salesforceSyncInProgress: false,
      salesforceTotalContactsSynced:
        (salesforce.salesforceTotalContactsSynced || 0) +
        result.contacts.created +
        result.contacts.updated,
      salesforceTotalAccountsSynced:
        (salesforce.salesforceTotalAccountsSynced || 0) +
        result.accounts.created +
        result.accounts.updated,
      salesforceTotalOpportunitiesSynced:
        (salesforce.salesforceTotalOpportunitiesSynced || 0) +
        result.opportunities.created +
        result.opportunities.updated,
    });

    logAudit({
      organizationId,
      action: 'salesforce_sync',
      entityType: 'integration',
      entityName: 'Salesforce',
      metadata: {
        fullSync,
        contacts: result.contacts,
        accounts: result.accounts,
        opportunities: result.opportunities,
        tasks: result.tasks,
        errorCount: result.errors.length,
      } as unknown as Record<string, unknown>,
    });

    logger.info('Salesforce sync completed', {
      organizationId,
      contacts: result.contacts,
      accounts: result.accounts,
      opportunities: result.opportunities,
      tasks: result.tasks,
    });

    return result;
  } catch (error) {
    // Mark sync as no longer in progress on failure
    await updateOrgSettings(organizationId, {
      salesforceSyncInProgress: false,
    });

    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Sync failed: ${msg}`);

    logger.error('Salesforce sync failed', { organizationId, error: msg });

    throw error;
  }
}

/**
 * Get all organizations that have Salesforce connected.
 * Used by the scheduler to trigger periodic syncs.
 */
export async function getConnectedOrganizations(): Promise<string[]> {
  const orgs = await prisma.organization.findMany({
    where: {
      settings: {
        path: ['salesforceAccessToken'],
        not: Prisma.AnyNull,
      },
    },
    select: { id: true },
  });

  return orgs.map((org) => org.id);
}
