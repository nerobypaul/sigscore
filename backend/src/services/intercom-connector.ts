import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntercomConnectorConfig {
  accessToken: string | null;
  webhookSecret: string;
  trackedEvents: IntercomTrackedEvent[];
  lastSyncAt: string | null;
  lastSyncResult: IntercomSyncResult | null;
}

export type IntercomTrackedEvent =
  | 'intercom_conversation_open'
  | 'intercom_conversation_reply'
  | 'intercom_conversation_closed'
  | 'intercom_conversation_rated';

export interface IntercomSyncResult {
  conversationsProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface IntercomStatus {
  connected: boolean;
  hasAccessToken: boolean;
  webhookSecret: string | null;
  webhookUrl: string | null;
  trackedEvents: IntercomTrackedEvent[];
  lastSyncAt: string | null;
  lastSyncResult: IntercomSyncResult | null;
  sourceId: string | null;
  signalStats: {
    total: number;
    conversationOpen: number;
    conversationReply: number;
    conversationClosed: number;
    conversationRated: number;
  };
}

/**
 * Intercom webhook topic to DevSignal signal type mapping.
 */
const TOPIC_MAP: Record<string, IntercomTrackedEvent> = {
  'conversation.user.created': 'intercom_conversation_open',
  'conversation.user.replied': 'intercom_conversation_reply',
  'conversation.admin.closed': 'intercom_conversation_closed',
  'conversation.rating.added': 'intercom_conversation_rated',
};

const ALL_TRACKED_EVENTS: IntercomTrackedEvent[] = [
  'intercom_conversation_open',
  'intercom_conversation_reply',
  'intercom_conversation_closed',
  'intercom_conversation_rated',
];

// ---------------------------------------------------------------------------
// Public API: Configure Intercom
// ---------------------------------------------------------------------------

export async function configureIntercom(
  organizationId: string,
  settings: {
    accessToken?: string;
    webhookSecret?: string;
    trackedEvents?: IntercomTrackedEvent[];
  },
): Promise<void> {
  const existing = await getIntercomSource(organizationId);

  const existingCfg = existing
    ? (existing.config as unknown as IntercomConnectorConfig)
    : null;

  const webhookSecret =
    settings.webhookSecret ||
    existingCfg?.webhookSecret ||
    generateWebhookSecret();

  const intercomConfig: IntercomConnectorConfig = {
    accessToken:
      settings.accessToken !== undefined
        ? settings.accessToken || null
        : existingCfg?.accessToken ?? null,
    webhookSecret,
    trackedEvents:
      settings.trackedEvents || existingCfg?.trackedEvents || ALL_TRACKED_EVENTS,
    lastSyncAt: existingCfg?.lastSyncAt ?? null,
    lastSyncResult: existingCfg?.lastSyncResult ?? null,
  };

  const name = 'Intercom';

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name,
        config: intercomConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
  } else {
    await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'INTERCOM',
        name,
        config: intercomConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Public API: Get Intercom Config
// ---------------------------------------------------------------------------

export async function getIntercomConfig(
  organizationId: string,
): Promise<IntercomConnectorConfig | null> {
  const source = await getIntercomSource(organizationId);
  if (!source) return null;
  return source.config as unknown as IntercomConnectorConfig;
}

// ---------------------------------------------------------------------------
// Public API: Get Intercom Status
// ---------------------------------------------------------------------------

export async function getIntercomStatus(
  organizationId: string,
): Promise<IntercomStatus> {
  const source = await getIntercomSource(organizationId);
  if (!source) {
    return {
      connected: false,
      hasAccessToken: false,
      webhookSecret: null,
      webhookUrl: null,
      trackedEvents: [],
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
      signalStats: {
        total: 0,
        conversationOpen: 0,
        conversationReply: 0,
        conversationClosed: 0,
        conversationRated: 0,
      },
    };
  }

  const cfg = source.config as unknown as IntercomConnectorConfig;

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
    conversationOpen: 0,
    conversationReply: 0,
    conversationClosed: 0,
    conversationRated: 0,
  };

  for (const row of signalCounts) {
    const count = row._count.id;
    stats.total += count;
    if (row.type === 'intercom_conversation_open') stats.conversationOpen = count;
    else if (row.type === 'intercom_conversation_reply') stats.conversationReply = count;
    else if (row.type === 'intercom_conversation_closed') stats.conversationClosed = count;
    else if (row.type === 'intercom_conversation_rated') stats.conversationRated = count;
  }

  return {
    connected: true,
    hasAccessToken: !!cfg.accessToken,
    webhookSecret: cfg.webhookSecret || null,
    webhookUrl: `/api/v1/connectors/intercom/webhook/${source.id}`,
    trackedEvents: cfg.trackedEvents || ALL_TRACKED_EVENTS,
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
    signalStats: stats,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect Intercom
// ---------------------------------------------------------------------------

export async function disconnectIntercom(
  organizationId: string,
): Promise<void> {
  const source = await getIntercomSource(organizationId);
  if (!source) {
    throw new Error('Intercom is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Handle Intercom Webhook
// ---------------------------------------------------------------------------

export async function handleIntercomWebhook(
  organizationId: string,
  sourceId: string,
  payload: Record<string, unknown>,
): Promise<{ signalId: string | null }> {
  const source = await prisma.signalSource.findFirst({
    where: { id: sourceId, organizationId, type: 'INTERCOM' },
  });

  if (!source) {
    throw new Error('Intercom source not found');
  }

  const cfg = source.config as unknown as IntercomConnectorConfig;

  // Extract the Intercom webhook topic
  const topic = payload.topic as string | undefined;
  if (!topic) {
    throw new Error('Missing topic in webhook payload');
  }

  // Map topic to our signal type
  const signalType = TOPIC_MAP[topic];
  if (!signalType) {
    // Not a topic we track
    logger.debug('Intercom webhook topic not tracked', { topic });
    return { signalId: null };
  }

  // Check if this event type is enabled
  if (!cfg.trackedEvents.includes(signalType)) {
    logger.debug('Intercom event type not tracked by config', { signalType });
    return { signalId: null };
  }

  // Extract conversation data from the payload
  const data = payload.data as Record<string, unknown> | undefined;
  const item = (data?.item || {}) as Record<string, unknown>;
  const conversationId = item.id as string | undefined;
  const conversationParts = item.conversation_parts as Record<string, unknown> | undefined;

  // Extract customer info
  const user = (item.user || item.contacts || {}) as Record<string, unknown>;
  // Intercom can nest contacts in an array
  let customerEmail: string | null = null;
  let customerName: string | null = null;
  let intercomUserId: string | null = null;

  if (Array.isArray(user)) {
    // contacts array
    const firstContact = user[0] as Record<string, unknown> | undefined;
    if (firstContact) {
      customerEmail = (firstContact.email as string) || null;
      customerName = (firstContact.name as string) || null;
      intercomUserId = (firstContact.id as string) || null;
    }
  } else if (user && typeof user === 'object') {
    // Check for contacts.contacts nested array (Intercom v2 format)
    const contactsList = (user as Record<string, unknown>).contacts as unknown[];
    if (Array.isArray(contactsList) && contactsList.length > 0) {
      const firstContact = contactsList[0] as Record<string, unknown>;
      customerEmail = (firstContact.email as string) || null;
      customerName = (firstContact.name as string) || null;
      intercomUserId = (firstContact.id as string) || null;
    } else {
      customerEmail = (user.email as string) || null;
      customerName = (user.name as string) || null;
      intercomUserId = (user.id as string) || null;
    }
  }

  // Extract tags
  const tagsData = item.tags as Record<string, unknown> | undefined;
  const tags: string[] = [];
  if (tagsData && Array.isArray(tagsData.tags)) {
    for (const tag of tagsData.tags as Array<Record<string, unknown>>) {
      if (tag.name) tags.push(tag.name as string);
    }
  }

  // Extract priority
  const priority = (item.priority as string) || null;

  // Extract subject/title
  const source_data = item.source as Record<string, unknown> | undefined;
  const subject = (source_data?.subject as string) || (item.title as string) || null;

  // Extract satisfaction rating for rated events
  let satisfactionScore: number | null = null;
  let satisfactionRemark: string | null = null;
  if (signalType === 'intercom_conversation_rated') {
    const ratingData = item.conversation_rating as Record<string, unknown> | undefined;
    if (ratingData) {
      satisfactionScore = (ratingData.rating as number) || null;
      satisfactionRemark = (ratingData.remark as string) || null;
    }
  }

  // Calculate response time for closed conversations
  let responseTimeSeconds: number | null = null;
  if (signalType === 'intercom_conversation_closed') {
    const createdAt = item.created_at as number | undefined;
    const updatedAt = item.updated_at as number | undefined;
    if (createdAt && updatedAt) {
      responseTimeSeconds = updatedAt - createdAt;
    }
  }

  // Count conversation parts for reply depth
  let replyCount: number | null = null;
  if (conversationParts) {
    const parts = conversationParts.conversation_parts as unknown[];
    if (Array.isArray(parts)) {
      replyCount = parts.length;
    } else {
      replyCount = (conversationParts.total_count as number) || null;
    }
  }

  // Build conversation URL
  const appId = payload.app_id as string | undefined;
  const conversationUrl = conversationId && appId
    ? `https://app.intercom.com/a/apps/${appId}/inbox/inbox/all/conversations/${conversationId}`
    : conversationId
      ? `https://app.intercom.com/inbox/conversation/${conversationId}`
      : null;

  const timestamp = payload.created_at
    ? new Date((payload.created_at as number) * 1000)
    : new Date();

  // Build idempotency key
  const deliveryId = payload.id as string | undefined;
  const idempotencyKey = deliveryId
    ? `intercom:${deliveryId}`
    : `intercom:${signalType}:${conversationId || 'unknown'}:${timestamp.toISOString()}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { signalId: existing.id };
  }

  // Resolve contact via email or Intercom identity
  const contactId = await resolveIntercomContact(
    organizationId,
    customerEmail,
    customerName,
    intercomUserId,
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
    conversationId,
    conversationUrl,
    subject,
    customerEmail,
    customerName,
    intercomUserId,
    tags,
    priority,
    satisfactionScore,
    satisfactionRemark,
    responseTimeSeconds,
    replyCount,
    topic,
    appId,
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
        : `intercom:${customerEmail || intercomUserId || 'anonymous'}`,
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
    logger.error('Intercom signal workflow enqueue error:', err),
  );

  return { signalId: signal.id };
}

// ---------------------------------------------------------------------------
// Public API: Sync Intercom Conversations (API polling)
// ---------------------------------------------------------------------------

export async function syncIntercomConversations(
  organizationId: string,
): Promise<IntercomSyncResult> {
  const source = await getIntercomSource(organizationId);
  if (!source) {
    throw new Error('Intercom is not connected for this organization');
  }

  const cfg = source.config as unknown as IntercomConnectorConfig;
  const result: IntercomSyncResult = {
    conversationsProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  if (!cfg.accessToken) {
    // No access token -- sync is a no-op, Intercom is webhook-driven
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

  // Pull recent conversations via Intercom API
  try {
    const since = cfg.lastSyncAt
      ? Math.floor(new Date(cfg.lastSyncAt).getTime() / 1000)
      : Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000); // Last 24 hours

    const response = await fetch(
      `https://api.intercom.io/conversations?per_page=50&order=updated_at&sort_order=desc`,
      {
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Intercom-Version': '2.11',
        },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Intercom API error: ${response.status} ${errorText}`);
    }

    const body = (await response.json()) as {
      conversations: Array<Record<string, unknown>>;
    };

    for (const conversation of body.conversations || []) {
      try {
        const updatedAt = conversation.updated_at as number;
        if (updatedAt && updatedAt < since) {
          // Skip conversations that haven't been updated since last sync
          continue;
        }

        result.conversationsProcessed++;

        // Determine signal type based on conversation state
        const state = conversation.state as string;
        let signalType: IntercomTrackedEvent;
        if (state === 'closed') {
          signalType = 'intercom_conversation_closed';
        } else if (state === 'open') {
          signalType = 'intercom_conversation_open';
        } else {
          signalType = 'intercom_conversation_open';
        }

        if (!cfg.trackedEvents.includes(signalType)) {
          continue;
        }

        // Extract contacts
        const contacts = conversation.contacts as Record<string, unknown> | undefined;
        let customerEmail: string | null = null;
        let customerName: string | null = null;
        let intercomUserId: string | null = null;
        if (contacts && Array.isArray((contacts as Record<string, unknown>).contacts)) {
          const contactList = (contacts as Record<string, unknown>).contacts as Array<Record<string, unknown>>;
          if (contactList.length > 0) {
            customerEmail = (contactList[0].email as string) || null;
            customerName = (contactList[0].name as string) || null;
            intercomUserId = (contactList[0].id as string) || null;
          }
        }

        const convId = conversation.id as string;
        const idempotencyKey = `intercom:sync:${convId}:${updatedAt || 'unknown'}`;

        const existingSig = await prisma.signal.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existingSig) continue;

        const contactId = await resolveIntercomContact(
          organizationId,
          customerEmail,
          customerName,
          intercomUserId,
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
        const tagsData = conversation.tags as Record<string, unknown> | undefined;
        const tags: string[] = [];
        if (tagsData && Array.isArray(tagsData.tags)) {
          for (const tag of tagsData.tags as Array<Record<string, unknown>>) {
            if (tag.name) tags.push(tag.name as string);
          }
        }

        const sourceData = conversation.source as Record<string, unknown> | undefined;
        const subject = (sourceData?.subject as string) || (conversation.title as string) || null;
        const priority = (conversation.priority as string) || null;

        const metadata: Record<string, unknown> = {
          conversationId: convId,
          subject,
          customerEmail,
          customerName,
          intercomUserId,
          tags,
          priority,
          state,
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
              : `intercom:${customerEmail || intercomUserId || 'anonymous'}`,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: updatedAt ? new Date(updatedAt * 1000) : new Date(),
          },
        });

        result.signalsCreated++;
      } catch (convErr) {
        const msg = convErr instanceof Error ? convErr.message : 'Unknown error';
        result.errors.push(`Conversation error: ${msg}`);
        logger.error('Intercom conversation sync error', { error: msg });
      }
    }
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : 'Unknown API error';
    result.errors.push(msg);
    logger.error('Intercom API sync error', { error: msg });
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

export async function getIntercomConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'INTERCOM', status: 'ACTIVE' },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification (Intercom uses HMAC-SHA1)
// ---------------------------------------------------------------------------

export function verifyIntercomSignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac('sha1', secret)
    .update(payload)
    .digest('hex');
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

async function resolveIntercomContact(
  organizationId: string,
  email: string | null,
  name: string | null,
  intercomUserId: string | null,
): Promise<string | null> {
  // 1. Try matching by email
  if (email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email },
      select: { id: true },
    });
    if (contact) {
      // Create Intercom identity link if we have an Intercom user ID
      if (intercomUserId) {
        await prisma.contactIdentity.upsert({
          where: {
            type_value: { type: 'INTERCOM', value: intercomUserId },
          },
          create: {
            contactId: contact.id,
            type: 'INTERCOM',
            value: intercomUserId,
            verified: true,
            confidence: 0.9,
          },
          update: {},
        });
      }
      return contact.id;
    }
  }

  // 2. Try matching by Intercom user ID identity
  if (intercomUserId) {
    const identity = await prisma.contactIdentity.findFirst({
      where: { type: 'INTERCOM', value: intercomUserId },
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
      // Create Intercom identity link
      if (intercomUserId) {
        await prisma.contactIdentity.upsert({
          where: {
            type_value: { type: 'INTERCOM', value: intercomUserId },
          },
          create: {
            contactId: contact.id,
            type: 'INTERCOM',
            value: intercomUserId,
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

async function getIntercomSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: { organizationId, type: 'INTERCOM' },
  });
}

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}
