import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { notifyOrgUsers } from './notifications';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Segment webhook payload — covers identify, track, group, page, screen. */
export interface SegmentPayload {
  type: 'identify' | 'track' | 'group' | 'page' | 'screen';
  messageId: string;
  timestamp?: string;
  sentAt?: string;
  userId?: string;
  anonymousId?: string;

  // identify
  traits?: Record<string, unknown>;

  // track
  event?: string;
  properties?: Record<string, unknown>;

  // group
  groupId?: string;

  // page / screen
  name?: string;
  category?: string;

  // context (shared)
  context?: {
    page?: { url?: string; path?: string; title?: string; referrer?: string };
    ip?: string;
    userAgent?: string;
    [key: string]: unknown;
  };
}

/** Batch payload — Segment can wrap multiple events. */
export interface SegmentBatchPayload {
  batch: SegmentPayload[];
  sentAt?: string;
}

export interface SegmentProcessResult {
  processed: boolean;
  type: string;
  entityId?: string;
}

// ---------------------------------------------------------------------------
// HMAC Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verifies a Segment webhook HMAC-SHA1 signature using timing-safe comparison.
 * Segment signs payloads with HMAC-SHA1 and sends the hex digest in the
 * `x-signature` header.
 */
export function verifySegmentSignature(
  payload: string,
  signature: string,
  sharedSecret: string,
): boolean {
  const hmac = crypto.createHmac('sha1', sharedSecret);
  const digest = hmac.update(payload).digest('hex');

  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);

  if (digestBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(digestBuf, signatureBuf);
}

// ---------------------------------------------------------------------------
// Contact Resolution Helpers
// ---------------------------------------------------------------------------

/**
 * Tries to find an existing contact by email, then by anonymousId identity.
 * Returns the contact id or null.
 */
async function resolveContact(
  organizationId: string,
  email?: string,
  anonymousId?: string,
  userId?: string,
): Promise<string | null> {
  // 1. Match by email
  if (email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email },
      select: { id: true },
    });
    if (contact) return contact.id;
  }

  // 2. Match by anonymousId via ContactIdentity
  const lookupValue = anonymousId || userId;
  if (lookupValue) {
    const identity = await prisma.contactIdentity.findFirst({
      where: { type: 'EMAIL', value: lookupValue },
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

  return null;
}

// ---------------------------------------------------------------------------
// Process Identify
// ---------------------------------------------------------------------------

async function processIdentify(
  organizationId: string,
  sourceId: string,
  payload: SegmentPayload,
): Promise<SegmentProcessResult> {
  const traits = payload.traits || {};
  const email = (traits.email as string) || undefined;
  const firstName = (traits.firstName as string) || (traits.first_name as string) || '';
  const lastName = (traits.lastName as string) || (traits.last_name as string) || '';
  const phone = (traits.phone as string) || undefined;
  const title = (traits.title as string) || undefined;
  const avatar = (traits.avatar as string) || undefined;

  // Try to find existing contact
  const existingId = await resolveContact(
    organizationId,
    email,
    payload.anonymousId,
    payload.userId,
  );

  let contactId: string;

  if (existingId) {
    // Update the contact with new traits
    const updateData: Record<string, unknown> = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (title) updateData.title = title;
    if (avatar) updateData.avatar = avatar;

    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: existingId },
        data: updateData,
      });
    }

    contactId = existingId;
  } else {
    // Create new contact
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        firstName: firstName || 'Unknown',
        lastName: lastName || '',
        email: email || null,
        phone: phone || null,
        title: title || null,
        avatar: avatar || null,
      },
    });

    contactId = contact.id;

    // Notify about new contact creation (fire-and-forget)
    notifyOrgUsers(organizationId, {
      type: 'contact_created',
      title: `New contact from Segment: ${firstName || 'Unknown'} ${lastName || ''}`.trim(),
      entityType: 'contact',
      entityId: contactId,
    }).catch((err) => logger.error('Segment identify notification error:', err));

    // Enqueue workflow for contact_created via BullMQ (async with retries)
    enqueueWorkflowExecution(organizationId, 'contact_created', {
      contactId,
      source: 'segment',
      email,
    }).catch((err) => logger.error('Segment contact_created workflow enqueue error:', err));
  }

  // Create/update ContactIdentity records
  if (email) {
    await prisma.contactIdentity.upsert({
      where: { type_value: { type: 'EMAIL', value: email } },
      create: {
        contactId,
        type: 'EMAIL',
        value: email,
        verified: false,
        confidence: 0.9,
      },
      update: { contactId },
    });
  }

  if (payload.anonymousId) {
    await prisma.contactIdentity.upsert({
      where: { type_value: { type: 'IP', value: payload.anonymousId } },
      create: {
        contactId,
        type: 'IP',
        value: payload.anonymousId,
        verified: false,
        confidence: 0.5,
      },
      update: { contactId },
    });
  }

  // Update lastSyncAt on the source
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date() },
  });

  return { processed: true, type: 'identify', entityId: contactId };
}

// ---------------------------------------------------------------------------
// Process Track
// ---------------------------------------------------------------------------

async function processTrack(
  organizationId: string,
  sourceId: string,
  payload: SegmentPayload,
): Promise<SegmentProcessResult> {
  const eventName = payload.event || 'unknown_event';
  const idempotencyKey = `seg_${payload.messageId}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { processed: true, type: eventName, entityId: existing.id };
  }

  // Resolve actor
  const actorId = await resolveContact(
    organizationId,
    undefined,
    payload.anonymousId,
    payload.userId,
  );

  // Resolve account from actor's company
  let accountId: string | null = null;
  if (actorId) {
    const contact = await prisma.contact.findFirst({
      where: { id: actorId, organizationId },
      select: { companyId: true },
    });
    if (contact?.companyId) {
      accountId = contact.companyId;
    }
  }

  const signal = await prisma.signal.create({
    data: {
      organizationId,
      sourceId,
      type: eventName,
      actorId: actorId || null,
      accountId,
      anonymousId: payload.anonymousId || null,
      metadata: (payload.properties || {}) as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    },
  });

  // Enqueue workflow for signal_received via BullMQ (async with retries)
  enqueueWorkflowExecution(organizationId, 'signal_received', {
    signalId: signal.id,
    type: eventName,
    accountId,
    actorId,
    metadata: payload.properties || {},
  }).catch((err) => logger.error('Segment track workflow enqueue error:', err));

  // Update lastSyncAt
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date() },
  });

  return { processed: true, type: eventName, entityId: signal.id };
}

// ---------------------------------------------------------------------------
// Process Group
// ---------------------------------------------------------------------------

async function processGroup(
  organizationId: string,
  sourceId: string,
  payload: SegmentPayload,
): Promise<SegmentProcessResult> {
  const traits = payload.traits || {};
  const name = (traits.name as string) || undefined;
  const domain = (traits.domain as string) || (traits.website as string) || undefined;
  const industry = (traits.industry as string) || undefined;
  const sizeRaw = (traits.size as string) || (traits.employees as string) || undefined;

  // Map size string to CompanySize enum
  const sizeMap: Record<string, string> = {
    startup: 'STARTUP',
    small: 'SMALL',
    medium: 'MEDIUM',
    large: 'LARGE',
    enterprise: 'ENTERPRISE',
  };
  const size = sizeRaw ? sizeMap[sizeRaw.toLowerCase()] || undefined : undefined;

  let companyId: string | undefined;

  // Try to find company by domain first
  if (domain) {
    const existing = await prisma.company.findFirst({
      where: { organizationId, domain },
      select: { id: true },
    });
    if (existing) {
      // Update
      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (industry) updateData.industry = industry;
      if (size) updateData.size = size;

      if (Object.keys(updateData).length > 0) {
        await prisma.company.update({
          where: { id: existing.id },
          data: updateData,
        });
      }
      companyId = existing.id;
    }
  }

  // Try by name if no domain match
  if (!companyId && name) {
    const existing = await prisma.company.findFirst({
      where: { organizationId, name },
      select: { id: true },
    });
    if (existing) {
      const updateData: Record<string, unknown> = {};
      if (domain) updateData.domain = domain;
      if (industry) updateData.industry = industry;
      if (size) updateData.size = size;

      if (Object.keys(updateData).length > 0) {
        await prisma.company.update({
          where: { id: existing.id },
          data: updateData,
        });
      }
      companyId = existing.id;
    }
  }

  // Create new company if not found
  if (!companyId) {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: name || payload.groupId || 'Unknown Company',
        domain: domain || null,
        industry: industry || null,
        ...(size ? { size: size as 'STARTUP' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE' } : {}),
      },
    });
    companyId = company.id;
  }

  // Link the calling user's contact to this company if not already linked
  const actorId = await resolveContact(
    organizationId,
    undefined,
    payload.anonymousId,
    payload.userId,
  );

  if (actorId) {
    const contact = await prisma.contact.findFirst({
      where: { id: actorId, organizationId },
      select: { id: true, companyId: true },
    });

    if (contact && !contact.companyId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { companyId },
      });
    }
  }

  // Update lastSyncAt
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date() },
  });

  return { processed: true, type: 'group', entityId: companyId };
}

// ---------------------------------------------------------------------------
// Process Page / Screen
// ---------------------------------------------------------------------------

async function processPageOrScreen(
  organizationId: string,
  sourceId: string,
  payload: SegmentPayload,
): Promise<SegmentProcessResult> {
  const signalType = payload.type === 'page' ? 'page_view' : 'screen_view';
  const idempotencyKey = `seg_${payload.messageId}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { processed: true, type: signalType, entityId: existing.id };
  }

  // Resolve actor
  const actorId = await resolveContact(
    organizationId,
    undefined,
    payload.anonymousId,
    payload.userId,
  );

  // Resolve account
  let accountId: string | null = null;
  if (actorId) {
    const contact = await prisma.contact.findFirst({
      where: { id: actorId, organizationId },
      select: { companyId: true },
    });
    if (contact?.companyId) {
      accountId = contact.companyId;
    }
  }

  const contextPage = payload.context?.page || {};
  const metadata: Record<string, unknown> = {
    url: contextPage.url || (payload.properties as Record<string, unknown>)?.url || null,
    path: contextPage.path || (payload.properties as Record<string, unknown>)?.path || null,
    title: contextPage.title || payload.name || null,
    referrer: contextPage.referrer || (payload.properties as Record<string, unknown>)?.referrer || null,
    category: payload.category || null,
    properties: payload.properties || {},
  };

  const signal = await prisma.signal.create({
    data: {
      organizationId,
      sourceId,
      type: signalType,
      actorId: actorId || null,
      accountId,
      anonymousId: payload.anonymousId || null,
      metadata: metadata as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    },
  });

  // Enqueue workflow for signal_received via BullMQ (async with retries)
  enqueueWorkflowExecution(organizationId, 'signal_received', {
    signalId: signal.id,
    type: signalType,
    accountId,
    actorId,
    metadata,
  }).catch((err) => logger.error('Segment page/screen workflow enqueue error:', err));

  // Update lastSyncAt
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date() },
  });

  return { processed: true, type: signalType, entityId: signal.id };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Processes a single Segment webhook payload.
 * Routes to the appropriate handler based on payload.type.
 */
export async function processSegmentPayload(
  organizationId: string,
  sourceId: string,
  payload: SegmentPayload,
): Promise<SegmentProcessResult> {
  switch (payload.type) {
    case 'identify':
      return processIdentify(organizationId, sourceId, payload);

    case 'track':
      return processTrack(organizationId, sourceId, payload);

    case 'group':
      return processGroup(organizationId, sourceId, payload);

    case 'page':
    case 'screen':
      return processPageOrScreen(organizationId, sourceId, payload);

    default:
      logger.warn('Segment: unrecognized payload type', {
        type: (payload as unknown as Record<string, unknown>).type,
        messageId: payload.messageId,
      });
      return { processed: false, type: String((payload as unknown as Record<string, unknown>).type) };
  }
}
