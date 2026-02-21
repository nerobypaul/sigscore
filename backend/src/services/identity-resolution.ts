/**
 * Identity Resolution Engine
 *
 * The core technical moat of Sigscore. Maps anonymous GitHub stars, npm downloads,
 * and other signals to unified contact + company profiles. Turns noise into pipeline.
 *
 * Resolution chain (priority order):
 * 1. Exact email match
 * 2. Email domain -> company (skip free providers)
 * 3. GitHub profile company field
 * 4. GitHub organization membership
 * 5. GitHub email from commits
 * 6. npm maintainer email -> domain -> company
 * 7. Reverse DNS on company domain
 * 8. Fuzzy company name matching
 */

import { Prisma, IdentityType, CompanySize } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { notifyOrgUsers } from './notifications';

// ---------------------------------------------------------------------------
// Free email provider list (50+ domains to skip during domain -> company)
// ---------------------------------------------------------------------------

const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'yahoo.co.jp',
  'yahoo.fr',
  'yahoo.de',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'outlook.com',
  'outlook.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'protonmail.com',
  'protonmail.ch',
  'proton.me',
  'pm.me',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'mail.com',
  'zoho.com',
  'zohomail.com',
  'fastmail.com',
  'fastmail.fm',
  'hey.com',
  'tutanota.com',
  'tutanota.de',
  'tuta.io',
  'gmx.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'inbox.com',
  'rediffmail.com',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'naver.com',
  'daum.net',
  'hanmail.net',
  'rocketmail.com',
  'att.net',
  'sbcglobal.net',
  'comcast.net',
  'verizon.net',
  'cox.net',
  'charter.net',
  'earthlink.net',
  'optonline.net',
  'frontier.com',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  'sharklasers.com',
  'guerrillamailblock.com',
  'grr.la',
  'dispostable.com',
  'yopmail.com',
]);

// ---------------------------------------------------------------------------
// Confidence score constants
// ---------------------------------------------------------------------------

export const CONFIDENCE = {
  EXACT_EMAIL: 1.0,
  GITHUB_IDENTITY: 0.95,
  NPM_IDENTITY: 0.95,
  GITHUB_COMPANY_FIELD: 0.9,
  GITHUB_ORG_MEMBERSHIP: 0.85,
  EMAIL_DOMAIN: 0.8,
  GITHUB_COMMIT_EMAIL: 0.75,
  NPM_MAINTAINER_EMAIL: 0.75,
  REVERSE_DNS: 0.6,
  FUZZY_COMPANY_NAME: 0.5,
  AUTO_MERGE_THRESHOLD: 0.8,
} as const;

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface IdentitySignal {
  email?: string;
  githubUsername?: string;
  npmUsername?: string;
  companyName?: string;
  companyDomain?: string;
  githubOrg?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

export interface ResolvedIdentity {
  contactId: string | null;
  companyId: string | null;
  confidence: number;
  source: string;
  isNew: boolean;
  identitiesCreated: number;
}

export interface DuplicateGroup {
  primaryContactId: string;
  primaryName: string;
  primaryEmail: string | null;
  duplicates: Array<{
    contactId: string;
    name: string;
    email: string | null;
    sharedIdentities: Array<{
      type: string;
      value: string;
      confidence: number;
    }>;
    overallConfidence: number;
  }>;
}

export interface IdentityGraphNode {
  type: IdentityType;
  value: string;
  verified: boolean;
  confidence: number;
  createdAt: string;
}

export interface IdentityGraph {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  company: { id: string; name: string; domain: string | null } | null;
  identities: IdentityGraphNode[];
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Extracts a company domain from an email, returning null for free providers.
 */
export function extractCompanyDomain(email: string): string | null {
  const parts = email.toLowerCase().trim().split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1];
  if (FREE_EMAIL_PROVIDERS.has(domain)) return null;
  return domain;
}

/**
 * Checks if a given email domain is a free email provider.
 */
export function isFreeEmailProvider(domain: string): boolean {
  return FREE_EMAIL_PROVIDERS.has(domain.toLowerCase().trim());
}

/**
 * Normalizes a company name for fuzzy matching.
 * Strips common suffixes (Inc, LLC, Ltd, etc.), punctuation, and lowercases.
 * Also handles GitHub-style "@stripe" prefix.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^@/, '') // GitHub-style @company prefix
    .replace(
      /\b(inc\.?|incorporated|llc|ltd\.?|limited|co\.?|corp\.?|corporation|gmbh|s\.?a\.?|plc|pty\.?|pvt\.?)\b/gi,
      '',
    )
    .replace(/[.,\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculates similarity between two normalized company names.
 * Returns 0-1 score.
 */
function companyNameSimilarity(a: string, b: string): number {
  const normA = normalizeCompanyName(a);
  const normB = normalizeCompanyName(b);

  if (normA === normB) return 1.0;

  // Check if one contains the other
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  // Simple token overlap (Jaccard)
  const tokensA = new Set(normA.split(' ').filter(Boolean));
  const tokensB = new Set(normB.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Estimates company size from GitHub org public member count.
 */
function estimateCompanySize(memberCount: number): CompanySize {
  if (memberCount <= 10) return 'STARTUP';
  if (memberCount <= 50) return 'SMALL';
  if (memberCount <= 200) return 'MEDIUM';
  if (memberCount <= 1000) return 'LARGE';
  return 'ENTERPRISE';
}

/**
 * Capitalizes the first letter of each word (for company name from domain).
 */
function domainToCompanyName(domain: string): string {
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---------------------------------------------------------------------------
// Core Resolution Engine
// ---------------------------------------------------------------------------

/**
 * Main identity resolution method. Given partial identity data from signals,
 * resolves to an existing or newly created Contact + Company.
 *
 * This is the primary entry point used by signal ingest, connectors, etc.
 */
export async function resolveIdentity(
  organizationId: string,
  signals: IdentitySignal,
): Promise<ResolvedIdentity> {
  let contactId: string | null = null;
  let companyId: string | null = null;
  let confidence = 0;
  let source = 'none';
  let isNew = false;
  let identitiesCreated = 0;

  // Step 1: Try exact email match
  if (signals.email) {
    const existingContact = await prisma.contact.findFirst({
      where: { organizationId, email: signals.email.toLowerCase().trim() },
      select: { id: true, companyId: true },
    });
    if (existingContact) {
      contactId = existingContact.id;
      companyId = existingContact.companyId;
      confidence = CONFIDENCE.EXACT_EMAIL;
      source = 'exact_email';
    }
  }

  // Step 2: Try identity lookup by GitHub username
  if (!contactId && signals.githubUsername) {
    const identity = await prisma.contactIdentity.findUnique({
      where: {
        type_value: {
          type: 'GITHUB',
          value: signals.githubUsername.toLowerCase(),
        },
      },
      include: {
        contact: {
          select: { id: true, companyId: true, organizationId: true },
        },
      },
    });
    if (identity && identity.contact.organizationId === organizationId) {
      contactId = identity.contact.id;
      companyId = identity.contact.companyId;
      confidence = CONFIDENCE.GITHUB_IDENTITY;
      source = 'github_identity';
    }
  }

  // Step 2b: Also try Contact.github field (legacy data)
  if (!contactId && signals.githubUsername) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, github: signals.githubUsername },
      select: { id: true, companyId: true },
    });
    if (contact) {
      contactId = contact.id;
      companyId = contact.companyId;
      confidence = CONFIDENCE.GITHUB_IDENTITY;
      source = 'github_field';
    }
  }

  // Step 3: Try identity lookup by npm username
  if (!contactId && signals.npmUsername) {
    const identity = await prisma.contactIdentity.findUnique({
      where: {
        type_value: {
          type: 'NPM',
          value: signals.npmUsername.toLowerCase(),
        },
      },
      include: {
        contact: {
          select: { id: true, companyId: true, organizationId: true },
        },
      },
    });
    if (identity && identity.contact.organizationId === organizationId) {
      contactId = identity.contact.id;
      companyId = identity.contact.companyId;
      confidence = CONFIDENCE.NPM_IDENTITY;
      source = 'npm_identity';
    }
  }

  // Step 4: Try email identity lookup
  if (!contactId && signals.email) {
    const identity = await prisma.contactIdentity.findUnique({
      where: {
        type_value: {
          type: 'EMAIL',
          value: signals.email.toLowerCase().trim(),
        },
      },
      include: {
        contact: {
          select: { id: true, companyId: true, organizationId: true },
        },
      },
    });
    if (identity && identity.contact.organizationId === organizationId) {
      contactId = identity.contact.id;
      companyId = identity.contact.companyId;
      confidence = CONFIDENCE.EXACT_EMAIL;
      source = 'email_identity';
    }
  }

  // --- Company Resolution (when we have a contact but no company, or no contact at all) ---

  // Step 5: Email domain -> Company
  if (!companyId && signals.email) {
    const domain = extractCompanyDomain(signals.email);
    if (domain) {
      const company = await findOrCreateCompanyByDomain(organizationId, domain);
      if (company) {
        companyId = company.id;
        if (!confidence || confidence < CONFIDENCE.EMAIL_DOMAIN) {
          confidence = CONFIDENCE.EMAIL_DOMAIN;
          source = 'email_domain';
        }
      }
    }
  }

  // Step 6: Company domain from signal data
  if (!companyId && signals.companyDomain) {
    const company = await findOrCreateCompanyByDomain(
      organizationId,
      signals.companyDomain,
    );
    if (company) {
      companyId = company.id;
      if (!confidence || confidence < CONFIDENCE.EMAIL_DOMAIN) {
        confidence = CONFIDENCE.EMAIL_DOMAIN;
        source = 'company_domain';
      }
    }
  }

  // Step 7: GitHub org -> Company
  if (!companyId && signals.githubOrg) {
    const company = await prisma.company.findFirst({
      where: { organizationId, githubOrg: signals.githubOrg },
      select: { id: true },
    });
    if (company) {
      companyId = company.id;
      if (!confidence || confidence < CONFIDENCE.GITHUB_ORG_MEMBERSHIP) {
        confidence = CONFIDENCE.GITHUB_ORG_MEMBERSHIP;
        source = 'github_org';
      }
    }
  }

  // Step 8: Company name fuzzy match
  if (!companyId && signals.companyName) {
    const resolvedCompany = await resolveCompanyByName(
      organizationId,
      signals.companyName,
    );
    if (resolvedCompany) {
      companyId = resolvedCompany.id;
      if (!confidence || confidence < CONFIDENCE.FUZZY_COMPANY_NAME) {
        confidence = CONFIDENCE.FUZZY_COMPANY_NAME;
        source = 'fuzzy_company_name';
      }
    }
  }

  // --- Contact Creation (if no existing contact found) ---

  if (!contactId && hasEnoughForContact(signals)) {
    const newContact = await prisma.contact.create({
      data: {
        organizationId,
        firstName: signals.firstName || signals.githubUsername || signals.npmUsername || 'Unknown',
        lastName: signals.lastName || '',
        email: signals.email?.toLowerCase().trim() || null,
        github: signals.githubUsername || null,
        avatar: signals.avatar || null,
        companyId: companyId || null,
      },
    });
    contactId = newContact.id;
    isNew = true;
    if (!confidence) {
      confidence = CONFIDENCE.EMAIL_DOMAIN;
      source = 'new_contact';
    }

    logger.info('Identity resolution: created new contact', {
      contactId: newContact.id,
      organizationId,
      source,
    });
  }

  // --- Link contact to company if resolved separately ---

  if (contactId && companyId) {
    const existingContact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { companyId: true },
    });
    if (existingContact && !existingContact.companyId) {
      await prisma.contact.update({
        where: { id: contactId },
        data: { companyId },
      });
    }
  }

  // --- Store identity records ---

  if (contactId) {
    identitiesCreated = await storeIdentities(contactId, signals);
  }

  return { contactId, companyId, confidence, source, isNew, identitiesCreated };
}

/**
 * Determines if we have enough identity data to justify creating a new contact.
 */
function hasEnoughForContact(signals: IdentitySignal): boolean {
  return !!(signals.email || signals.githubUsername || signals.npmUsername);
}

/**
 * Stores identity records for a contact, skipping duplicates gracefully.
 */
async function storeIdentities(
  contactId: string,
  signals: IdentitySignal,
): Promise<number> {
  let count = 0;

  const identities: Array<{
    type: IdentityType;
    value: string;
    confidence: number;
  }> = [];

  if (signals.email) {
    identities.push({
      type: 'EMAIL',
      value: signals.email.toLowerCase().trim(),
      confidence: CONFIDENCE.EXACT_EMAIL,
    });
  }
  if (signals.githubUsername) {
    identities.push({
      type: 'GITHUB',
      value: signals.githubUsername.toLowerCase(),
      confidence: CONFIDENCE.GITHUB_IDENTITY,
    });
  }
  if (signals.npmUsername) {
    identities.push({
      type: 'NPM',
      value: signals.npmUsername.toLowerCase(),
      confidence: CONFIDENCE.NPM_IDENTITY,
    });
  }
  if (signals.companyDomain) {
    identities.push({
      type: 'DOMAIN',
      value: signals.companyDomain.toLowerCase(),
      confidence: CONFIDENCE.EMAIL_DOMAIN,
    });
  }

  for (const identity of identities) {
    try {
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: identity.type, value: identity.value },
        },
        update: {
          confidence: Math.max(identity.confidence, 0),
        },
        create: {
          contactId,
          type: identity.type,
          value: identity.value,
          confidence: identity.confidence,
          verified: identity.confidence >= CONFIDENCE.GITHUB_IDENTITY,
        },
      });
      count++;
    } catch (err) {
      // Unique constraint violation is fine (identity already belongs to another contact)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        logger.debug('Identity already exists for another contact', {
          type: identity.type,
          value: identity.value,
          contactId,
        });
      } else {
        logger.warn('Failed to store identity', {
          type: identity.type,
          value: identity.value,
          contactId,
          error: err,
        });
      }
    }
  }

  return count;
}

// ---------------------------------------------------------------------------
// Company Resolution
// ---------------------------------------------------------------------------

/**
 * Find existing company by domain or create a new one.
 */
async function findOrCreateCompanyByDomain(
  organizationId: string,
  domain: string,
): Promise<{ id: string } | null> {
  const normalizedDomain = domain.toLowerCase().trim();
  if (isFreeEmailProvider(normalizedDomain)) return null;

  // Try to find existing
  const existing = await prisma.company.findFirst({
    where: { organizationId, domain: normalizedDomain },
    select: { id: true },
  });
  if (existing) return existing;

  // Auto-create company from domain
  try {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: domainToCompanyName(normalizedDomain),
        domain: normalizedDomain,
        website: `https://${normalizedDomain}`,
        customFields: {
          enrichmentSource: 'identity_resolution',
          enrichedAt: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    logger.info('Identity resolution: auto-created company from domain', {
      companyId: company.id,
      domain: normalizedDomain,
      organizationId,
    });

    return company;
  } catch (err) {
    // Might race with another request creating the same company
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const retried = await prisma.company.findFirst({
        where: { organizationId, domain: normalizedDomain },
        select: { id: true },
      });
      return retried;
    }
    logger.warn('Failed to auto-create company', { domain: normalizedDomain, error: err });
    return null;
  }
}

/**
 * Resolve company by name using fuzzy matching against existing companies.
 */
async function resolveCompanyByName(
  organizationId: string,
  companyName: string,
): Promise<{ id: string } | null> {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized || normalized.length < 2) return null;

  // First try exact normalized match
  const companies = await prisma.company.findMany({
    where: { organizationId },
    select: { id: true, name: true, githubOrg: true },
    take: 500, // reasonable limit for fuzzy matching
  });

  let bestMatch: { id: string } | null = null;
  let bestScore = 0;

  for (const company of companies) {
    // Check against company name
    const nameScore = companyNameSimilarity(companyName, company.name);
    if (nameScore > bestScore) {
      bestScore = nameScore;
      bestMatch = { id: company.id };
    }

    // Check against GitHub org name
    if (company.githubOrg) {
      const orgScore = companyNameSimilarity(companyName, company.githubOrg);
      if (orgScore > bestScore) {
        bestScore = orgScore;
        bestMatch = { id: company.id };
      }
    }
  }

  // Only return if similarity is above threshold
  return bestScore >= 0.7 ? bestMatch : null;
}

// ---------------------------------------------------------------------------
// Contact Merge
// ---------------------------------------------------------------------------

/**
 * Merges duplicate contacts by reassigning all related records (signals,
 * activities, deals, identities, tags) from duplicate contacts to the primary.
 * Then deletes the duplicate contacts.
 */
export async function mergeContacts(
  organizationId: string,
  primaryId: string,
  duplicateIds: string[],
): Promise<{ merged: number; errors: string[] }> {
  // Verify all contacts belong to this organization
  const allIds = [primaryId, ...duplicateIds];
  const contacts = await prisma.contact.findMany({
    where: { id: { in: allIds }, organizationId },
    select: { id: true },
  });

  const foundIds = new Set(contacts.map((c) => c.id));
  for (const id of allIds) {
    if (!foundIds.has(id)) {
      throw new AppError(`Contact ${id} not found in organization`, 404);
    }
  }

  if (duplicateIds.includes(primaryId)) {
    throw new AppError('Primary contact ID must not be in the duplicates list', 400);
  }

  let merged = 0;
  const errors: string[] = [];

  for (const duplicateId of duplicateIds) {
    try {
      await prisma.$transaction(async (tx) => {
        // Reassign signals
        await tx.signal.updateMany({
          where: { actorId: duplicateId },
          data: { actorId: primaryId },
        });

        // Reassign activities
        await tx.activity.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        });

        // Reassign deals
        await tx.deal.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        });

        // Move identities (skip conflicts)
        const dupeIdentities = await tx.contactIdentity.findMany({
          where: { contactId: duplicateId },
        });
        for (const identity of dupeIdentities) {
          try {
            await tx.contactIdentity.update({
              where: { id: identity.id },
              data: { contactId: primaryId },
            });
          } catch {
            // Identity with same type+value already exists on primary; delete the duplicate's copy
            await tx.contactIdentity.delete({ where: { id: identity.id } });
          }
        }

        // Move tags (skip conflicts)
        const dupeTags = await tx.contactTag.findMany({
          where: { contactId: duplicateId },
        });
        for (const tag of dupeTags) {
          const exists = await tx.contactTag.findUnique({
            where: {
              contactId_tagId: { contactId: primaryId, tagId: tag.tagId },
            },
          });
          if (!exists) {
            await tx.contactTag.create({
              data: { contactId: primaryId, tagId: tag.tagId },
            });
          }
        }

        // Move email enrollments
        await tx.emailEnrollment.updateMany({
          where: { contactId: duplicateId },
          data: { contactId: primaryId },
        });

        // Merge contact data: fill in any empty fields on primary from duplicate
        const primary = await tx.contact.findUnique({ where: { id: primaryId } });
        const duplicate = await tx.contact.findUnique({ where: { id: duplicateId } });

        if (primary && duplicate) {
          const updates: Record<string, string | null> = {};
          const mergeField = (field: keyof typeof primary) => {
            const primaryVal = primary[field];
            const dupeVal = duplicate[field];
            if (!primaryVal && dupeVal && typeof dupeVal === 'string') {
              updates[field] = dupeVal;
            }
          };

          mergeField('email');
          mergeField('phone');
          mergeField('mobile');
          mergeField('title');
          mergeField('linkedIn');
          mergeField('twitter');
          mergeField('github');
          mergeField('avatar');
          mergeField('address');
          mergeField('city');
          mergeField('state');
          mergeField('country');

          if (Object.keys(updates).length > 0) {
            await tx.contact.update({
              where: { id: primaryId },
              data: updates,
            });
          }

          // Link to company if primary has none
          if (!primary.companyId && duplicate.companyId) {
            await tx.contact.update({
              where: { id: primaryId },
              data: { companyId: duplicate.companyId },
            });
          }
        }

        // Delete the duplicate contact
        await tx.contact.delete({ where: { id: duplicateId } });
      });

      merged++;
      logger.info('Merged duplicate contact', {
        primaryId,
        duplicateId,
        organizationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown merge error';
      errors.push(`${duplicateId}: ${message}`);
      logger.error('Failed to merge contact', {
        primaryId,
        duplicateId,
        organizationId,
        error: err,
      });
    }
  }

  return { merged, errors };
}

// ---------------------------------------------------------------------------
// Duplicate Detection
// ---------------------------------------------------------------------------

/**
 * Scans for likely duplicate contacts within an organization based on
 * shared email addresses, identity records, and name similarity.
 */
export async function findDuplicates(
  organizationId: string,
): Promise<DuplicateGroup[]> {
  const groups: DuplicateGroup[] = [];

  // Strategy 1: Contacts that share the same email
  const emailDupes = await prisma.$queryRaw<
    Array<{ email: string; ids: string; count: bigint }>
  >`
    SELECT email, string_agg(id, ',') as ids, count(*) as count
    FROM contacts
    WHERE "organizationId" = ${organizationId}
      AND email IS NOT NULL
      AND email != ''
    GROUP BY email
    HAVING count(*) > 1
    LIMIT 50
  `;

  for (const dupe of emailDupes) {
    const contactIds = dupe.ids.split(',');
    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    if (contacts.length > 1) {
      const primary = contacts[0];
      groups.push({
        primaryContactId: primary.id,
        primaryName: `${primary.firstName} ${primary.lastName}`.trim(),
        primaryEmail: primary.email,
        duplicates: contacts.slice(1).map((c) => ({
          contactId: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email,
          sharedIdentities: [
            {
              type: 'EMAIL',
              value: dupe.email,
              confidence: CONFIDENCE.EXACT_EMAIL,
            },
          ],
          overallConfidence: CONFIDENCE.EXACT_EMAIL,
        })),
      });
    }
  }

  // Strategy 2: Contacts that share identity records (same GitHub, npm, etc.)
  const identityDupes = await prisma.$queryRaw<
    Array<{
      type: string;
      value: string;
      contact_ids: string;
      count: bigint;
    }>
  >`
    SELECT ci.type, ci.value, string_agg(ci."contactId", ',') as contact_ids, count(*) as count
    FROM contact_identities ci
    INNER JOIN contacts c ON c.id = ci."contactId"
    WHERE c."organizationId" = ${organizationId}
    GROUP BY ci.type, ci.value
    HAVING count(*) > 1
    LIMIT 50
  `;

  const seenPairs = new Set<string>();

  for (const dupe of identityDupes) {
    const contactIds = dupe.contact_ids.split(',');
    const pairKey = contactIds.sort().join(':');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    // Skip if already covered by email duplication
    if (
      groups.some(
        (g) =>
          contactIds.includes(g.primaryContactId) &&
          g.duplicates.some((d) => contactIds.includes(d.contactId)),
      )
    ) {
      continue;
    }

    const contacts = await prisma.contact.findMany({
      where: { id: { in: contactIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { createdAt: 'asc' },
    });

    if (contacts.length > 1) {
      const primary = contacts[0];
      const confidenceForType =
        dupe.type === 'EMAIL'
          ? CONFIDENCE.EXACT_EMAIL
          : dupe.type === 'GITHUB'
            ? CONFIDENCE.GITHUB_IDENTITY
            : dupe.type === 'NPM'
              ? CONFIDENCE.NPM_IDENTITY
              : CONFIDENCE.FUZZY_COMPANY_NAME;

      groups.push({
        primaryContactId: primary.id,
        primaryName: `${primary.firstName} ${primary.lastName}`.trim(),
        primaryEmail: primary.email,
        duplicates: contacts.slice(1).map((c) => ({
          contactId: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          email: c.email,
          sharedIdentities: [
            {
              type: dupe.type,
              value: dupe.value,
              confidence: confidenceForType,
            },
          ],
          overallConfidence: confidenceForType,
        })),
      });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Identity Graph
// ---------------------------------------------------------------------------

/**
 * Returns the full identity graph for a contact: all linked identities,
 * their confidence scores, and the resolved company.
 */
export async function getIdentityGraph(
  organizationId: string,
  contactId: string,
): Promise<IdentityGraph> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    include: {
      company: { select: { id: true, name: true, domain: true } },
      identities: {
        orderBy: { confidence: 'desc' },
      },
    },
  });

  if (!contact) {
    throw new AppError('Contact not found', 404);
  }

  return {
    contactId: contact.id,
    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
    contactEmail: contact.email,
    company: contact.company,
    identities: contact.identities.map((i) => ({
      type: i.type,
      value: i.value,
      verified: i.verified,
      confidence: i.confidence,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Contact Enrichment
// ---------------------------------------------------------------------------

/**
 * Enriches a contact by pulling additional identity data from connected sources.
 * Attempts GitHub API lookups, npm profile lookups, and domain resolution.
 */
export async function enrichContact(
  organizationId: string,
  contactId: string,
): Promise<{
  identitiesAdded: number;
  companyResolved: boolean;
  enrichments: string[];
}> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    include: { identities: true, company: true },
  });

  if (!contact) {
    throw new AppError('Contact not found', 404);
  }

  let identitiesAdded = 0;
  let companyResolved = false;
  const enrichments: string[] = [];

  // Store email as identity if not already present
  if (contact.email) {
    const existingEmail = contact.identities.find(
      (i) => i.type === 'EMAIL' && i.value === contact.email?.toLowerCase(),
    );
    if (!existingEmail) {
      try {
        await prisma.contactIdentity.create({
          data: {
            contactId: contact.id,
            type: 'EMAIL',
            value: contact.email.toLowerCase(),
            confidence: CONFIDENCE.EXACT_EMAIL,
            verified: true,
          },
        });
        identitiesAdded++;
        enrichments.push(`Added email identity: ${contact.email}`);
      } catch {
        // Already exists, fine
      }
    }

    // Resolve company from email domain if no company assigned
    if (!contact.companyId) {
      const domain = extractCompanyDomain(contact.email);
      if (domain) {
        const company = await findOrCreateCompanyByDomain(organizationId, domain);
        if (company) {
          await prisma.contact.update({
            where: { id: contactId },
            data: { companyId: company.id },
          });
          companyResolved = true;
          enrichments.push(`Resolved company from email domain: ${domain}`);
        }
      }
    }
  }

  // Store GitHub username as identity if present on contact
  if (contact.github) {
    const existingGH = contact.identities.find(
      (i) => i.type === 'GITHUB' && i.value === contact.github?.toLowerCase(),
    );
    if (!existingGH) {
      try {
        await prisma.contactIdentity.create({
          data: {
            contactId: contact.id,
            type: 'GITHUB',
            value: contact.github.toLowerCase(),
            confidence: CONFIDENCE.GITHUB_IDENTITY,
            verified: true,
          },
        });
        identitiesAdded++;
        enrichments.push(`Added GitHub identity: ${contact.github}`);
      } catch {
        // Already exists
      }
    }

    // Try GitHub API for additional data (best-effort, public API)
    try {
      const ghResponse = await fetch(
        `https://api.github.com/users/${encodeURIComponent(contact.github)}`,
        {
          headers: { Accept: 'application/vnd.github.v3+json' },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (ghResponse.ok) {
        const ghData = (await ghResponse.json()) as Record<string, unknown>;

        // Extract company from GitHub profile
        if (ghData.company && !contact.companyId) {
          const ghCompany = String(ghData.company);
          const resolved = await resolveCompanyByName(organizationId, ghCompany);
          if (resolved) {
            await prisma.contact.update({
              where: { id: contactId },
              data: { companyId: resolved.id },
            });
            companyResolved = true;
            enrichments.push(`Resolved company from GitHub profile: ${ghCompany}`);
          }
        }

        // Fill in avatar if missing
        if (ghData.avatar_url && !contact.avatar) {
          await prisma.contact.update({
            where: { id: contactId },
            data: { avatar: String(ghData.avatar_url) },
          });
          enrichments.push('Added avatar from GitHub');
        }

        // Fill in name if missing
        if (ghData.name && contact.firstName === 'Unknown') {
          const nameParts = String(ghData.name).split(' ');
          await prisma.contact.update({
            where: { id: contactId },
            data: {
              firstName: nameParts[0] || contact.firstName,
              lastName: nameParts.slice(1).join(' ') || contact.lastName,
            },
          });
          enrichments.push(`Updated name from GitHub: ${ghData.name}`);
        }

        // Extract email from GitHub profile
        if (ghData.email && typeof ghData.email === 'string') {
          try {
            await prisma.contactIdentity.create({
              data: {
                contactId: contact.id,
                type: 'EMAIL',
                value: String(ghData.email).toLowerCase(),
                confidence: CONFIDENCE.GITHUB_COMMIT_EMAIL,
                verified: false,
              },
            });
            identitiesAdded++;
            enrichments.push(`Found email from GitHub: ${ghData.email}`);

            // Update contact email if not set
            if (!contact.email) {
              await prisma.contact.update({
                where: { id: contactId },
                data: { email: String(ghData.email).toLowerCase() },
              });
            }
          } catch {
            // Already exists
          }
        }

        // Extract Twitter/X handle
        if (ghData.twitter_username && !contact.twitter) {
          await prisma.contact.update({
            where: { id: contactId },
            data: { twitter: String(ghData.twitter_username) },
          });
          enrichments.push(
            `Added Twitter from GitHub: @${ghData.twitter_username}`,
          );
        }
      }
    } catch (err) {
      logger.debug('GitHub enrichment failed (non-critical)', {
        github: contact.github,
        error: err,
      });
    }
  }

  // Store LinkedIn as identity if present
  if (contact.linkedIn) {
    const existingLI = contact.identities.find((i) => i.type === 'LINKEDIN');
    if (!existingLI) {
      try {
        await prisma.contactIdentity.create({
          data: {
            contactId: contact.id,
            type: 'LINKEDIN',
            value: contact.linkedIn,
            confidence: CONFIDENCE.GITHUB_IDENTITY,
            verified: false,
          },
        });
        identitiesAdded++;
        enrichments.push(`Added LinkedIn identity: ${contact.linkedIn}`);
      } catch {
        // Already exists
      }
    }
  }

  // Store Twitter as identity if present
  if (contact.twitter) {
    const existingTW = contact.identities.find((i) => i.type === 'TWITTER');
    if (!existingTW) {
      try {
        await prisma.contactIdentity.create({
          data: {
            contactId: contact.id,
            type: 'TWITTER',
            value: contact.twitter.toLowerCase().replace(/^@/, ''),
            confidence: CONFIDENCE.GITHUB_IDENTITY,
            verified: false,
          },
        });
        identitiesAdded++;
        enrichments.push(`Added Twitter identity: ${contact.twitter}`);
      } catch {
        // Already exists
      }
    }
  }

  logger.info('Contact enrichment completed', {
    contactId,
    organizationId,
    identitiesAdded,
    companyResolved,
    enrichments: enrichments.length,
  });

  return { identitiesAdded, companyResolved, enrichments };
}

// ---------------------------------------------------------------------------
// GitHub-specific resolution helpers (used by github-connector)
// ---------------------------------------------------------------------------

/**
 * Resolves a GitHub user to a contact + company using the full resolution chain.
 * Designed to be called from the GitHub connector instead of its basic lookup.
 */
export async function resolveGitHubActor(
  organizationId: string,
  githubUsername: string,
  email?: string,
  companyField?: string,
  avatarUrl?: string,
): Promise<{ actorId: string | null; accountId: string | null }> {
  // Parse company field: "@stripe" -> companyName:"stripe", possibly githubOrg:"stripe"
  let companyName: string | undefined;
  let githubOrg: string | undefined;
  if (companyField) {
    const cleaned = companyField.trim();
    if (cleaned.startsWith('@')) {
      githubOrg = cleaned.slice(1);
      companyName = cleaned.slice(1);
    } else {
      companyName = cleaned;
    }
  }

  const result = await resolveIdentity(organizationId, {
    email,
    githubUsername,
    companyName,
    githubOrg,
    avatar: avatarUrl,
    companyDomain: email ? extractCompanyDomain(email) || undefined : undefined,
  });

  return {
    actorId: result.contactId,
    accountId: result.companyId,
  };
}

/**
 * Resolves npm maintainer information to a contact + company.
 * Designed to be called from the npm connector.
 */
export async function resolveNpmMaintainer(
  organizationId: string,
  npmUsername: string,
  email?: string,
): Promise<{ actorId: string | null; accountId: string | null }> {
  const result = await resolveIdentity(organizationId, {
    email,
    npmUsername,
    companyDomain: email ? extractCompanyDomain(email) || undefined : undefined,
  });

  return {
    actorId: result.contactId,
    accountId: result.companyId,
  };
}

// ---------------------------------------------------------------------------
// Signal ingest integration
// ---------------------------------------------------------------------------

/**
 * Enhanced signal resolution that runs identity resolution before creating a signal.
 * Used by the signal ingest service as a drop-in upgrade.
 */
export async function resolveSignalIdentity(
  organizationId: string,
  data: {
    actorId?: string;
    accountId?: string;
    anonymousId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ actorId: string | null; accountId: string | null }> {
  // If already fully resolved, nothing to do
  if (data.actorId && data.accountId) {
    return { actorId: data.actorId, accountId: data.accountId };
  }

  // Try to resolve from existing actorId
  if (data.actorId && !data.accountId) {
    const contact = await prisma.contact.findFirst({
      where: { id: data.actorId, organizationId },
      select: { companyId: true },
    });
    if (contact?.companyId) {
      return { actorId: data.actorId, accountId: contact.companyId };
    }
  }

  // Try to resolve from anonymousId
  if (!data.actorId && data.anonymousId) {
    // Parse anonymousId formats: "github:username", "npm:username", or email
    const signals: IdentitySignal = {};

    if (data.anonymousId.startsWith('github:')) {
      signals.githubUsername = data.anonymousId.slice(7);
    } else if (data.anonymousId.startsWith('npm:')) {
      signals.npmUsername = data.anonymousId.slice(4);
    } else if (data.anonymousId.includes('@')) {
      signals.email = data.anonymousId;
    }

    // Extract additional hints from metadata
    if (data.metadata) {
      if (data.metadata.sender_login && !signals.githubUsername) {
        signals.githubUsername = String(data.metadata.sender_login);
      }
      if (data.metadata.sender_avatar) {
        signals.avatar = String(data.metadata.sender_avatar);
      }
      if (data.metadata.maintainer_email && !signals.email) {
        signals.email = String(data.metadata.maintainer_email);
      }
    }

    if (hasEnoughForContact(signals)) {
      const result = await resolveIdentity(organizationId, signals);
      return {
        actorId: result.contactId,
        accountId: result.companyId,
      };
    }

    // Fall back to simple domain matching for email-like anonymousIds
    if (data.anonymousId.includes('@')) {
      const domain = extractCompanyDomain(data.anonymousId);
      if (domain) {
        const company = await prisma.company.findFirst({
          where: { organizationId, domain },
          select: { id: true },
        });
        if (company) {
          return { actorId: null, accountId: company.id };
        }
      }
    }
  }

  return {
    actorId: data.actorId || null,
    accountId: data.accountId || null,
  };
}

// ---------------------------------------------------------------------------
// Auto-Merge: Cooldown Tracking
// ---------------------------------------------------------------------------

/**
 * In-memory cooldown set to prevent re-attempting the same merge pair within 24h.
 * Keys are "contactIdA:contactIdB" (sorted alphabetically) with a TTL.
 */
const autoMergeCooldown = new Map<string, number>();

/** Cooldown period: 24 hours in milliseconds. */
const AUTO_MERGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Returns a canonical pair key (sorted) for two contact IDs.
 */
function mergePairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/**
 * Checks if a merge pair is on cooldown.
 */
function isOnCooldown(a: string, b: string): boolean {
  const key = mergePairKey(a, b);
  const expiry = autoMergeCooldown.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    autoMergeCooldown.delete(key);
    return false;
  }
  return true;
}

/**
 * Sets a cooldown for a merge pair.
 */
function setCooldown(a: string, b: string): void {
  const key = mergePairKey(a, b);
  autoMergeCooldown.set(key, Date.now() + AUTO_MERGE_COOLDOWN_MS);
}

/**
 * Periodic cleanup of expired cooldown entries (runs lazily).
 */
function cleanupCooldowns(): void {
  const now = Date.now();
  for (const [key, expiry] of autoMergeCooldown) {
    if (now > expiry) {
      autoMergeCooldown.delete(key);
    }
  }
}

// Run cooldown cleanup every hour
setInterval(cleanupCooldowns, 60 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Auto-Merge: Core Logic
// ---------------------------------------------------------------------------

/**
 * After signal identity resolution, check if we found a high-confidence match
 * to an existing contact that is DIFFERENT from the one currently associated.
 * If confidence >= AUTO_MERGE_THRESHOLD, auto-merge the contacts.
 *
 * Returns the primary contact ID after potential merge.
 */
export async function autoMergeIfHighConfidence(
  resolvedContactId: string,
  organizationId: string,
  signalMetadata: { email?: string; githubUsername?: string; npmUsername?: string },
): Promise<string> {
  // Collect all identities belonging to the resolved contact
  const resolvedIdentities = await prisma.contactIdentity.findMany({
    where: { contactId: resolvedContactId },
    select: { type: true, value: true, confidence: true },
  });

  if (resolvedIdentities.length === 0) {
    return resolvedContactId;
  }

  // Also include signal metadata as candidate identity values to check
  const candidateValues: Array<{ type: IdentityType; value: string }> = [];
  for (const identity of resolvedIdentities) {
    candidateValues.push({ type: identity.type, value: identity.value });
  }
  if (signalMetadata.email) {
    const normalizedEmail = signalMetadata.email.toLowerCase().trim();
    if (!candidateValues.some((c) => c.type === 'EMAIL' && c.value === normalizedEmail)) {
      candidateValues.push({ type: 'EMAIL', value: normalizedEmail });
    }
  }
  if (signalMetadata.githubUsername) {
    const normalizedGh = signalMetadata.githubUsername.toLowerCase();
    if (!candidateValues.some((c) => c.type === 'GITHUB' && c.value === normalizedGh)) {
      candidateValues.push({ type: 'GITHUB', value: normalizedGh });
    }
  }
  if (signalMetadata.npmUsername) {
    const normalizedNpm = signalMetadata.npmUsername.toLowerCase();
    if (!candidateValues.some((c) => c.type === 'NPM' && c.value === normalizedNpm)) {
      candidateValues.push({ type: 'NPM', value: normalizedNpm });
    }
  }

  // Find OTHER contacts in the same org that share any of these identity values
  const overlappingIdentities = await prisma.contactIdentity.findMany({
    where: {
      OR: candidateValues.map((cv) => ({
        type: cv.type,
        value: cv.value,
      })),
      contactId: { not: resolvedContactId },
      contact: { organizationId },
    },
    select: {
      contactId: true,
      type: true,
      value: true,
      confidence: true,
    },
  });

  if (overlappingIdentities.length === 0) {
    return resolvedContactId;
  }

  // Group overlapping identities by contactId
  const overlapByContact = new Map<string, Array<{ type: IdentityType; value: string; confidence: number }>>();
  for (const oi of overlappingIdentities) {
    const existing = overlapByContact.get(oi.contactId) || [];
    existing.push({ type: oi.type, value: oi.value, confidence: oi.confidence });
    overlapByContact.set(oi.contactId, existing);
  }

  // If 3+ other contacts overlap, flag for manual review (never auto-merge)
  if (overlapByContact.size > 1) {
    logger.info('Auto-merge: 3+ contacts overlap, flagging for manual review', {
      resolvedContactId,
      organizationId,
      overlappingContactIds: [...overlapByContact.keys()],
    });
    return resolvedContactId;
  }

  // Exactly 1 other contact overlaps
  const [otherContactId, sharedIdentities] = [...overlapByContact.entries()][0];

  // Calculate the max confidence from shared identities
  const maxConfidence = Math.max(...sharedIdentities.map((si) => si.confidence));

  // Check if confidence meets threshold
  if (maxConfidence < CONFIDENCE.AUTO_MERGE_THRESHOLD) {
    logger.debug('Auto-merge: confidence below threshold', {
      resolvedContactId,
      otherContactId,
      maxConfidence,
      threshold: CONFIDENCE.AUTO_MERGE_THRESHOLD,
    });
    return resolvedContactId;
  }

  // Check cooldown
  if (isOnCooldown(resolvedContactId, otherContactId)) {
    logger.debug('Auto-merge: pair on cooldown', {
      resolvedContactId,
      otherContactId,
    });
    return resolvedContactId;
  }

  // Safety check: never auto-merge if either contact is the only one in their company
  const [resolvedContact, otherContact] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: resolvedContactId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        _count: { select: { signals: true } },
      },
    }),
    prisma.contact.findUnique({
      where: { id: otherContactId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        _count: { select: { signals: true } },
      },
    }),
  ]);

  if (!resolvedContact || !otherContact) {
    return resolvedContactId;
  }

  // Check sole-contact-in-company constraint
  for (const contact of [resolvedContact, otherContact]) {
    if (contact.companyId) {
      const companyContactCount = await prisma.contact.count({
        where: { companyId: contact.companyId, organizationId },
      });
      if (companyContactCount <= 1) {
        logger.debug('Auto-merge: skipping — contact is sole member of company', {
          contactId: contact.id,
          companyId: contact.companyId,
        });
        // Set cooldown to avoid re-checking this pair repeatedly
        setCooldown(resolvedContactId, otherContactId);
        return resolvedContactId;
      }
    }
  }

  // Determine primary: keep the contact with more signals
  const resolvedSignalCount = resolvedContact._count.signals;
  const otherSignalCount = otherContact._count.signals;

  const primaryId = resolvedSignalCount >= otherSignalCount
    ? resolvedContact.id
    : otherContact.id;
  const duplicateId = primaryId === resolvedContact.id
    ? otherContact.id
    : resolvedContact.id;

  const primaryName = primaryId === resolvedContact.id
    ? `${resolvedContact.firstName} ${resolvedContact.lastName}`.trim()
    : `${otherContact.firstName} ${otherContact.lastName}`.trim();
  const duplicateName = primaryId === resolvedContact.id
    ? `${otherContact.firstName} ${otherContact.lastName}`.trim()
    : `${resolvedContact.firstName} ${resolvedContact.lastName}`.trim();

  // Perform the merge
  try {
    const result = await mergeContacts(organizationId, primaryId, [duplicateId]);

    if (result.merged === 1) {
      const confidencePercent = Math.round(maxConfidence * 100);

      logger.info('Auto-merge completed', {
        organizationId,
        primaryId,
        duplicateId,
        primaryName,
        duplicateName,
        confidence: maxConfidence,
        sharedIdentities: sharedIdentities.map((si) => `${si.type}:${si.value}`),
      });

      // Store auto-merge history in org settings
      await recordAutoMerge(organizationId, {
        primary: primaryId,
        primaryName,
        merged: duplicateId,
        mergedName: duplicateName,
        confidence: maxConfidence,
        sharedIdentities: sharedIdentities.map((si) => ({
          type: si.type,
          value: si.value,
        })),
        timestamp: new Date().toISOString(),
      });

      // Notify all org users about the auto-merge (fire-and-forget)
      notifyOrgUsers(organizationId, {
        type: 'auto_merge',
        title: `Auto-merged ${primaryName} with ${duplicateName} (${confidencePercent}% confidence)`,
        body: `Shared identities: ${sharedIdentities.map((si) => `${si.type}=${si.value}`).join(', ')}`,
        entityType: 'contact',
        entityId: primaryId,
      }).catch((err) => {
        logger.warn('Failed to send auto-merge notification', { error: err });
      });

      // Set cooldown (the duplicate no longer exists, but the key prevents
      // any stale references from re-triggering within the window)
      setCooldown(primaryId, duplicateId);

      return primaryId;
    }

    // Merge returned 0 or had errors
    if (result.errors.length > 0) {
      logger.warn('Auto-merge had errors', {
        primaryId,
        duplicateId,
        errors: result.errors,
      });
    }
    setCooldown(resolvedContactId, otherContactId);
    return resolvedContactId;
  } catch (err) {
    logger.error('Auto-merge failed', {
      primaryId,
      duplicateId,
      organizationId,
      error: err,
    });
    // Set cooldown even on failure to avoid retry storms
    setCooldown(resolvedContactId, otherContactId);
    return resolvedContactId;
  }
}

// ---------------------------------------------------------------------------
// Auto-Merge: History Tracking (stored in org.settings.autoMergeHistory)
// ---------------------------------------------------------------------------

interface AutoMergeRecord {
  primary: string;
  primaryName: string;
  merged: string;
  mergedName: string;
  confidence: number;
  sharedIdentities: Array<{ type: string; value: string }>;
  timestamp: string;
}

/**
 * Appends an auto-merge record to the organization's settings.autoMergeHistory
 * array, capped at 100 entries (FIFO).
 */
async function recordAutoMerge(
  organizationId: string,
  record: AutoMergeRecord,
): Promise<void> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const settings = (org?.settings as Record<string, unknown>) || {};
    const history = Array.isArray(settings.autoMergeHistory)
      ? (settings.autoMergeHistory as AutoMergeRecord[])
      : [];

    // Prepend new record and cap at 100
    history.unshift(record);
    if (history.length > 100) {
      history.length = 100;
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...settings,
          autoMergeHistory: history,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn('Failed to record auto-merge history', {
      organizationId,
      error: err,
    });
  }
}

// ---------------------------------------------------------------------------
// Auto-Merge: Stats (read from org.settings.autoMergeHistory)
// ---------------------------------------------------------------------------

export interface AutoMergeStats {
  totalAutoMerges: number;
  last24h: number;
  recentMerges: Array<{
    primary: string;
    merged: string;
    confidence: number;
    timestamp: string;
  }>;
}

/**
 * Returns auto-merge statistics for an organization.
 */
export async function getAutoMergeStats(
  organizationId: string,
): Promise<AutoMergeStats> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings as Record<string, unknown>) || {};
  const history = Array.isArray(settings.autoMergeHistory)
    ? (settings.autoMergeHistory as AutoMergeRecord[])
    : [];

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const last24h = history.filter((r) => r.timestamp >= twentyFourHoursAgo).length;

  return {
    totalAutoMerges: history.length,
    last24h,
    recentMerges: history.slice(0, 20).map((r) => ({
      primary: r.primary,
      merged: r.merged,
      confidence: r.confidence,
      timestamp: r.timestamp,
    })),
  };
}

// ---------------------------------------------------------------------------
// Exports for GitHub org enrichment (called externally)
// ---------------------------------------------------------------------------

export { estimateCompanySize, domainToCompanyName };
