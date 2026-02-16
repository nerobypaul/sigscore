import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZendeskConnectorConfig {
  subdomain: string | null;
  apiToken: string | null;
  email: string | null;
  webhookSecret: string;
  trackedEvents: ZendeskTrackedEvent[];
  lastSyncAt: string | null;
  lastSyncResult: ZendeskSyncResult | null;
}

export type ZendeskTrackedEvent =
  | 'zendesk_ticket_created'
  | 'zendesk_ticket_updated'
  | 'zendesk_ticket_solved'
  | 'zendesk_satisfaction_rated';

export interface ZendeskSyncResult {
  ticketsProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface ZendeskStatus {
  connected: boolean;
  hasApiToken: boolean;
  webhookSecret: string | null;
  webhookUrl: string | null;
  trackedEvents: ZendeskTrackedEvent[];
  lastSyncAt: string | null;
  lastSyncResult: ZendeskSyncResult | null;
  sourceId: string | null;
  signalStats: {
    total: number;
    ticketCreated: number;
    ticketUpdated: number;
    ticketSolved: number;
    satisfactionRated: number;
  };
}

/**
 * Zendesk webhook topic to DevSignal signal type mapping.
 */
const TOPIC_MAP: Record<string, ZendeskTrackedEvent> = {
  'ticket.created': 'zendesk_ticket_created',
  'ticket.updated': 'zendesk_ticket_updated',
  'ticket.solved': 'zendesk_ticket_solved',
  'satisfaction_rating.created': 'zendesk_satisfaction_rated',
};

const ALL_TRACKED_EVENTS: ZendeskTrackedEvent[] = [
  'zendesk_ticket_created',
  'zendesk_ticket_updated',
  'zendesk_ticket_solved',
  'zendesk_satisfaction_rated',
];

// ---------------------------------------------------------------------------
// Public API: Configure Zendesk
// ---------------------------------------------------------------------------

export async function configureZendesk(
  organizationId: string,
  settings: {
    subdomain?: string;
    apiToken?: string;
    email?: string;
    webhookSecret?: string;
    trackedEvents?: ZendeskTrackedEvent[];
  },
): Promise<void> {
  const existing = await getZendeskSource(organizationId);

  const existingCfg = existing
    ? (existing.config as unknown as ZendeskConnectorConfig)
    : null;

  const webhookSecret =
    settings.webhookSecret ||
    existingCfg?.webhookSecret ||
    generateWebhookSecret();

  const zendeskConfig: ZendeskConnectorConfig = {
    subdomain:
      settings.subdomain !== undefined
        ? settings.subdomain || null
        : existingCfg?.subdomain ?? null,
    apiToken:
      settings.apiToken !== undefined
        ? settings.apiToken || null
        : existingCfg?.apiToken ?? null,
    email:
      settings.email !== undefined
        ? settings.email || null
        : existingCfg?.email ?? null,
    webhookSecret,
    trackedEvents:
      settings.trackedEvents || existingCfg?.trackedEvents || ALL_TRACKED_EVENTS,
    lastSyncAt: existingCfg?.lastSyncAt ?? null,
    lastSyncResult: existingCfg?.lastSyncResult ?? null,
  };

  const name = 'Zendesk';

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name,
        config: zendeskConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
  } else {
    await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'ZENDESK',
        name,
        config: zendeskConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Public API: Get Zendesk Config
// ---------------------------------------------------------------------------

export async function getZendeskConfig(
  organizationId: string,
): Promise<ZendeskConnectorConfig | null> {
  const source = await getZendeskSource(organizationId);
  if (!source) return null;
  return source.config as unknown as ZendeskConnectorConfig;
}

// ---------------------------------------------------------------------------
// Public API: Get Zendesk Status
// ---------------------------------------------------------------------------

export async function getZendeskStatus(
  organizationId: string,
): Promise<ZendeskStatus> {
  const source = await getZendeskSource(organizationId);
  if (!source) {
    return {
      connected: false,
      hasApiToken: false,
      webhookSecret: null,
      webhookUrl: null,
      trackedEvents: [],
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
      signalStats: {
        total: 0,
        ticketCreated: 0,
        ticketUpdated: 0,
        ticketSolved: 0,
        satisfactionRated: 0,
      },
    };
  }

  const cfg = source.config as unknown as ZendeskConnectorConfig;

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
    ticketCreated: 0,
    ticketUpdated: 0,
    ticketSolved: 0,
    satisfactionRated: 0,
  };

  for (const row of signalCounts) {
    const count = row._count.id;
    stats.total += count;
    if (row.type === 'zendesk_ticket_created') stats.ticketCreated = count;
    else if (row.type === 'zendesk_ticket_updated') stats.ticketUpdated = count;
    else if (row.type === 'zendesk_ticket_solved') stats.ticketSolved = count;
    else if (row.type === 'zendesk_satisfaction_rated') stats.satisfactionRated = count;
  }

  return {
    connected: true,
    hasApiToken: !!cfg.apiToken,
    webhookSecret: cfg.webhookSecret || null,
    webhookUrl: `/api/v1/connectors/zendesk/webhook/${source.id}`,
    trackedEvents: cfg.trackedEvents || ALL_TRACKED_EVENTS,
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
    signalStats: stats,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect Zendesk
// ---------------------------------------------------------------------------

export async function disconnectZendesk(
  organizationId: string,
): Promise<void> {
  const source = await getZendeskSource(organizationId);
  if (!source) {
    throw new Error('Zendesk is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Handle Zendesk Webhook
// ---------------------------------------------------------------------------

export async function handleZendeskWebhook(
  organizationId: string,
  sourceId: string,
  payload: Record<string, unknown>,
): Promise<{ signalId: string | null }> {
  const source = await prisma.signalSource.findFirst({
    where: { id: sourceId, organizationId, type: 'ZENDESK' },
  });

  if (!source) {
    throw new Error('Zendesk source not found');
  }

  const cfg = source.config as unknown as ZendeskConnectorConfig;

  // Extract the Zendesk webhook topic
  const topic = payload.topic as string | undefined;
  if (!topic) {
    throw new Error('Missing topic in webhook payload');
  }

  // Map topic to our signal type
  const signalType = TOPIC_MAP[topic];
  if (!signalType) {
    // Not a topic we track
    logger.debug('Zendesk webhook topic not tracked', { topic });
    return { signalId: null };
  }

  // Check if this event type is enabled
  if (!cfg.trackedEvents.includes(signalType)) {
    logger.debug('Zendesk event type not tracked by config', { signalType });
    return { signalId: null };
  }

  // Extract ticket data from the payload
  const ticket = (payload.ticket || payload.data || {}) as Record<string, unknown>;
  const ticketId = (ticket.id as number | string | undefined)?.toString() || null;
  const ticketStatus = (ticket.status as string) || null;
  const ticketPriority = (ticket.priority as string) || null;
  const ticketSubject = (ticket.subject as string) || null;
  const ticketDescription = (ticket.description as string) || null;

  // Extract requester (customer) info
  const requester = (ticket.requester || payload.requester || {}) as Record<string, unknown>;
  let customerEmail: string | null = null;
  let customerName: string | null = null;
  let zendeskUserId: string | null = null;

  if (requester && typeof requester === 'object') {
    customerEmail = (requester.email as string) || null;
    customerName = (requester.name as string) || null;
    zendeskUserId = (requester.id as number | string | undefined)?.toString() || null;
  }

  // If requester is just an ID, try the requester_id field
  if (!zendeskUserId) {
    const requesterId = ticket.requester_id as number | string | undefined;
    if (requesterId) {
      zendeskUserId = requesterId.toString();
    }
  }

  // Extract tags
  const tagsData = ticket.tags as string[] | undefined;
  const tags: string[] = Array.isArray(tagsData) ? tagsData : [];

  // Extract satisfaction rating for rated events
  let satisfactionScore: string | null = null;
  let satisfactionComment: string | null = null;
  if (signalType === 'zendesk_satisfaction_rated') {
    const rating = (payload.satisfaction_rating || ticket.satisfaction_rating || {}) as Record<string, unknown>;
    satisfactionScore = (rating.score as string) || null;
    satisfactionComment = (rating.comment as string) || null;
  }

  // Calculate response time for solved tickets
  let responseTimeSeconds: number | null = null;
  if (signalType === 'zendesk_ticket_solved') {
    const createdAt = ticket.created_at as string | undefined;
    const updatedAt = ticket.updated_at as string | undefined;
    if (createdAt && updatedAt) {
      const created = new Date(createdAt).getTime();
      const updated = new Date(updatedAt).getTime();
      if (!isNaN(created) && !isNaN(updated)) {
        responseTimeSeconds = Math.floor((updated - created) / 1000);
      }
    }
  }

  // Build ticket URL
  const subdomain = cfg.subdomain;
  const ticketUrl = ticketId && subdomain
    ? `https://${subdomain}.zendesk.com/agent/tickets/${ticketId}`
    : null;

  const timestamp = payload.timestamp
    ? new Date(payload.timestamp as string)
    : new Date();

  // Build idempotency key
  const webhookId = payload.id as string | undefined;
  const idempotencyKey = webhookId
    ? `zendesk:${webhookId}`
    : `zendesk:${signalType}:${ticketId || 'unknown'}:${timestamp.toISOString()}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { signalId: existing.id };
  }

  // Resolve contact via email or Zendesk identity
  const contactId = await resolveZendeskContact(
    organizationId,
    customerEmail,
    customerName,
    zendeskUserId,
  );

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
    ticketId,
    ticketUrl,
    subject: ticketSubject,
    description: ticketDescription,
    status: ticketStatus,
    priority: ticketPriority,
    customerEmail,
    customerName,
    zendeskUserId,
    tags,
    satisfactionScore,
    satisfactionComment,
    responseTimeSeconds,
    topic,
  };

  // Create signal
  const signal = await prisma.signal.create({
    data: {
      organizationId,
      sourceId: source.id,
      type: signalType,
      actorId: contactId || null,
      accountId,
      anonymousId: contactId
        ? null
        : `zendesk:${customerEmail || zendeskUserId || 'anonymous'}`,
      metadata: metadata as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp,
    },
  });

  // Enqueue workflow
  enqueueWorkflowExecution(organizationId, 'signal_received', {
    signalId: signal.id,
    type: signalType,
    accountId,
    actorId: contactId,
    metadata,
  }).catch((err) =>
    logger.error('Zendesk signal workflow enqueue error:', err),
  );

  return { signalId: signal.id };
}

// ---------------------------------------------------------------------------
// Public API: Sync Zendesk Tickets (API polling)
// ---------------------------------------------------------------------------

export async function syncZendeskTickets(
  organizationId: string,
): Promise<ZendeskSyncResult> {
  const source = await getZendeskSource(organizationId);
  if (!source) {
    throw new Error('Zendesk is not connected for this organization');
  }

  const cfg = source.config as unknown as ZendeskConnectorConfig;
  const result: ZendeskSyncResult = {
    ticketsProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  if (!cfg.apiToken || !cfg.subdomain || !cfg.email) {
    // No API credentials -- sync is a no-op, Zendesk is webhook-driven
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

  // Pull recent tickets via Zendesk API
  try {
    const since = cfg.lastSyncAt
      ? new Date(cfg.lastSyncAt).toISOString()
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Last 24 hours

    // Zendesk uses Basic auth: {email}/token:{apiToken}
    const authString = Buffer.from(`${cfg.email}/token:${cfg.apiToken}`).toString('base64');

    const response = await fetch(
      `https://${cfg.subdomain}.zendesk.com/api/v2/tickets.json?sort_by=updated_at&sort_order=desc&per_page=100`,
      {
        headers: {
          Authorization: `Basic ${authString}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zendesk API error: ${response.status} ${errorText}`);
    }

    const body = (await response.json()) as {
      tickets: Array<Record<string, unknown>>;
    };

    for (const ticket of body.tickets || []) {
      try {
        const updatedAt = ticket.updated_at as string | undefined;
        if (updatedAt && new Date(updatedAt) < new Date(since)) {
          // Skip tickets that haven't been updated since last sync
          continue;
        }

        result.ticketsProcessed++;

        // Determine signal type based on ticket status
        const status = ticket.status as string;
        let signalType: ZendeskTrackedEvent;
        if (status === 'solved' || status === 'closed') {
          signalType = 'zendesk_ticket_solved';
        } else if (status === 'new') {
          signalType = 'zendesk_ticket_created';
        } else {
          signalType = 'zendesk_ticket_updated';
        }

        if (!cfg.trackedEvents.includes(signalType)) {
          continue;
        }

        // Extract requester info
        let customerEmail: string | null = null;
        let customerName: string | null = null;
        let zendeskUserId: string | null = null;

        const requesterId = ticket.requester_id as number | undefined;
        if (requesterId) {
          zendeskUserId = requesterId.toString();
        }

        // If the ticket has a via.source.from with email, use that
        const via = ticket.via as Record<string, unknown> | undefined;
        if (via) {
          const viaSource = via.source as Record<string, unknown> | undefined;
          if (viaSource) {
            const from = viaSource.from as Record<string, unknown> | undefined;
            if (from) {
              customerEmail = (from.address as string) || null;
              customerName = (from.name as string) || null;
            }
          }
        }

        const ticketId = (ticket.id as number)?.toString() || 'unknown';
        const idempotencyKey = `zendesk:sync:${ticketId}:${updatedAt || 'unknown'}`;

        const existingSig = await prisma.signal.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existingSig) continue;

        const contactId = await resolveZendeskContact(
          organizationId,
          customerEmail,
          customerName,
          zendeskUserId,
        );
        if (contactId) result.contactsResolved++;

        let accountId: string | null = null;
        if (contactId) {
          const contact = await prisma.contact.findFirst({
            where: { id: contactId, organizationId },
            select: { companyId: true },
          });
          if (contact?.companyId) accountId = contact.companyId;
        }

        // Extract tags
        const tagsData = ticket.tags as string[] | undefined;
        const ticketTags: string[] = Array.isArray(tagsData) ? tagsData : [];

        const subject = (ticket.subject as string) || null;
        const priority = (ticket.priority as string) || null;

        const metadata: Record<string, unknown> = {
          ticketId,
          subject,
          customerEmail,
          customerName,
          zendeskUserId,
          tags: ticketTags,
          priority,
          status,
          ticketUrl: `https://${cfg.subdomain}.zendesk.com/agent/tickets/${ticketId}`,
          syncedVia: 'api',
        };

        await prisma.signal.create({
          data: {
            organizationId,
            sourceId: source.id,
            type: signalType,
            actorId: contactId || null,
            accountId,
            anonymousId: contactId
              ? null
              : `zendesk:${customerEmail || zendeskUserId || 'anonymous'}`,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: updatedAt ? new Date(updatedAt) : new Date(),
          },
        });

        result.signalsCreated++;
      } catch (ticketErr) {
        const msg = ticketErr instanceof Error ? ticketErr.message : 'Unknown error';
        result.errors.push(`Ticket error: ${msg}`);
        logger.error('Zendesk ticket sync error', { error: msg });
      }
    }
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : 'Unknown API error';
    result.errors.push(msg);
    logger.error('Zendesk API sync error', { error: msg });
  }

  // Update sync result
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

export async function getZendeskConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'ZENDESK', status: 'ACTIVE' },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification (Zendesk uses HMAC-SHA256, base64-encoded)
// ---------------------------------------------------------------------------

export function verifyZendeskSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolveZendeskContact(
  organizationId: string,
  email: string | null,
  name: string | null,
  zendeskUserId: string | null,
): Promise<string | null> {
  // 1. Try matching by email
  if (email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email },
      select: { id: true },
    });
    if (contact) {
      // Create Zendesk identity link if we have a Zendesk user ID
      if (zendeskUserId) {
        await prisma.contactIdentity.upsert({
          where: {
            type_value: { type: 'ZENDESK', value: zendeskUserId },
          },
          create: {
            contactId: contact.id,
            type: 'ZENDESK',
            value: zendeskUserId,
            verified: true,
            confidence: 0.9,
          },
          update: {},
        });
      }
      return contact.id;
    }
  }

  // 2. Try matching by Zendesk user ID identity
  if (zendeskUserId) {
    const identity = await prisma.contactIdentity.findFirst({
      where: { type: 'ZENDESK', value: zendeskUserId },
      include: {
        contact: {
          select: { id: true, organizationId: true },
        },
      },
    });

    if (identity && identity.contact.organizationId === organizationId) {
      return identity.contact.id;
    }
  }

  // 3. Try matching by name
  if (name && name.includes(' ')) {
    const parts = name.trim().split(/\s+/);
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
      // Create Zendesk identity link
      if (zendeskUserId) {
        await prisma.contactIdentity.upsert({
          where: {
            type_value: { type: 'ZENDESK', value: zendeskUserId },
          },
          create: {
            contactId: contact.id,
            type: 'ZENDESK',
            value: zendeskUserId,
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

async function getZendeskSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: { organizationId, type: 'ZENDESK' },
  });
}

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}
