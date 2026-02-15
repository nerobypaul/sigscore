import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInConnectorConfig {
  companyPageUrl: string;
  trackEmployees: boolean;
  webhookSecret: string;
  lastSyncAt: string | null;
  lastSyncResult: LinkedInSyncResult | null;
}

export interface LinkedInSyncResult {
  employeesImported: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface LinkedInStatus {
  connected: boolean;
  companyPageUrl: string | null;
  trackEmployees: boolean;
  webhookSecret: string | null;
  webhookUrl: string | null;
  lastSyncAt: string | null;
  lastSyncResult: LinkedInSyncResult | null;
  sourceId: string | null;
  signalStats: {
    total: number;
    pageViews: number;
    postEngagements: number;
    employeeActivity: number;
    companyFollows: number;
  };
}

export interface LinkedInWebhookEvent {
  type:
    | 'linkedin_page_view'
    | 'linkedin_post_engagement'
    | 'linkedin_employee_activity'
    | 'linkedin_company_follow';
  actor: {
    name?: string;
    email?: string;
    profileUrl?: string;
    title?: string;
    company?: string;
  };
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface LinkedInEmployeeImport {
  name: string;
  title: string;
  profileUrl: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Public API: Configure LinkedIn
// ---------------------------------------------------------------------------

export async function configureLinkedIn(
  organizationId: string,
  settings: {
    companyPageUrl: string;
    trackEmployees: boolean;
    webhookSecret?: string;
  },
): Promise<void> {
  const existing = await getLinkedInSource(organizationId);

  const webhookSecret =
    settings.webhookSecret ||
    (existing
      ? ((existing.config as unknown as LinkedInConnectorConfig)
          ?.webhookSecret ?? generateWebhookSecret())
      : generateWebhookSecret());

  const linkedinConfig: LinkedInConnectorConfig = {
    companyPageUrl: settings.companyPageUrl.trim(),
    trackEmployees: settings.trackEmployees,
    webhookSecret,
    lastSyncAt: existing
      ? ((existing.config as unknown as LinkedInConnectorConfig)?.lastSyncAt ??
        null)
      : null,
    lastSyncResult: existing
      ? ((existing.config as unknown as LinkedInConnectorConfig)
          ?.lastSyncResult ?? null)
      : null,
  };

  const name = `LinkedIn: ${extractCompanyName(settings.companyPageUrl)}`;

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name,
        config: linkedinConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
  } else {
    await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'LINKEDIN',
        name,
        config: linkedinConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Public API: Get LinkedIn Config
// ---------------------------------------------------------------------------

export async function getLinkedInConfig(
  organizationId: string,
): Promise<LinkedInConnectorConfig | null> {
  const source = await getLinkedInSource(organizationId);
  if (!source) return null;
  return source.config as unknown as LinkedInConnectorConfig;
}

// ---------------------------------------------------------------------------
// Public API: Get LinkedIn Status
// ---------------------------------------------------------------------------

export async function getLinkedInStatus(
  organizationId: string,
): Promise<LinkedInStatus> {
  const source = await getLinkedInSource(organizationId);
  if (!source) {
    return {
      connected: false,
      companyPageUrl: null,
      trackEmployees: false,
      webhookSecret: null,
      webhookUrl: null,
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
      signalStats: {
        total: 0,
        pageViews: 0,
        postEngagements: 0,
        employeeActivity: 0,
        companyFollows: 0,
      },
    };
  }

  const cfg = source.config as unknown as LinkedInConnectorConfig;

  // Gather signal stats
  const signalCounts = await prisma.signal.groupBy({
    by: ['type'],
    where: {
      organizationId,
      sourceId: source.id,
    },
    _count: { id: true },
  });

  const stats = {
    total: 0,
    pageViews: 0,
    postEngagements: 0,
    employeeActivity: 0,
    companyFollows: 0,
  };

  for (const row of signalCounts) {
    const count = row._count.id;
    stats.total += count;
    if (row.type === 'linkedin_page_view') stats.pageViews = count;
    else if (row.type === 'linkedin_post_engagement')
      stats.postEngagements = count;
    else if (row.type === 'linkedin_employee_activity')
      stats.employeeActivity = count;
    else if (row.type === 'linkedin_company_follow')
      stats.companyFollows = count;
  }

  return {
    connected: true,
    companyPageUrl: cfg.companyPageUrl || null,
    trackEmployees: cfg.trackEmployees || false,
    webhookSecret: cfg.webhookSecret || null,
    webhookUrl: `/api/v1/connectors/linkedin/webhook/${source.id}`,
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
    signalStats: stats,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect LinkedIn
// ---------------------------------------------------------------------------

export async function disconnectLinkedIn(
  organizationId: string,
): Promise<void> {
  const source = await getLinkedInSource(organizationId);
  if (!source) {
    throw new Error('LinkedIn is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Handle LinkedIn Webhook
// ---------------------------------------------------------------------------

export async function handleLinkedInWebhook(
  organizationId: string,
  sourceId: string,
  payload: LinkedInWebhookEvent,
): Promise<{ signalId: string | null }> {
  const source = await prisma.signalSource.findFirst({
    where: { id: sourceId, organizationId, type: 'LINKEDIN' },
  });

  if (!source) {
    throw new Error('LinkedIn source not found');
  }

  const validTypes = [
    'linkedin_page_view',
    'linkedin_post_engagement',
    'linkedin_employee_activity',
    'linkedin_company_follow',
  ];

  if (!validTypes.includes(payload.type)) {
    throw new Error(`Invalid signal type: ${payload.type}`);
  }

  const actor = payload.actor || {};
  const timestamp = payload.timestamp
    ? new Date(payload.timestamp)
    : new Date();

  // Build idempotency key from event details
  const idempotencyKey = `linkedin:${payload.type}:${actor.email || actor.profileUrl || 'anon'}:${timestamp.toISOString()}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { signalId: existing.id };
  }

  // Resolve contact
  const contactId = await resolveLinkedInContact(organizationId, actor);

  // Resolve account from contact's company
  let accountId: string | null = null;
  if (contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      select: { companyId: true },
    });
    if (contact?.companyId) {
      accountId = contact.companyId;
    }
  }

  // Build metadata
  const metadata: Record<string, unknown> = {
    ...payload.metadata,
    actorName: actor.name || 'Unknown',
    actorEmail: actor.email || null,
    actorProfileUrl: actor.profileUrl || null,
    actorTitle: actor.title || null,
    actorCompany: actor.company || null,
  };

  // Create signal
  const signal = await prisma.signal.create({
    data: {
      organizationId,
      sourceId: source.id,
      type: payload.type,
      actorId: contactId || null,
      accountId,
      anonymousId: contactId
        ? null
        : `linkedin:${actor.email || actor.profileUrl || 'anonymous'}`,
      metadata: metadata as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp,
    },
  });

  // Enqueue workflow
  enqueueWorkflowExecution(organizationId, 'signal_received', {
    signalId: signal.id,
    type: payload.type,
    accountId,
    actorId: contactId,
    metadata,
  }).catch((err) =>
    logger.error('LinkedIn signal workflow enqueue error:', err),
  );

  return { signalId: signal.id };
}

// ---------------------------------------------------------------------------
// Public API: Import LinkedIn Employees (manual bulk import)
// ---------------------------------------------------------------------------

export async function importLinkedInEmployees(
  organizationId: string,
  employees: LinkedInEmployeeImport[],
): Promise<LinkedInSyncResult> {
  const source = await getLinkedInSource(organizationId);
  if (!source) {
    throw new Error('LinkedIn is not connected for this organization');
  }

  const result: LinkedInSyncResult = {
    employeesImported: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  for (const employee of employees) {
    try {
      // Parse name into first/last
      const nameParts = employee.name.trim().split(/\s+/);
      const firstName = nameParts[0] || employee.name;
      const lastName = nameParts.slice(1).join(' ') || '';

      // Check if contact already exists (by email or LinkedIn URL)
      let contact = employee.email
        ? await prisma.contact.findFirst({
            where: { organizationId, email: employee.email },
          })
        : null;

      if (!contact && employee.profileUrl) {
        contact = await prisma.contact.findFirst({
          where: { organizationId, linkedIn: employee.profileUrl },
        });
      }

      if (!contact) {
        // Try by name
        contact = await prisma.contact.findFirst({
          where: {
            organizationId,
            firstName: { equals: firstName, mode: 'insensitive' },
            lastName: { equals: lastName, mode: 'insensitive' },
          },
        });
      }

      if (contact) {
        // Update existing contact with LinkedIn info
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            linkedIn: employee.profileUrl || contact.linkedIn,
            title: employee.title || contact.title,
            ...(employee.email && !contact.email
              ? { email: employee.email }
              : {}),
          },
        });
        result.contactsResolved++;
      } else {
        // Create new contact
        contact = await prisma.contact.create({
          data: {
            organizationId,
            firstName,
            lastName,
            email: employee.email || null,
            title: employee.title || null,
            linkedIn: employee.profileUrl || null,
          },
        });
        result.employeesImported++;
      }

      // Create LinkedIn identity
      if (employee.profileUrl) {
        await prisma.contactIdentity.upsert({
          where: {
            type_value: {
              type: 'LINKEDIN',
              value: employee.profileUrl,
            },
          },
          create: {
            contactId: contact.id,
            type: 'LINKEDIN',
            value: employee.profileUrl,
            verified: false,
            confidence: 0.8,
          },
          update: {},
        });
      }

      // Create a signal for the employee import
      const idempotencyKey = `linkedin:import:${employee.profileUrl || employee.email || employee.name}:${contact.id}`;

      const existingSignal = await prisma.signal.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });

      if (!existingSignal) {
        await prisma.signal.create({
          data: {
            organizationId,
            sourceId: source.id,
            type: 'linkedin_employee_activity',
            actorId: contact.id,
            accountId: contact.companyId,
            metadata: {
              importedVia: 'manual',
              name: employee.name,
              title: employee.title,
              profileUrl: employee.profileUrl,
            } as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: new Date(),
          },
        });
        result.signalsCreated++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Failed to import ${employee.name}: ${msg}`);
      logger.error('LinkedIn employee import error', {
        employee: employee.name,
        error: msg,
      });
    }
  }

  // Update sync result
  const cfg = source.config as unknown as LinkedInConnectorConfig;
  cfg.lastSyncAt = new Date().toISOString();
  cfg.lastSyncResult = result;

  await prisma.signalSource.update({
    where: { id: source.id },
    data: {
      config: cfg as unknown as Prisma.InputJsonValue,
      lastSyncAt: new Date(),
      status: result.errors.length > 0 ? 'ERROR' : 'ACTIVE',
      errorMessage:
        result.errors.length > 0 ? result.errors.join('; ') : null,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Public API: Get connected org IDs (for scheduler)
// ---------------------------------------------------------------------------

export async function getLinkedInConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'LINKEDIN', status: 'ACTIVE' },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Public API: Sync LinkedIn (processes queued webhook events)
// ---------------------------------------------------------------------------

export async function syncLinkedIn(
  organizationId: string,
): Promise<LinkedInSyncResult> {
  const source = await getLinkedInSource(organizationId);
  if (!source) {
    throw new Error('LinkedIn is not connected for this organization');
  }

  // LinkedIn is primarily webhook/import driven. The sync job is a no-op
  // that just updates the last sync timestamp and aggregates stats.
  const result: LinkedInSyncResult = {
    employeesImported: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  const cfg = source.config as unknown as LinkedInConnectorConfig;
  cfg.lastSyncAt = new Date().toISOString();
  cfg.lastSyncResult = result;

  await prisma.signalSource.update({
    where: { id: source.id },
    data: {
      config: cfg as unknown as Prisma.InputJsonValue,
      lastSyncAt: new Date(),
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

export function verifyWebhookSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolveLinkedInContact(
  organizationId: string,
  actor: LinkedInWebhookEvent['actor'],
): Promise<string | null> {
  if (!actor) return null;

  // 1. Try matching by email
  if (actor.email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email: actor.email },
      select: { id: true },
    });
    if (contact) return contact.id;
  }

  // 2. Try matching by LinkedIn profile URL identity
  if (actor.profileUrl) {
    const identity = await prisma.contactIdentity.findFirst({
      where: { type: 'LINKEDIN', value: actor.profileUrl },
      include: {
        contact: {
          select: { id: true, organizationId: true },
        },
      },
    });

    if (identity && identity.contact.organizationId === organizationId) {
      return identity.contact.id;
    }

    // 2b. Try matching by linkedIn field on contact
    const contact = await prisma.contact.findFirst({
      where: { organizationId, linkedIn: actor.profileUrl },
      select: { id: true },
    });
    if (contact) {
      // Create identity link
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'LINKEDIN', value: actor.profileUrl },
        },
        create: {
          contactId: contact.id,
          type: 'LINKEDIN',
          value: actor.profileUrl,
          verified: false,
          confidence: 0.7,
        },
        update: {},
      });
      return contact.id;
    }
  }

  // 3. Try matching by name
  if (actor.name && actor.name.includes(' ')) {
    const parts = actor.name.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');

    const contact = await prisma.contact.findFirst({
      where: {
        organizationId,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (contact) {
      // Create LinkedIn identity link if we have a profile URL
      if (actor.profileUrl) {
        await prisma.contactIdentity.upsert({
          where: {
            type_value: { type: 'LINKEDIN', value: actor.profileUrl },
          },
          create: {
            contactId: contact.id,
            type: 'LINKEDIN',
            value: actor.profileUrl,
            verified: false,
            confidence: 0.5,
          },
          update: {},
        });
      }
      return contact.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getLinkedInSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: { organizationId, type: 'LINKEDIN' },
  });
}

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

function extractCompanyName(url: string): string {
  // Extract company name from LinkedIn URL
  // e.g. https://www.linkedin.com/company/acme-corp -> acme-corp
  const match = url.match(/linkedin\.com\/company\/([^/?#]+)/);
  if (match) {
    return match[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return url;
}
