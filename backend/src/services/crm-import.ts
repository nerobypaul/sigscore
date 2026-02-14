import { Prisma, DealStage, CompanySize } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { parseCSV } from './csv-import';
import { logAudit } from './audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CrmFormat = 'hubspot' | 'salesforce' | 'unknown';

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ParsedContact {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  companyName?: string;
  lifecycleStage?: string;
  leadStatus?: string;
  leadSource?: string;
  linkedIn?: string;
  twitter?: string;
  github?: string;
  notes?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  customFields?: Record<string, unknown>;
  createdAt?: string;
}

export interface ParsedCompany {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  annualRevenue?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedIn?: string;
  twitter?: string;
  githubOrg?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  customFields?: Record<string, unknown>;
}

export interface ParsedDeal {
  title: string;
  stage?: string;
  value?: number;
  expectedCloseDate?: string;
  companyName?: string;
  pipeline?: string;
  description?: string;
  customFields?: Record<string, unknown>;
}

export interface DetectResult {
  format: CrmFormat;
  entityType: 'contacts' | 'companies' | 'deals' | 'unknown';
  sampleRows: Record<string, string>[];
  fieldMapping: Record<string, string>;
  totalRows: number;
}

// ---------------------------------------------------------------------------
// Stage Mapping
// ---------------------------------------------------------------------------

const HUBSPOT_STAGE_MAP: Record<string, DealStage> = {
  'appointmentscheduled': DealStage.ACTIVATED,
  'qualifiedtobuy': DealStage.SALES_QUALIFIED,
  'presentationscheduled': DealStage.TEAM_ADOPTION,
  'decisionmakerboughtin': DealStage.EXPANSION_SIGNAL,
  'contractsent': DealStage.NEGOTIATION,
  'closedwon': DealStage.CLOSED_WON,
  'closedlost': DealStage.CLOSED_LOST,
};

const SALESFORCE_STAGE_MAP: Record<string, DealStage> = {
  'prospecting': DealStage.IDENTIFIED,
  'qualification': DealStage.SALES_QUALIFIED,
  'needs analysis': DealStage.ACTIVATED,
  'value proposition': DealStage.TEAM_ADOPTION,
  'proposal/price quote': DealStage.EXPANSION_SIGNAL,
  'negotiation/review': DealStage.NEGOTIATION,
  'closed won': DealStage.CLOSED_WON,
  'closed lost': DealStage.CLOSED_LOST,
};

function mapDealStage(stage: string, format: CrmFormat): DealStage {
  const normalized = stage.toLowerCase().trim();
  const map = format === 'hubspot' ? HUBSPOT_STAGE_MAP : SALESFORCE_STAGE_MAP;
  return map[normalized] ?? DealStage.IDENTIFIED;
}

// ---------------------------------------------------------------------------
// HubSpot Field Maps
// ---------------------------------------------------------------------------

const HUBSPOT_CONTACT_MAP: Record<string, string> = {
  'first name': 'firstName',
  'last name': 'lastName',
  'email': 'email',
  'phone number': 'phone',
  'job title': 'title',
  'company name': 'companyName',
  'lifecycle stage': 'lifecycleStage',
  'lead status': 'leadStatus',
  'create date': 'createdAt',
  'linkedin': 'linkedIn',
  'linkedin url': 'linkedIn',
  'twitter': 'twitter',
  'twitter handle': 'twitter',
  'github': 'github',
  'notes': 'notes',
  'city': 'city',
  'state/region': 'state',
  'state': 'state',
  'country/region': 'country',
  'country': 'country',
  'street address': 'address',
  'address': 'address',
};

const HUBSPOT_COMPANY_MAP: Record<string, string> = {
  'company name': 'name',
  'name': 'name',
  'company domain name': 'domain',
  'domain': 'domain',
  'industry': 'industry',
  'number of employees': 'size',
  'annual revenue': 'annualRevenue',
  'city': 'city',
  'state/region': 'state',
  'state': 'state',
  'country/region': 'country',
  'country': 'country',
  'street address': 'address',
  'address': 'address',
  'phone': 'phone',
  'phone number': 'phone',
  'website': 'website',
  'linkedin': 'linkedIn',
  'linkedin company page': 'linkedIn',
  'twitter': 'twitter',
  'description': 'description',
};

const HUBSPOT_DEAL_MAP: Record<string, string> = {
  'deal name': 'title',
  'deal stage': 'stage',
  'amount': 'value',
  'close date': 'expectedCloseDate',
  'associated company': 'companyName',
  'pipeline': 'pipeline',
  'deal description': 'description',
  'description': 'description',
};

// ---------------------------------------------------------------------------
// Salesforce Field Maps
// ---------------------------------------------------------------------------

const SALESFORCE_CONTACT_MAP: Record<string, string> = {
  'first name': 'firstName',
  'last name': 'lastName',
  'email': 'email',
  'phone': 'phone',
  'title': 'title',
  'account name': 'companyName',
  'lead source': 'leadSource',
  'created date': 'createdAt',
  'linkedin': 'linkedIn',
  'twitter': 'twitter',
  'github': 'github',
  'mailing city': 'city',
  'mailing state': 'state',
  'mailing country': 'country',
  'mailing street': 'address',
  'description': 'notes',
};

const SALESFORCE_COMPANY_MAP: Record<string, string> = {
  'account name': 'name',
  'website': 'website',
  'industry': 'industry',
  'number of employees': 'size',
  'billing city': 'city',
  'billing state': 'state',
  'billing country': 'country',
  'billing street': 'address',
  'phone': 'phone',
  'description': 'description',
  'linkedin': 'linkedIn',
  'twitter': 'twitter',
};

const SALESFORCE_DEAL_MAP: Record<string, string> = {
  'opportunity name': 'title',
  'stage': 'stage',
  'amount': 'value',
  'close date': 'expectedCloseDate',
  'account name': 'companyName',
  'description': 'description',
};

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/** Unique HubSpot headers that distinguish it from Salesforce */
const HUBSPOT_MARKERS = [
  'company domain name',
  'lifecycle stage',
  'deal name',
  'deal stage',
  'associated company',
  'lead status',
  'phone number',
  'number of employees',
  'annual revenue',
  'state/region',
  'country/region',
];

/** Unique Salesforce headers that distinguish it from HubSpot */
const SALESFORCE_MARKERS = [
  'account name',
  'opportunity name',
  'lead source',
  'billing city',
  'billing state',
  'billing country',
  'mailing city',
  'mailing state',
  'mailing country',
  'created date',
];

export function detectCrmFormat(headers: string[]): CrmFormat {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  let hubspotScore = 0;
  let salesforceScore = 0;

  for (const marker of HUBSPOT_MARKERS) {
    if (normalized.includes(marker)) hubspotScore++;
  }
  for (const marker of SALESFORCE_MARKERS) {
    if (normalized.includes(marker)) salesforceScore++;
  }

  if (hubspotScore === 0 && salesforceScore === 0) return 'unknown';
  if (hubspotScore > salesforceScore) return 'hubspot';
  if (salesforceScore > hubspotScore) return 'salesforce';

  // Tie-break: check for HubSpot-specific naming conventions
  if (normalized.includes('company domain name') || normalized.includes('deal name')) {
    return 'hubspot';
  }
  if (normalized.includes('account name') || normalized.includes('opportunity name')) {
    return 'salesforce';
  }

  return 'unknown';
}

/** Detect entity type from headers */
function detectEntityType(
  headers: string[],
  format: CrmFormat,
): 'contacts' | 'companies' | 'deals' | 'unknown' {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  // Deal detection
  if (
    normalized.includes('deal name') ||
    normalized.includes('deal stage') ||
    normalized.includes('opportunity name') ||
    (normalized.includes('stage') && normalized.includes('amount'))
  ) {
    return 'deals';
  }

  // Company detection
  if (
    normalized.includes('company domain name') ||
    normalized.includes('annual revenue') ||
    (normalized.includes('account name') &&
      !normalized.includes('email') &&
      !normalized.includes('first name'))
  ) {
    return 'companies';
  }

  // Contact detection
  if (
    normalized.includes('first name') ||
    normalized.includes('email') ||
    normalized.includes('last name')
  ) {
    return 'contacts';
  }

  // Fallback based on format-specific clues
  if (format === 'hubspot') {
    if (normalized.includes('company name') && normalized.includes('number of employees')) {
      return 'companies';
    }
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// CSV detection endpoint helper
// ---------------------------------------------------------------------------

export function detectCsvFormat(csvContent: string): DetectResult {
  const { headers, rows } = parseCSV(csvContent);

  if (headers.length === 0) {
    return {
      format: 'unknown',
      entityType: 'unknown',
      sampleRows: [],
      fieldMapping: {},
      totalRows: 0,
    };
  }

  const format = detectCrmFormat(headers);
  const entityType = detectEntityType(headers, format);

  // Build field mapping based on format and entity
  const fieldMapping: Record<string, string> = {};
  const fieldMap = getFieldMap(format, entityType);
  for (const header of headers) {
    const normalizedHeader = header.toLowerCase().trim();
    if (fieldMap[normalizedHeader]) {
      fieldMapping[header] = fieldMap[normalizedHeader];
    }
  }

  return {
    format,
    entityType,
    sampleRows: rows.slice(0, 5),
    fieldMapping,
    totalRows: rows.length,
  };
}

function getFieldMap(
  format: CrmFormat,
  entityType: string,
): Record<string, string> {
  if (format === 'hubspot') {
    if (entityType === 'contacts') return HUBSPOT_CONTACT_MAP;
    if (entityType === 'companies') return HUBSPOT_COMPANY_MAP;
    if (entityType === 'deals') return HUBSPOT_DEAL_MAP;
  }
  if (format === 'salesforce') {
    if (entityType === 'contacts') return SALESFORCE_CONTACT_MAP;
    if (entityType === 'companies') return SALESFORCE_COMPANY_MAP;
    if (entityType === 'deals') return SALESFORCE_DEAL_MAP;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Map a row using the field map
// ---------------------------------------------------------------------------

function mapRow(
  row: Record<string, string>,
  fieldMap: Record<string, string>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [csvCol, value] of Object.entries(row)) {
    const normalizedCol = csvCol.trim().toLowerCase();
    const mappedField = fieldMap[normalizedCol];
    if (mappedField && value.trim()) {
      mapped[mappedField] = value.trim();
    }
  }
  return mapped;
}

/**
 * Collect unmapped fields as custom fields
 */
function collectCustomFields(
  row: Record<string, string>,
  fieldMap: Record<string, string>,
): Record<string, unknown> | undefined {
  const custom: Record<string, unknown> = {};
  for (const [csvCol, value] of Object.entries(row)) {
    const normalizedCol = csvCol.trim().toLowerCase();
    if (!fieldMap[normalizedCol] && value.trim()) {
      custom[csvCol.trim()] = value.trim();
    }
  }
  return Object.keys(custom).length > 0 ? custom : undefined;
}

// ---------------------------------------------------------------------------
// Parse functions
// ---------------------------------------------------------------------------

export function parseContacts(
  rows: Record<string, string>[],
  format: CrmFormat,
  _orgId: string,
): ParsedContact[] {
  const fieldMap =
    format === 'hubspot' ? HUBSPOT_CONTACT_MAP : SALESFORCE_CONTACT_MAP;
  const contacts: ParsedContact[] = [];

  for (const row of rows) {
    const mapped = mapRow(row, fieldMap);

    // Try full name splitting if first/last not found
    if (!mapped.firstName && !mapped.lastName) {
      const fullName =
        row['name'] ||
        row['full name'] ||
        row['fullname'] ||
        row['contact name'] ||
        '';
      if (fullName.trim()) {
        const parts = fullName.trim().split(/\s+/);
        mapped.firstName = parts[0] || '';
        mapped.lastName = parts.slice(1).join(' ') || '';
      }
    }

    contacts.push({
      firstName: mapped.firstName || '',
      lastName: mapped.lastName || '',
      email: mapped.email,
      phone: mapped.phone,
      title: mapped.title,
      companyName: mapped.companyName,
      lifecycleStage: mapped.lifecycleStage,
      leadStatus: mapped.leadStatus,
      leadSource: mapped.leadSource,
      linkedIn: mapped.linkedIn,
      twitter: mapped.twitter,
      github: mapped.github,
      notes: mapped.notes,
      address: mapped.address,
      city: mapped.city,
      state: mapped.state,
      country: mapped.country,
      customFields: collectCustomFields(row, fieldMap),
      createdAt: mapped.createdAt,
    });
  }

  return contacts;
}

export function parseCompanies(
  rows: Record<string, string>[],
  format: CrmFormat,
  _orgId: string,
): ParsedCompany[] {
  const fieldMap =
    format === 'hubspot' ? HUBSPOT_COMPANY_MAP : SALESFORCE_COMPANY_MAP;
  const companies: ParsedCompany[] = [];

  for (const row of rows) {
    const mapped = mapRow(row, fieldMap);

    companies.push({
      name: mapped.name || '',
      domain: mapped.domain,
      industry: mapped.industry,
      size: mapped.size,
      annualRevenue: mapped.annualRevenue,
      email: mapped.email,
      phone: mapped.phone,
      website: mapped.website,
      linkedIn: mapped.linkedIn,
      twitter: mapped.twitter,
      githubOrg: mapped.githubOrg,
      description: mapped.description,
      address: mapped.address,
      city: mapped.city,
      state: mapped.state,
      country: mapped.country,
      customFields: collectCustomFields(row, fieldMap),
    });
  }

  return companies;
}

export function parseDeals(
  rows: Record<string, string>[],
  format: CrmFormat,
  _orgId: string,
): ParsedDeal[] {
  const fieldMap =
    format === 'hubspot' ? HUBSPOT_DEAL_MAP : SALESFORCE_DEAL_MAP;
  const deals: ParsedDeal[] = [];

  for (const row of rows) {
    const mapped = mapRow(row, fieldMap);

    deals.push({
      title: mapped.title || '',
      stage: mapped.stage,
      value: mapped.value ? parseFloat(mapped.value.replace(/[^0-9.-]/g, '')) : undefined,
      expectedCloseDate: mapped.expectedCloseDate,
      companyName: mapped.companyName,
      pipeline: mapped.pipeline,
      description: mapped.description,
      customFields: collectCustomFields(row, fieldMap),
    });
  }

  return deals;
}

// ---------------------------------------------------------------------------
// Company size normalization
// ---------------------------------------------------------------------------

function normalizeCompanySize(sizeStr: string): CompanySize | null {
  const s = sizeStr.toLowerCase().trim();
  if (s.includes('startup') || s === '1-10' || s === '1-50') return 'STARTUP';
  if (s.includes('small') || s === '11-50' || s === '51-200') return 'SMALL';
  if (s.includes('medium') || s === '201-500') return 'MEDIUM';
  if (s.includes('large') || s === '201-1000' || s === '501-1000') return 'LARGE';
  if (
    s.includes('enterprise') ||
    s === '1000+' ||
    s === '1001+' ||
    s === '5000+' ||
    s === '10000+'
  )
    return 'ENTERPRISE';

  const num = parseInt(s.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(num)) {
    if (num <= 10) return 'STARTUP';
    if (num <= 50) return 'SMALL';
    if (num <= 500) return 'MEDIUM';
    if (num <= 1000) return 'LARGE';
    return 'ENTERPRISE';
  }
  return null;
}

/** Extract domain from a URL or website string */
function extractDomain(website: string): string | null {
  try {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;
const MAX_ROWS = 10_000;

/**
 * Find or create the import tracking tag
 */
async function getOrCreateImportTag(
  orgId: string,
  format: CrmFormat,
): Promise<string> {
  const tagName =
    format === 'hubspot' ? '__hubspot_import' : '__salesforce_import';

  const existing = await prisma.tag.findUnique({
    where: { organizationId_name: { organizationId: orgId, name: tagName } },
  });

  if (existing) return existing.id;

  const tag = await prisma.tag.create({
    data: {
      organizationId: orgId,
      name: tagName,
      color: format === 'hubspot' ? '#ff7a59' : '#00a1e0',
    },
  });

  return tag.id;
}

/**
 * Look up or create a company by name/domain within the org
 */
async function findOrCreateCompany(
  orgId: string,
  companyName: string,
): Promise<string | null> {
  if (!companyName) return null;

  // Try exact name match first (case-insensitive)
  const existing = await prisma.company.findFirst({
    where: {
      organizationId: orgId,
      name: { equals: companyName, mode: 'insensitive' },
    },
    select: { id: true },
  });

  if (existing) return existing.id;

  // Create a new company
  const company = await prisma.company.create({
    data: {
      organizationId: orgId,
      name: companyName,
    },
  });

  return company.id;
}

// ---------------------------------------------------------------------------
// Import Contacts
// ---------------------------------------------------------------------------

export async function importContacts(
  orgId: string,
  contacts: ParsedContact[],
  format: CrmFormat,
  userId?: string,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (contacts.length > MAX_ROWS) {
    result.errors.push(`CSV exceeds the maximum of ${MAX_ROWS} rows (got ${contacts.length})`);
    return result;
  }

  const tagId = await getOrCreateImportTag(orgId, format);

  // Process in batches
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const rowNum = i + j + 2; // +2 for 1-indexed + header
      const contact = batch[j];

      try {
        // Skip if missing required fields
        if (!contact.firstName && !contact.lastName) {
          result.errors.push(`Row ${rowNum}: Missing first name and last name`);
          result.skipped++;
          continue;
        }

        if (!contact.email) {
          result.errors.push(`Row ${rowNum}: Missing email address`);
          result.skipped++;
          continue;
        }

        // Look up company
        let companyId: string | null = null;
        if (contact.companyName) {
          companyId = await findOrCreateCompany(orgId, contact.companyName);
        }

        // Build custom fields
        const customFields: Record<string, unknown> = {
          ...(contact.customFields || {}),
        };
        if (contact.lifecycleStage) {
          customFields.lifecycleStage = contact.lifecycleStage;
        }
        if (contact.leadStatus) {
          customFields.leadStatus = contact.leadStatus;
        }
        if (contact.leadSource) {
          customFields.leadSource = contact.leadSource;
        }

        const customFieldsJson =
          Object.keys(customFields).length > 0
            ? (customFields as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull;

        // Check for existing contact by email (upsert)
        const existing = await prisma.contact.findFirst({
          where: { organizationId: orgId, email: contact.email },
        });

        if (existing) {
          // Update existing contact with new data (non-destructive: only fill in blanks)
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              firstName: existing.firstName || contact.firstName,
              lastName: existing.lastName || contact.lastName,
              phone: existing.phone || contact.phone || null,
              title: existing.title || contact.title || null,
              companyId: existing.companyId || companyId,
              linkedIn: existing.linkedIn || contact.linkedIn || null,
              twitter: existing.twitter || contact.twitter || null,
              github: existing.github || contact.github || null,
              notes: existing.notes || contact.notes || null,
              address: existing.address || contact.address || null,
              city: existing.city || contact.city || null,
              state: existing.state || contact.state || null,
              country: existing.country || contact.country || null,
              customFields: customFieldsJson,
            },
          });

          // Ensure tag
          await prisma.contactTag
            .create({
              data: { contactId: existing.id, tagId },
            })
            .catch(() => {
              /* already exists */
            });

          result.updated++;
        } else {
          // Create new contact
          const newContact = await prisma.contact.create({
            data: {
              organizationId: orgId,
              firstName: contact.firstName || '',
              lastName: contact.lastName || '',
              email: contact.email,
              phone: contact.phone || null,
              title: contact.title || null,
              companyId,
              linkedIn: contact.linkedIn || null,
              twitter: contact.twitter || null,
              github: contact.github || null,
              notes: contact.notes || null,
              address: contact.address || null,
              city: contact.city || null,
              state: contact.state || null,
              country: contact.country || null,
              customFields: customFieldsJson,
            },
          });

          // Tag the contact
          await prisma.contactTag
            .create({
              data: { contactId: newContact.id, tagId },
            })
            .catch(() => {
              /* already exists */
            });

          result.created++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Row ${rowNum}: ${message}`);
        result.skipped++;
        logger.warn(`CRM contact import row ${rowNum} failed: ${message}`);
      }
    }
  }

  // Audit log
  logAudit({
    organizationId: orgId,
    userId,
    action: 'crm_import',
    entityType: 'contact',
    entityName: `${format} contact import`,
    metadata: {
      format,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errors.length,
    } as unknown as Record<string, unknown>,
  });

  logger.info(
    `CRM contact import (${format}) complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Import Companies
// ---------------------------------------------------------------------------

export async function importCompanies(
  orgId: string,
  companies: ParsedCompany[],
  format: CrmFormat,
  userId?: string,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (companies.length > MAX_ROWS) {
    result.errors.push(`CSV exceeds the maximum of ${MAX_ROWS} rows (got ${companies.length})`);
    return result;
  }

  const tagId = await getOrCreateImportTag(orgId, format);

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const rowNum = i + j + 2;
      const company = batch[j];

      try {
        if (!company.name) {
          result.errors.push(`Row ${rowNum}: Missing company name`);
          result.skipped++;
          continue;
        }

        // Extract domain from website if not provided
        let domain = company.domain;
        if (!domain && company.website) {
          domain = extractDomain(company.website) || undefined;
        }

        // Normalize company size
        const normalizedSize = company.size
          ? normalizeCompanySize(company.size)
          : null;

        // Build custom fields
        const customFields: Record<string, unknown> = {
          ...(company.customFields || {}),
        };
        if (company.annualRevenue) {
          customFields.annualRevenue = company.annualRevenue;
        }

        const customFieldsJson =
          Object.keys(customFields).length > 0
            ? (customFields as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull;

        // Check for existing company by domain or name (upsert)
        let existing = null;
        if (domain) {
          existing = await prisma.company.findFirst({
            where: { organizationId: orgId, domain },
          });
        }
        if (!existing) {
          existing = await prisma.company.findFirst({
            where: {
              organizationId: orgId,
              name: { equals: company.name, mode: 'insensitive' },
            },
          });
        }

        if (existing) {
          // Update existing company (non-destructive)
          await prisma.company.update({
            where: { id: existing.id },
            data: {
              domain: existing.domain || domain || null,
              industry: existing.industry || company.industry || null,
              size: existing.size || normalizedSize,
              website: existing.website || company.website || null,
              email: existing.email || company.email || null,
              phone: existing.phone || company.phone || null,
              linkedIn: existing.linkedIn || company.linkedIn || null,
              twitter: existing.twitter || company.twitter || null,
              githubOrg: existing.githubOrg || company.githubOrg || null,
              description: existing.description || company.description || null,
              address: existing.address || company.address || null,
              city: existing.city || company.city || null,
              state: existing.state || company.state || null,
              country: existing.country || company.country || null,
              customFields: customFieldsJson,
            },
          });

          await prisma.companyTag
            .create({
              data: { companyId: existing.id, tagId },
            })
            .catch(() => {});

          result.updated++;
        } else {
          const newCompany = await prisma.company.create({
            data: {
              organizationId: orgId,
              name: company.name,
              domain: domain || null,
              industry: company.industry || null,
              size: normalizedSize,
              website: company.website || null,
              email: company.email || null,
              phone: company.phone || null,
              linkedIn: company.linkedIn || null,
              twitter: company.twitter || null,
              githubOrg: company.githubOrg || null,
              description: company.description || null,
              address: company.address || null,
              city: company.city || null,
              state: company.state || null,
              country: company.country || null,
              customFields: customFieldsJson,
            },
          });

          await prisma.companyTag
            .create({
              data: { companyId: newCompany.id, tagId },
            })
            .catch(() => {});

          result.created++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Row ${rowNum}: ${message}`);
        result.skipped++;
        logger.warn(`CRM company import row ${rowNum} failed: ${message}`);
      }
    }
  }

  logAudit({
    organizationId: orgId,
    userId,
    action: 'crm_import',
    entityType: 'company',
    entityName: `${format} company import`,
    metadata: {
      format,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errors.length,
    } as unknown as Record<string, unknown>,
  });

  logger.info(
    `CRM company import (${format}) complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Import Deals
// ---------------------------------------------------------------------------

export async function importDeals(
  orgId: string,
  deals: ParsedDeal[],
  format: CrmFormat,
  userId?: string,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (deals.length > MAX_ROWS) {
    result.errors.push(`CSV exceeds the maximum of ${MAX_ROWS} rows (got ${deals.length})`);
    return result;
  }

  const tagId = await getOrCreateImportTag(orgId, format);

  for (let i = 0; i < deals.length; i += BATCH_SIZE) {
    const batch = deals.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const rowNum = i + j + 2;
      const deal = batch[j];

      try {
        if (!deal.title) {
          result.errors.push(`Row ${rowNum}: Missing deal title`);
          result.skipped++;
          continue;
        }

        // Look up company
        let companyId: string | null = null;
        if (deal.companyName) {
          companyId = await findOrCreateCompany(orgId, deal.companyName);
        }

        // Map stage
        const stage = deal.stage
          ? mapDealStage(deal.stage, format)
          : DealStage.IDENTIFIED;

        // Parse expected close date
        let expectedCloseDate: Date | null = null;
        if (deal.expectedCloseDate) {
          const parsed = new Date(deal.expectedCloseDate);
          if (!isNaN(parsed.getTime())) {
            expectedCloseDate = parsed;
          }
        }

        // Build custom fields
        const customFields: Record<string, unknown> = {
          ...(deal.customFields || {}),
        };
        if (deal.pipeline) {
          customFields.pipeline = deal.pipeline;
        }

        const customFieldsJson =
          Object.keys(customFields).length > 0
            ? (customFields as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull;

        // Check for existing deal by title + company (soft dedup)
        const existing = await prisma.deal.findFirst({
          where: {
            organizationId: orgId,
            title: { equals: deal.title, mode: 'insensitive' },
            ...(companyId ? { companyId } : {}),
          },
        });

        if (existing) {
          // Update existing deal
          await prisma.deal.update({
            where: { id: existing.id },
            data: {
              stage: existing.stage === DealStage.ANONYMOUS_USAGE ? stage : existing.stage,
              amount: existing.amount ?? deal.value ?? null,
              companyId: existing.companyId || companyId,
              expectedCloseDate: existing.expectedCloseDate || expectedCloseDate,
              description: existing.description || deal.description || null,
              customFields: customFieldsJson,
            },
          });

          await prisma.dealTag
            .create({
              data: { dealId: existing.id, tagId },
            })
            .catch(() => {});

          result.updated++;
        } else {
          const newDeal = await prisma.deal.create({
            data: {
              organizationId: orgId,
              title: deal.title,
              stage,
              amount: deal.value ?? null,
              companyId,
              expectedCloseDate,
              description: deal.description || null,
              customFields: customFieldsJson,
            },
          });

          await prisma.dealTag
            .create({
              data: { dealId: newDeal.id, tagId },
            })
            .catch(() => {});

          result.created++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Row ${rowNum}: ${message}`);
        result.skipped++;
        logger.warn(`CRM deal import row ${rowNum} failed: ${message}`);
      }
    }
  }

  logAudit({
    organizationId: orgId,
    userId,
    action: 'crm_import',
    entityType: 'deal',
    entityName: `${format} deal import`,
    metadata: {
      format,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      errorCount: result.errors.length,
    } as unknown as Record<string, unknown>,
  });

  logger.info(
    `CRM deal import (${format}) complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Full CSV import pipeline (parse + import in one call)
// ---------------------------------------------------------------------------

export async function importContactsCsv(
  orgId: string,
  csvContent: string,
  format: CrmFormat,
  userId?: string,
): Promise<ImportResult> {
  const { rows } = parseCSV(csvContent);
  const parsed = parseContacts(rows, format, orgId);
  return importContacts(orgId, parsed, format, userId);
}

export async function importCompaniesCsv(
  orgId: string,
  csvContent: string,
  format: CrmFormat,
  userId?: string,
): Promise<ImportResult> {
  const { rows } = parseCSV(csvContent);
  const parsed = parseCompanies(rows, format, orgId);
  return importCompanies(orgId, parsed, format, userId);
}

export async function importDealsCsv(
  orgId: string,
  csvContent: string,
  format: CrmFormat,
  userId?: string,
): Promise<ImportResult> {
  const { rows } = parseCSV(csvContent);
  const parsed = parseDeals(rows, format, orgId);
  return importDeals(orgId, parsed, format, userId);
}
