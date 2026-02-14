import { Prisma, DealStage } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { logAudit } from './audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HubSpotSyncResult {
  contacts: { created: number; updated: number; failed: number };
  companies: { created: number; updated: number; failed: number };
  deals: { created: number; updated: number; failed: number };
  signals: { synced: number; failed: number };
  errors: string[];
}

export interface HubSpotSyncStatus {
  connected: boolean;
  lastSyncAt: string | null;
  lastSyncResult: HubSpotSyncResult | null;
  syncInProgress: boolean;
  portalId: string | null;
  totalContactsSynced: number;
  totalCompaniesSynced: number;
  totalDealsSynced: number;
}

interface HubSpotSettings {
  hubspotAccessToken?: string;
  hubspotRefreshToken?: string;
  hubspotPortalId?: string;
  hubspotLastSyncAt?: string;
  hubspotLastSyncResult?: HubSpotSyncResult;
  hubspotSyncInProgress?: boolean;
  hubspotTotalContactsSynced?: number;
  hubspotTotalCompaniesSynced?: number;
  hubspotTotalDealsSynced?: number;
}

interface HubSpotTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface HubSpotBatchResponse {
  status: string;
  results: Array<{
    id: string;
    properties: Record<string, string>;
    createdAt: string;
    updatedAt: string;
  }>;
  errors?: Array<{
    status: string;
    category: string;
    message: string;
  }>;
}

interface HubSpotSearchResponse {
  total: number;
  results: Array<{
    id: string;
    properties: Record<string, string>;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const BATCH_SIZE = 100;

const DEVSIGNAL_CONTACT_PROPERTIES = [
  {
    name: 'devsignal_pqa_score',
    label: 'DevSignal PQA Score',
    type: 'number',
    fieldType: 'number',
    description: 'Product-Qualified Account score from DevSignal (0-100)',
  },
  {
    name: 'devsignal_pqa_tier',
    label: 'DevSignal PQA Tier',
    type: 'enumeration',
    fieldType: 'select',
    description: 'PQA tier classification from DevSignal',
    options: [
      { label: 'Hot', value: 'HOT' },
      { label: 'Warm', value: 'WARM' },
      { label: 'Cold', value: 'COLD' },
      { label: 'Inactive', value: 'INACTIVE' },
    ],
  },
  {
    name: 'devsignal_signal_count',
    label: 'DevSignal Signal Count',
    type: 'number',
    fieldType: 'number',
    description: 'Total number of signals tracked by DevSignal',
  },
  {
    name: 'devsignal_last_signal_date',
    label: 'DevSignal Last Signal Date',
    type: 'date',
    fieldType: 'date',
    description: 'Date of the most recent signal from DevSignal',
  },
];

const DEVSIGNAL_COMPANY_PROPERTIES = [
  {
    name: 'devsignal_pqa_score',
    label: 'DevSignal PQA Score',
    type: 'number',
    fieldType: 'number',
    description: 'Product-Qualified Account score from DevSignal (0-100)',
  },
  {
    name: 'devsignal_developer_count',
    label: 'DevSignal Developer Count',
    type: 'number',
    fieldType: 'number',
    description: 'Number of developers identified by DevSignal',
  },
  {
    name: 'devsignal_top_signal_type',
    label: 'DevSignal Top Signal Type',
    type: 'string',
    fieldType: 'text',
    description: 'Most common signal type from DevSignal',
  },
  {
    name: 'devsignal_last_signal_date',
    label: 'DevSignal Last Signal Date',
    type: 'date',
    fieldType: 'date',
    description: 'Date of the most recent signal from DevSignal',
  },
];

const DEVSIGNAL_DEAL_PROPERTIES = [
  {
    name: 'devsignal_deal_id',
    label: 'DevSignal Deal ID',
    type: 'string',
    fieldType: 'text',
    description: 'Internal DevSignal deal identifier for sync',
  },
  {
    name: 'devsignal_stage',
    label: 'DevSignal PLG Stage',
    type: 'string',
    fieldType: 'text',
    description: 'DevSignal PLG pipeline stage',
  },
];

// Reverse map: DevSignal DealStage -> HubSpot stage label
const DEAL_STAGE_LABELS: Record<string, string> = {
  [DealStage.ANONYMOUS_USAGE]: 'Anonymous Usage',
  [DealStage.IDENTIFIED]: 'Identified',
  [DealStage.ACTIVATED]: 'Activated',
  [DealStage.TEAM_ADOPTION]: 'Team Adoption',
  [DealStage.EXPANSION_SIGNAL]: 'Expansion Signal',
  [DealStage.SALES_QUALIFIED]: 'Sales Qualified',
  [DealStage.NEGOTIATION]: 'Negotiation',
  [DealStage.CLOSED_WON]: 'Closed Won',
  [DealStage.CLOSED_LOST]: 'Closed Lost',
};

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

async function getOrgSettings(organizationId: string): Promise<{
  hubspot: HubSpotSettings;
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
  const hubspot: HubSpotSettings = {
    hubspotAccessToken: rawSettings.hubspotAccessToken as string | undefined,
    hubspotRefreshToken: rawSettings.hubspotRefreshToken as string | undefined,
    hubspotPortalId: rawSettings.hubspotPortalId as string | undefined,
    hubspotLastSyncAt: rawSettings.hubspotLastSyncAt as string | undefined,
    hubspotLastSyncResult: rawSettings.hubspotLastSyncResult as HubSpotSyncResult | undefined,
    hubspotSyncInProgress: rawSettings.hubspotSyncInProgress as boolean | undefined,
    hubspotTotalContactsSynced: rawSettings.hubspotTotalContactsSynced as number | undefined,
    hubspotTotalCompaniesSynced: rawSettings.hubspotTotalCompaniesSynced as number | undefined,
    hubspotTotalDealsSynced: rawSettings.hubspotTotalDealsSynced as number | undefined,
  };

  return { hubspot, rawSettings };
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
// HubSpot API helpers
// ---------------------------------------------------------------------------

async function hubspotFetch(
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

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${HUBSPOT_API_BASE}${path}`, fetchOptions);

  if (response.status === 401) {
    throw new AppError('HubSpot token expired or invalid', 401);
  }

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('HubSpot API error', {
      status: response.status,
      path,
      body: errorBody,
    });
    throw new AppError(
      `HubSpot API error: ${response.status} - ${errorBody}`,
      response.status,
    );
  }

  // Some endpoints return 204 with no content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Refresh the HubSpot OAuth2 access token using the refresh token.
 */
async function refreshAccessToken(
  organizationId: string,
  refreshToken: string,
): Promise<string> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError(
      'HubSpot OAuth credentials not configured (HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET)',
      500,
    );
  }

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error('HubSpot token refresh failed', {
      status: response.status,
      body: errorBody,
    });
    throw new AppError('Failed to refresh HubSpot access token', 401);
  }

  const data = (await response.json()) as HubSpotTokenResponse;

  // Store new tokens
  await updateOrgSettings(organizationId, {
    hubspotAccessToken: data.access_token,
    hubspotRefreshToken: data.refresh_token,
  });

  return data.access_token;
}

/**
 * Get a valid access token, refreshing if needed.
 */
async function getValidAccessToken(organizationId: string): Promise<string> {
  const { hubspot } = await getOrgSettings(organizationId);

  if (!hubspot.hubspotAccessToken) {
    throw new AppError('HubSpot is not connected', 400);
  }

  try {
    // Test the token with a simple API call
    await hubspotFetch(hubspot.hubspotAccessToken, '/crm/v3/objects/contacts?limit=1');
    return hubspot.hubspotAccessToken;
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401 && hubspot.hubspotRefreshToken) {
      // Token expired, try refreshing
      logger.info('HubSpot token expired, refreshing...', { organizationId });
      return refreshAccessToken(organizationId, hubspot.hubspotRefreshToken);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Custom Property Registration
// ---------------------------------------------------------------------------

/**
 * Ensure the "DevSignal" property group exists for a given object type.
 */
async function ensurePropertyGroup(
  accessToken: string,
  objectType: string,
): Promise<void> {
  const groupName = 'devsignal';

  try {
    await hubspotFetch(
      accessToken,
      `/crm/v3/properties/${objectType}/groups/${groupName}`,
    );
    // Group already exists
  } catch {
    // Group doesn't exist, create it
    try {
      await hubspotFetch(
        accessToken,
        `/crm/v3/properties/${objectType}/groups`,
        {
          method: 'POST',
          body: {
            name: groupName,
            label: 'DevSignal',
            displayOrder: 1,
          },
        },
      );
      logger.info(`Created DevSignal property group for ${objectType}`);
    } catch (createErr) {
      // Ignore if already exists (race condition)
      logger.warn(`Could not create property group for ${objectType}`, {
        error: createErr instanceof Error ? createErr.message : String(createErr),
      });
    }
  }
}

/**
 * Ensure a specific custom property exists in HubSpot.
 */
async function ensureProperty(
  accessToken: string,
  objectType: string,
  property: {
    name: string;
    label: string;
    type: string;
    fieldType: string;
    description: string;
    options?: Array<{ label: string; value: string }>;
  },
): Promise<void> {
  try {
    await hubspotFetch(
      accessToken,
      `/crm/v3/properties/${objectType}/${property.name}`,
    );
    // Property already exists
  } catch {
    // Property doesn't exist, create it
    try {
      const body: Record<string, unknown> = {
        name: property.name,
        label: property.label,
        type: property.type,
        fieldType: property.fieldType,
        description: property.description,
        groupName: 'devsignal',
      };

      if (property.options) {
        body.options = property.options.map((opt, idx) => ({
          label: opt.label,
          value: opt.value,
          displayOrder: idx,
        }));
      }

      await hubspotFetch(
        accessToken,
        `/crm/v3/properties/${objectType}`,
        { method: 'POST', body },
      );
      logger.info(`Created HubSpot property ${property.name} on ${objectType}`);
    } catch (createErr) {
      logger.warn(`Could not create property ${property.name} on ${objectType}`, {
        error: createErr instanceof Error ? createErr.message : String(createErr),
      });
    }
  }
}

/**
 * Register all DevSignal custom properties in HubSpot.
 */
export async function registerCustomProperties(
  organizationId: string,
): Promise<void> {
  const accessToken = await getValidAccessToken(organizationId);

  // Create property groups
  await ensurePropertyGroup(accessToken, 'contacts');
  await ensurePropertyGroup(accessToken, 'companies');
  await ensurePropertyGroup(accessToken, 'deals');

  // Create contact properties
  for (const prop of DEVSIGNAL_CONTACT_PROPERTIES) {
    await ensureProperty(accessToken, 'contacts', prop);
  }

  // Create company properties
  for (const prop of DEVSIGNAL_COMPANY_PROPERTIES) {
    await ensureProperty(accessToken, 'companies', prop);
  }

  // Create deal properties
  for (const prop of DEVSIGNAL_DEAL_PROPERTIES) {
    await ensureProperty(accessToken, 'deals', prop);
  }

  logger.info('All DevSignal custom properties registered in HubSpot', {
    organizationId,
  });
}

// ---------------------------------------------------------------------------
// Contact Sync
// ---------------------------------------------------------------------------

/**
 * Search for a HubSpot contact by email.
 */
async function findHubSpotContactByEmail(
  accessToken: string,
  email: string,
): Promise<string | null> {
  const result = (await hubspotFetch(
    accessToken,
    '/crm/v3/objects/contacts/search',
    {
      method: 'POST',
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        limit: 1,
      },
    },
  )) as HubSpotSearchResponse;

  return result.results.length > 0 ? result.results[0].id : null;
}

/**
 * Sync contacts from DevSignal to HubSpot using batch upsert.
 */
async function syncContacts(
  organizationId: string,
  accessToken: string,
  since: Date | null,
): Promise<{ created: number; updated: number; failed: number }> {
  const result = { created: 0, updated: 0, failed: 0 };

  const where: Record<string, unknown> = {
    organizationId,
    email: { not: null },
  };
  if (since) {
    where.updatedAt = { gte: since };
  }

  const contacts = await prisma.contact.findMany({
    where,
    include: {
      company: {
        include: {
          score: true,
        },
      },
    },
  });

  if (contacts.length === 0) return result;

  // Process in batches
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);

    // Split into creates and updates by checking if contact exists in HubSpot
    const creates: Array<{ properties: Record<string, string> }> = [];
    const updates: Array<{
      id: string;
      properties: Record<string, string>;
    }> = [];

    for (const contact of batch) {
      if (!contact.email) continue;

      try {
        const hubspotId = await findHubSpotContactByEmail(
          accessToken,
          contact.email,
        );

        const properties: Record<string, string> = {
          email: contact.email,
          firstname: contact.firstName || '',
          lastname: contact.lastName || '',
        };

        if (contact.phone) properties.phone = contact.phone;
        if (contact.title) properties.jobtitle = contact.title;

        // DevSignal custom properties
        if (contact.company?.score) {
          properties.devsignal_pqa_score = String(contact.company.score.score);
          properties.devsignal_pqa_tier = contact.company.score.tier;
          properties.devsignal_signal_count = String(
            contact.company.score.signalCount,
          );
          if (contact.company.score.lastSignalAt) {
            properties.devsignal_last_signal_date = contact.company.score.lastSignalAt
              .toISOString()
              .split('T')[0];
          }
        }

        if (hubspotId) {
          updates.push({ id: hubspotId, properties });
        } else {
          creates.push({ properties });
        }
      } catch (error) {
        result.failed++;
        logger.warn('Failed to prepare contact for HubSpot sync', {
          contactId: contact.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Batch create
    if (creates.length > 0) {
      try {
        const createResult = (await hubspotFetch(
          accessToken,
          '/crm/v3/objects/contacts/batch/create',
          { method: 'POST', body: { inputs: creates } },
        )) as HubSpotBatchResponse;
        result.created += createResult.results?.length ?? 0;
      } catch (error) {
        result.failed += creates.length;
        logger.error('HubSpot contact batch create failed', {
          error: error instanceof Error ? error.message : String(error),
          count: creates.length,
        });
      }
    }

    // Batch update
    if (updates.length > 0) {
      try {
        const updateResult = (await hubspotFetch(
          accessToken,
          '/crm/v3/objects/contacts/batch/update',
          { method: 'POST', body: { inputs: updates } },
        )) as HubSpotBatchResponse;
        result.updated += updateResult.results?.length ?? 0;
      } catch (error) {
        result.failed += updates.length;
        logger.error('HubSpot contact batch update failed', {
          error: error instanceof Error ? error.message : String(error),
          count: updates.length,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Company Sync
// ---------------------------------------------------------------------------

/**
 * Search for a HubSpot company by domain.
 */
async function findHubSpotCompanyByDomain(
  accessToken: string,
  domain: string,
): Promise<string | null> {
  const result = (await hubspotFetch(
    accessToken,
    '/crm/v3/objects/companies/search',
    {
      method: 'POST',
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'domain',
                operator: 'EQ',
                value: domain,
              },
            ],
          },
        ],
        limit: 1,
      },
    },
  )) as HubSpotSearchResponse;

  return result.results.length > 0 ? result.results[0].id : null;
}

/**
 * Get the top signal type for a company by aggregating signals.
 */
async function getTopSignalType(
  organizationId: string,
  companyId: string,
): Promise<string | null> {
  const signals = await prisma.signal.groupBy({
    by: ['type'],
    where: { organizationId, accountId: companyId },
    _count: { type: true },
    orderBy: { _count: { type: 'desc' } },
    take: 1,
  });

  return signals.length > 0 ? signals[0].type : null;
}

/**
 * Sync companies from DevSignal to HubSpot.
 */
async function syncCompanies(
  organizationId: string,
  accessToken: string,
  since: Date | null,
): Promise<{ created: number; updated: number; failed: number }> {
  const result = { created: 0, updated: 0, failed: 0 };

  const where: Record<string, unknown> = {
    organizationId,
    domain: { not: null },
  };
  if (since) {
    where.updatedAt = { gte: since };
  }

  const companies = await prisma.company.findMany({
    where,
    include: {
      score: true,
      _count: {
        select: { contacts: true },
      },
    },
  });

  if (companies.length === 0) return result;

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);

    const creates: Array<{ properties: Record<string, string> }> = [];
    const updates: Array<{
      id: string;
      properties: Record<string, string>;
    }> = [];

    for (const company of batch) {
      if (!company.domain) continue;

      try {
        const hubspotId = await findHubSpotCompanyByDomain(
          accessToken,
          company.domain,
        );

        const properties: Record<string, string> = {
          name: company.name,
          domain: company.domain,
        };

        if (company.industry) properties.industry = company.industry;
        if (company.website) properties.website = company.website;
        if (company.phone) properties.phone = company.phone;

        // DevSignal custom properties
        if (company.score) {
          properties.devsignal_pqa_score = String(company.score.score);
        }
        properties.devsignal_developer_count = String(company._count.contacts);

        const topSignalType = await getTopSignalType(
          organizationId,
          company.id,
        );
        if (topSignalType) {
          properties.devsignal_top_signal_type = topSignalType;
        }

        if (company.score?.lastSignalAt) {
          properties.devsignal_last_signal_date = company.score.lastSignalAt
            .toISOString()
            .split('T')[0];
        }

        if (hubspotId) {
          updates.push({ id: hubspotId, properties });
        } else {
          creates.push({ properties });
        }
      } catch (error) {
        result.failed++;
        logger.warn('Failed to prepare company for HubSpot sync', {
          companyId: company.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Batch create
    if (creates.length > 0) {
      try {
        const createResult = (await hubspotFetch(
          accessToken,
          '/crm/v3/objects/companies/batch/create',
          { method: 'POST', body: { inputs: creates } },
        )) as HubSpotBatchResponse;
        result.created += createResult.results?.length ?? 0;
      } catch (error) {
        result.failed += creates.length;
        logger.error('HubSpot company batch create failed', {
          error: error instanceof Error ? error.message : String(error),
          count: creates.length,
        });
      }
    }

    // Batch update
    if (updates.length > 0) {
      try {
        const updateResult = (await hubspotFetch(
          accessToken,
          '/crm/v3/objects/companies/batch/update',
          { method: 'POST', body: { inputs: updates } },
        )) as HubSpotBatchResponse;
        result.updated += updateResult.results?.length ?? 0;
      } catch (error) {
        result.failed += updates.length;
        logger.error('HubSpot company batch update failed', {
          error: error instanceof Error ? error.message : String(error),
          count: updates.length,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Deal Sync
// ---------------------------------------------------------------------------

/**
 * Search for a HubSpot deal by the custom devsignal_deal_id property.
 */
async function findHubSpotDealByDevSignalId(
  accessToken: string,
  dealId: string,
): Promise<string | null> {
  const result = (await hubspotFetch(
    accessToken,
    '/crm/v3/objects/deals/search',
    {
      method: 'POST',
      body: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'devsignal_deal_id',
                operator: 'EQ',
                value: dealId,
              },
            ],
          },
        ],
        limit: 1,
      },
    },
  )) as HubSpotSearchResponse;

  return result.results.length > 0 ? result.results[0].id : null;
}

/**
 * Sync deals from DevSignal to HubSpot.
 */
async function syncDeals(
  organizationId: string,
  accessToken: string,
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

  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const batch = deals.slice(i, i + BATCH_SIZE);

    const creates: Array<{ properties: Record<string, string> }> = [];
    const updates: Array<{
      id: string;
      properties: Record<string, string>;
    }> = [];

    for (const deal of batch) {
      try {
        const hubspotId = await findHubSpotDealByDevSignalId(
          accessToken,
          deal.id,
        );

        const properties: Record<string, string> = {
          dealname: deal.title,
          devsignal_deal_id: deal.id,
          devsignal_stage: DEAL_STAGE_LABELS[deal.stage] || deal.stage,
        };

        if (deal.amount !== null) {
          properties.amount = String(deal.amount);
        }
        if (deal.expectedCloseDate) {
          properties.closedate = deal.expectedCloseDate.toISOString().split('T')[0];
        }
        if (deal.description) {
          properties.description = deal.description;
        }

        if (hubspotId) {
          updates.push({ id: hubspotId, properties });
        } else {
          creates.push({ properties });
        }
      } catch (error) {
        result.failed++;
        logger.warn('Failed to prepare deal for HubSpot sync', {
          dealId: deal.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Batch create
    if (creates.length > 0) {
      try {
        const createResult = (await hubspotFetch(
          accessToken,
          '/crm/v3/objects/deals/batch/create',
          { method: 'POST', body: { inputs: creates } },
        )) as HubSpotBatchResponse;
        result.created += createResult.results?.length ?? 0;
      } catch (error) {
        result.failed += creates.length;
        logger.error('HubSpot deal batch create failed', {
          error: error instanceof Error ? error.message : String(error),
          count: creates.length,
        });
      }
    }

    // Batch update
    if (updates.length > 0) {
      try {
        const updateResult = (await hubspotFetch(
          accessToken,
          '/crm/v3/objects/deals/batch/update',
          { method: 'POST', body: { inputs: updates } },
        )) as HubSpotBatchResponse;
        result.updated += updateResult.results?.length ?? 0;
      } catch (error) {
        result.failed += updates.length;
        logger.error('HubSpot deal batch update failed', {
          error: error instanceof Error ? error.message : String(error),
          count: updates.length,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Signal Activity Sync (push as Notes)
// ---------------------------------------------------------------------------

/**
 * Sync recent signals as notes on HubSpot contacts.
 */
async function syncSignalNotes(
  organizationId: string,
  accessToken: string,
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
    take: 500, // Limit to prevent overwhelming HubSpot
  });

  if (signals.length === 0) return result;

  for (const signal of signals) {
    try {
      if (!signal.actor?.email) continue;

      // Find the HubSpot contact
      const hubspotContactId = await findHubSpotContactByEmail(
        accessToken,
        signal.actor.email,
      );

      if (!hubspotContactId) continue;

      // Format the signal as a note
      const companyName = signal.account?.name || 'Unknown Company';
      const metadata = signal.metadata as Record<string, unknown>;
      const packageName = (metadata?.packageName as string) || '';
      const noteBody = [
        `DevSignal: ${signal.type}`,
        packageName ? `Package: ${packageName}` : '',
        `Company: ${companyName}`,
        `Date: ${signal.timestamp.toISOString().split('T')[0]}`,
        metadata?.version ? `Version: ${metadata.version}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Create a note engagement
      await hubspotFetch(accessToken, '/crm/v3/objects/notes', {
        method: 'POST',
        body: {
          properties: {
            hs_note_body: noteBody,
            hs_timestamp: signal.timestamp.toISOString(),
          },
          associations: [
            {
              to: { id: hubspotContactId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 202, // Note to Contact
                },
              ],
            },
          ],
        },
      });

      result.synced++;
    } catch (error) {
      result.failed++;
      logger.warn('Failed to sync signal as HubSpot note', {
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
 * Connect HubSpot by storing OAuth tokens and registering custom properties.
 */
export async function connectHubSpot(
  organizationId: string,
  accessToken: string,
  refreshToken: string,
  portalId?: string,
): Promise<void> {
  // Store tokens in org settings
  await updateOrgSettings(organizationId, {
    hubspotAccessToken: accessToken,
    hubspotRefreshToken: refreshToken,
    hubspotPortalId: portalId || null,
  });

  // Register custom properties
  await registerCustomProperties(organizationId);

  logAudit({
    organizationId,
    action: 'hubspot_connect',
    entityType: 'integration',
    entityName: 'HubSpot',
    metadata: { portalId } as unknown as Record<string, unknown>,
  });

  logger.info('HubSpot connected', { organizationId, portalId });
}

/**
 * Disconnect HubSpot by removing tokens and settings.
 */
export async function disconnectHubSpot(
  organizationId: string,
): Promise<void> {
  const { rawSettings } = await getOrgSettings(organizationId);

  // Remove all HubSpot-related settings
  const {
    hubspotAccessToken: _a,
    hubspotRefreshToken: _b,
    hubspotPortalId: _c,
    hubspotLastSyncAt: _d,
    hubspotLastSyncResult: _e,
    hubspotSyncInProgress: _f,
    hubspotTotalContactsSynced: _g,
    hubspotTotalCompaniesSynced: _h,
    hubspotTotalDealsSynced: _i,
    ...rest
  } = rawSettings;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: rest as Prisma.InputJsonValue },
  });

  logAudit({
    organizationId,
    action: 'hubspot_disconnect',
    entityType: 'integration',
    entityName: 'HubSpot',
  });

  logger.info('HubSpot disconnected', { organizationId });
}

/**
 * Get the current HubSpot sync status.
 */
export async function getSyncStatus(
  organizationId: string,
): Promise<HubSpotSyncStatus> {
  const { hubspot } = await getOrgSettings(organizationId);

  return {
    connected: !!hubspot.hubspotAccessToken,
    lastSyncAt: hubspot.hubspotLastSyncAt || null,
    lastSyncResult: hubspot.hubspotLastSyncResult || null,
    syncInProgress: hubspot.hubspotSyncInProgress || false,
    portalId: hubspot.hubspotPortalId || null,
    totalContactsSynced: hubspot.hubspotTotalContactsSynced || 0,
    totalCompaniesSynced: hubspot.hubspotTotalCompaniesSynced || 0,
    totalDealsSynced: hubspot.hubspotTotalDealsSynced || 0,
  };
}

/**
 * Run a full or incremental sync to HubSpot.
 * This is the main entry point called by the BullMQ worker.
 */
export async function runSync(
  organizationId: string,
  fullSync = false,
): Promise<HubSpotSyncResult> {
  const { hubspot } = await getOrgSettings(organizationId);

  if (!hubspot.hubspotAccessToken) {
    throw new AppError('HubSpot is not connected', 400);
  }

  // Mark sync as in progress
  await updateOrgSettings(organizationId, {
    hubspotSyncInProgress: true,
  });

  const result: HubSpotSyncResult = {
    contacts: { created: 0, updated: 0, failed: 0 },
    companies: { created: 0, updated: 0, failed: 0 },
    deals: { created: 0, updated: 0, failed: 0 },
    signals: { synced: 0, failed: 0 },
    errors: [],
  };

  try {
    const accessToken = await getValidAccessToken(organizationId);
    const since =
      !fullSync && hubspot.hubspotLastSyncAt
        ? new Date(hubspot.hubspotLastSyncAt)
        : null;

    // Sync contacts
    try {
      result.contacts = await syncContacts(organizationId, accessToken, since);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Contact sync failed: ${msg}`);
      logger.error('HubSpot contact sync failed', {
        organizationId,
        error: msg,
      });
    }

    // Sync companies
    try {
      result.companies = await syncCompanies(
        organizationId,
        accessToken,
        since,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Company sync failed: ${msg}`);
      logger.error('HubSpot company sync failed', {
        organizationId,
        error: msg,
      });
    }

    // Sync deals
    try {
      result.deals = await syncDeals(organizationId, accessToken, since);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Deal sync failed: ${msg}`);
      logger.error('HubSpot deal sync failed', {
        organizationId,
        error: msg,
      });
    }

    // Sync signal notes
    try {
      result.signals = await syncSignalNotes(
        organizationId,
        accessToken,
        since,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Signal note sync failed: ${msg}`);
      logger.error('HubSpot signal note sync failed', {
        organizationId,
        error: msg,
      });
    }

    // Update sync status
    await updateOrgSettings(organizationId, {
      hubspotLastSyncAt: new Date().toISOString(),
      hubspotLastSyncResult: result as unknown as Prisma.InputJsonValue,
      hubspotSyncInProgress: false,
      hubspotTotalContactsSynced:
        (hubspot.hubspotTotalContactsSynced || 0) +
        result.contacts.created +
        result.contacts.updated,
      hubspotTotalCompaniesSynced:
        (hubspot.hubspotTotalCompaniesSynced || 0) +
        result.companies.created +
        result.companies.updated,
      hubspotTotalDealsSynced:
        (hubspot.hubspotTotalDealsSynced || 0) +
        result.deals.created +
        result.deals.updated,
    });

    logAudit({
      organizationId,
      action: 'hubspot_sync',
      entityType: 'integration',
      entityName: 'HubSpot',
      metadata: {
        fullSync,
        contacts: result.contacts,
        companies: result.companies,
        deals: result.deals,
        signals: result.signals,
        errorCount: result.errors.length,
      } as unknown as Record<string, unknown>,
    });

    logger.info('HubSpot sync completed', {
      organizationId,
      contacts: result.contacts,
      companies: result.companies,
      deals: result.deals,
      signals: result.signals,
    });

    return result;
  } catch (error) {
    // Mark sync as no longer in progress on failure
    await updateOrgSettings(organizationId, {
      hubspotSyncInProgress: false,
    });

    const msg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Sync failed: ${msg}`);

    logger.error('HubSpot sync failed', { organizationId, error: msg });

    throw error;
  }
}

/**
 * Get all organizations that have HubSpot connected.
 * Used by the scheduler to trigger periodic syncs.
 */
export async function getConnectedOrganizations(): Promise<string[]> {
  // Query organizations with hubspotAccessToken in settings JSON
  const orgs = await prisma.organization.findMany({
    where: {
      settings: {
        path: ['hubspotAccessToken'],
        not: Prisma.AnyNull,
      },
    },
    select: { id: true },
  });

  return orgs.map((org) => org.id);
}
