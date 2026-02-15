import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EVENTS_PER_FETCH = 100;

/** Low-value events that should be silently dropped. */
const SKIP_EVENTS = new Set(['$pageleave', '$autocapture']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostHogConnectorConfig {
  host: string; // e.g. "app.posthog.com" or self-hosted URL
  projectId: string;
  personalApiKey: string;
  trackedEvents: string[]; // e.g. ["$pageview", "signup", "feature_used"]
  webhookSecret: string | null;
  lastSyncAt: string | null;
  lastSyncResult: PostHogSyncResult | null;
}

export interface PostHogSyncResult {
  eventsProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface PostHogStatus {
  connected: boolean;
  host: string | null;
  projectId: string | null;
  trackedEvents: string[];
  webhookUrl: string | null;
  lastSyncAt: string | null;
  lastSyncResult: PostHogSyncResult | null;
  sourceId: string | null;
}

interface PostHogEvent {
  id: string;
  uuid: string;
  event: string;
  distinct_id: string;
  properties: Record<string, unknown>;
  timestamp: string;
  elements?: unknown[];
  person?: {
    distinct_ids?: string[];
    properties?: Record<string, unknown>;
  };
}

interface PostHogEventsResponse {
  results: PostHogEvent[];
  next?: string | null;
}

// ---------------------------------------------------------------------------
// Signal Type Mapping
// ---------------------------------------------------------------------------

const EVENT_TYPE_MAP: Record<string, string> = {
  $pageview: 'page_view',
  signup: 'signup',
  sign_up: 'signup',
  signed_up: 'signup',
  feature_used: 'feature_usage',
  feature_usage: 'feature_usage',
};

function mapEventToSignalType(eventName: string): string {
  const mapped = EVENT_TYPE_MAP[eventName];
  if (mapped) return mapped;

  // Sanitize custom event names: lowercase, replace non-alphanumeric with underscore
  const sanitized = eventName
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return `posthog_${sanitized}`;
}

// ---------------------------------------------------------------------------
// PostHog REST API Client
// ---------------------------------------------------------------------------

async function posthogFetch<T>(
  host: string,
  apiKey: string,
  path: string,
): Promise<T> {
  const baseUrl = host.startsWith('http') ? host : `https://${host}`;
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 5000;
    logger.warn('PostHog rate limited, waiting', { path, waitMs });
    await sleep(waitMs);
    return posthogFetch<T>(host, apiKey, path);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `PostHog API error ${response.status}: ${response.statusText} - ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API: Configure PostHog
// ---------------------------------------------------------------------------

export async function configurePostHog(
  organizationId: string,
  config: {
    host?: string;
    projectId: string;
    personalApiKey: string;
    trackedEvents?: string[];
    webhookSecret?: string;
  },
): Promise<{ sourceId: string; webhookUrl: string }> {
  const host = config.host || 'app.posthog.com';
  const trackedEvents = config.trackedEvents?.length
    ? config.trackedEvents
    : ['$pageview', 'signup', 'feature_used'];

  // Validate the API key by making a test request
  try {
    await posthogFetch(host, config.personalApiKey, `/api/projects/${config.projectId}/`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to validate PostHog credentials: ${msg}`);
  }

  const connectorConfig: PostHogConnectorConfig = {
    host,
    projectId: config.projectId,
    personalApiKey: config.personalApiKey,
    trackedEvents,
    webhookSecret: config.webhookSecret || null,
    lastSyncAt: null,
    lastSyncResult: null,
  };

  // Upsert signal source
  const existing = await getPostHogSource(organizationId);

  let sourceId: string;

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name: `PostHog: Project ${config.projectId}`,
        config: connectorConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
    sourceId = existing.id;
  } else {
    const source = await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'POSTHOG',
        name: `PostHog: Project ${config.projectId}`,
        config: connectorConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
    sourceId = source.id;
  }

  // Build the webhook URL for PostHog project settings
  const webhookUrl = buildWebhookUrl(sourceId);

  return { sourceId, webhookUrl };
}

// ---------------------------------------------------------------------------
// Public API: Get PostHog Status
// ---------------------------------------------------------------------------

export async function getPostHogStatus(
  organizationId: string,
): Promise<PostHogStatus> {
  const source = await getPostHogSource(organizationId);
  if (!source) {
    return {
      connected: false,
      host: null,
      projectId: null,
      trackedEvents: [],
      webhookUrl: null,
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
    };
  }

  const cfg = source.config as unknown as PostHogConnectorConfig;

  return {
    connected: true,
    host: cfg.host,
    projectId: cfg.projectId,
    trackedEvents: cfg.trackedEvents || [],
    webhookUrl: buildWebhookUrl(source.id),
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect PostHog
// ---------------------------------------------------------------------------

export async function disconnectPostHog(
  organizationId: string,
): Promise<void> {
  const source = await getPostHogSource(organizationId);
  if (!source) {
    throw new Error('PostHog is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Handle Inbound PostHog Webhook
// ---------------------------------------------------------------------------

export async function handlePostHogWebhook(
  sourceId: string,
  payload: Record<string, unknown>,
  signature?: string,
): Promise<{ processed: boolean; signalType?: string; signalsCreated: number }> {
  // Find the source by ID
  const source = await prisma.signalSource.findUnique({
    where: { id: sourceId },
  });

  if (!source || source.type !== 'POSTHOG') {
    throw new Error('PostHog source not found');
  }

  const cfg = source.config as unknown as PostHogConnectorConfig;

  // Verify webhook signature if secret is configured
  if (cfg.webhookSecret && signature) {
    const expectedSig = crypto
      .createHmac('sha256', cfg.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (signature !== expectedSig) {
      throw new Error('Invalid webhook signature');
    }
  }

  // PostHog webhooks can send different payload shapes.
  // The most common shapes:
  // 1. Action webhook: { event: string, distinct_id: string, properties: {...}, ... }
  // 2. Batch/activity: { data: { event, ... } }

  const events = normalizeWebhookPayload(payload);

  let signalsCreated = 0;
  let lastSignalType: string | undefined;

  for (const event of events) {
    const eventName = event.event;

    // Skip low-value events
    if (SKIP_EVENTS.has(eventName)) continue;

    // Check if this event is tracked (if trackedEvents is set)
    if (cfg.trackedEvents.length > 0 && !cfg.trackedEvents.includes(eventName)) {
      continue;
    }

    const signalType = mapEventToSignalType(eventName);
    lastSignalType = signalType;

    const idempotencyKey = `posthog_wh:${event.uuid || event.id || `${event.distinct_id}:${event.timestamp}`}`;

    // Check idempotency
    const existing = await prisma.signal.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) continue;

    // Resolve identity from distinct_id + person properties
    const { contactId, accountId } = await resolvePostHogIdentity(
      source.organizationId,
      event.distinct_id,
      extractEmail(event),
    );

    // Build signal metadata
    const metadata = buildSignalMetadata(event);

    await prisma.signal.create({
      data: {
        organizationId: source.organizationId,
        sourceId: source.id,
        type: signalType,
        actorId: contactId || null,
        accountId: accountId || null,
        anonymousId: contactId ? null : `posthog:${event.distinct_id}`,
        metadata: metadata as Prisma.InputJsonValue,
        idempotencyKey,
        timestamp: new Date(event.timestamp || Date.now()),
      },
    });

    signalsCreated++;

    // Enqueue workflow for signal_received
    enqueueWorkflowExecution(source.organizationId, 'signal_received', {
      signalId: idempotencyKey,
      type: signalType,
      accountId,
      actorId: contactId,
      metadata,
    }).catch((err) =>
      logger.error('PostHog webhook workflow enqueue error:', err),
    );
  }

  // Update lastSyncAt
  if (signalsCreated > 0) {
    await prisma.signalSource.update({
      where: { id: source.id },
      data: { lastSyncAt: new Date() },
    });
  }

  return { processed: true, signalType: lastSignalType, signalsCreated };
}

// ---------------------------------------------------------------------------
// Public API: Sync PostHog Events (API polling mode)
// ---------------------------------------------------------------------------

export async function syncPostHogEvents(
  organizationId: string,
): Promise<PostHogSyncResult> {
  const source = await getPostHogSource(organizationId);
  if (!source) {
    throw new Error('PostHog is not connected for this organization');
  }

  const cfg = source.config as unknown as PostHogConnectorConfig;

  // Determine the "since" cutoff (last sync or 24 hours ago)
  const since = cfg.lastSyncAt
    ? new Date(cfg.lastSyncAt)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result: PostHogSyncResult = {
    eventsProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  for (const eventName of cfg.trackedEvents) {
    try {
      const afterIso = since.toISOString();
      const path = `/api/projects/${cfg.projectId}/events?event=${encodeURIComponent(eventName)}&after=${encodeURIComponent(afterIso)}&limit=${MAX_EVENTS_PER_FETCH}`;

      const response = await posthogFetch<PostHogEventsResponse>(
        cfg.host,
        cfg.personalApiKey,
        path,
      );

      const events = response.results || [];

      for (const event of events) {
        result.eventsProcessed++;

        // Skip low-value events
        if (SKIP_EVENTS.has(event.event)) continue;

        const signalType = mapEventToSignalType(event.event);
        const idempotencyKey = `posthog:${event.uuid || event.id}`;

        // Check idempotency
        const existing = await prisma.signal.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) continue;

        // Resolve identity
        const email = extractEmail(event);
        const { contactId, accountId } = await resolvePostHogIdentity(
          organizationId,
          event.distinct_id,
          email,
        );

        if (contactId) result.contactsResolved++;

        // Build metadata
        const metadata = buildSignalMetadata(event);

        await prisma.signal.create({
          data: {
            organizationId,
            sourceId: source.id,
            type: signalType,
            actorId: contactId || null,
            accountId: accountId || null,
            anonymousId: contactId ? null : `posthog:${event.distinct_id}`,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: new Date(event.timestamp),
          },
        });

        result.signalsCreated++;

        // Enqueue workflow
        enqueueWorkflowExecution(organizationId, 'signal_received', {
          signalId: idempotencyKey,
          type: signalType,
          accountId,
          actorId: contactId,
          metadata,
        }).catch((err) =>
          logger.error('PostHog sync workflow enqueue error:', err),
        );
      }

      // Small delay between event type queries for rate limiting
      if (cfg.trackedEvents.indexOf(eventName) < cfg.trackedEvents.length - 1) {
        await sleep(200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Event "${eventName}": ${msg}`);
      logger.error('PostHog sync error for event type', {
        eventName,
        error: msg,
      });
    }
  }

  // Update config with sync result
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

export async function getPostHogConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'POSTHOG', status: 'ACTIVE' },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolvePostHogIdentity(
  organizationId: string,
  distinctId: string,
  email: string | null,
): Promise<{ contactId: string | null; accountId: string | null }> {
  let contactId: string | null = null;
  let accountId: string | null = null;

  // 1. Try matching by existing PostHog identity
  const identity = await prisma.contactIdentity.findFirst({
    where: { type: 'POSTHOG', value: distinctId },
    include: {
      contact: {
        select: { id: true, organizationId: true, companyId: true },
      },
    },
  });

  if (identity && identity.contact.organizationId === organizationId) {
    contactId = identity.contact.id;
    accountId = identity.contact.companyId;
    return { contactId, accountId };
  }

  // 2. Try matching by email
  if (email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email },
      select: { id: true, companyId: true },
    });

    if (contact) {
      contactId = contact.id;
      accountId = contact.companyId;

      // Create PostHog identity link
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'POSTHOG', value: distinctId },
        },
        create: {
          contactId: contact.id,
          type: 'POSTHOG',
          value: distinctId,
          verified: true,
          confidence: 0.9,
        },
        update: { contactId: contact.id },
      });

      return { contactId, accountId };
    }

    // 3. Try matching by email identity
    const emailIdentity = await prisma.contactIdentity.findFirst({
      where: { type: 'EMAIL', value: email },
      include: {
        contact: {
          select: { id: true, organizationId: true, companyId: true },
        },
      },
    });

    if (emailIdentity && emailIdentity.contact.organizationId === organizationId) {
      contactId = emailIdentity.contact.id;
      accountId = emailIdentity.contact.companyId;

      // Create PostHog identity link
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'POSTHOG', value: distinctId },
        },
        create: {
          contactId: emailIdentity.contact.id,
          type: 'POSTHOG',
          value: distinctId,
          verified: true,
          confidence: 0.85,
        },
        update: { contactId: emailIdentity.contact.id },
      });

      return { contactId, accountId };
    }
  }

  // 4. If distinct_id looks like an email, try that
  if (distinctId.includes('@') && !email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email: distinctId },
      select: { id: true, companyId: true },
    });

    if (contact) {
      contactId = contact.id;
      accountId = contact.companyId;

      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'POSTHOG', value: distinctId },
        },
        create: {
          contactId: contact.id,
          type: 'POSTHOG',
          value: distinctId,
          verified: true,
          confidence: 0.95,
        },
        update: { contactId: contact.id },
      });

      return { contactId, accountId };
    }
  }

  return { contactId, accountId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPostHogSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: { organizationId, type: 'POSTHOG' },
  });
}

function buildWebhookUrl(sourceId: string): string {
  const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'https://app.devsignal.io';
  return `${baseUrl}/api/v1/webhooks/posthog/${sourceId}`;
}

/**
 * Extract email from PostHog event. PostHog stores user properties in multiple places:
 * - properties.$set.email (identify calls)
 * - properties.$user_email
 * - person.properties.email
 * - distinct_id (if it looks like an email)
 */
function extractEmail(event: PostHogEvent): string | null {
  const props = event.properties || {};

  // Check $set properties (from identify calls)
  const setProps = props.$set as Record<string, unknown> | undefined;
  if (setProps?.email && typeof setProps.email === 'string') {
    return setProps.email;
  }

  // Check direct properties
  if (props.email && typeof props.email === 'string') {
    return props.email;
  }

  // Check $user_email
  if (props.$user_email && typeof props.$user_email === 'string') {
    return props.$user_email as string;
  }

  // Check person properties
  if (event.person?.properties?.email && typeof event.person.properties.email === 'string') {
    return event.person.properties.email as string;
  }

  // Check if distinct_id looks like an email
  if (event.distinct_id && event.distinct_id.includes('@') && event.distinct_id.includes('.')) {
    return event.distinct_id;
  }

  return null;
}

/**
 * Build signal metadata from a PostHog event. Select relevant properties and
 * limit payload size.
 */
function buildSignalMetadata(event: PostHogEvent): Record<string, unknown> {
  const props = event.properties || {};

  return {
    event: event.event,
    distinctId: event.distinct_id,
    url: props.$current_url || null,
    pathname: props.$pathname || null,
    referrer: props.$referrer || null,
    browser: props.$browser || null,
    browserVersion: props.$browser_version || null,
    os: props.$os || null,
    deviceType: props.$device_type || null,
    lib: props.$lib || null,
    libVersion: props.$lib_version || null,
    // Include select custom properties (limit size)
    customProperties: pickCustomProperties(props),
    posthogEventId: event.uuid || event.id,
  };
}

/** Pick non-internal custom properties from the event, limiting to 20 keys. */
function pickCustomProperties(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const custom: Record<string, unknown> = {};
  let count = 0;

  for (const [key, value] of Object.entries(props)) {
    // Skip PostHog internal properties (start with $ or are too large)
    if (key.startsWith('$')) continue;
    if (key === 'token' || key === 'api_key') continue;

    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (strValue && strValue.length > 500) continue;

    custom[key] = value;
    count++;
    if (count >= 20) break;
  }

  return custom;
}

/**
 * Normalize the webhook payload into an array of events.
 * PostHog webhooks can send different shapes depending on the trigger type.
 */
function normalizeWebhookPayload(
  payload: Record<string, unknown>,
): PostHogEvent[] {
  // Shape 1: Single event object with "event" field
  if (typeof payload.event === 'string' && typeof payload.distinct_id === 'string') {
    return [
      {
        id: (payload.id as string) || '',
        uuid: (payload.uuid as string) || `${payload.distinct_id}:${Date.now()}`,
        event: payload.event as string,
        distinct_id: payload.distinct_id as string,
        properties: (payload.properties as Record<string, unknown>) || {},
        timestamp: (payload.timestamp as string) || new Date().toISOString(),
        person: payload.person as PostHogEvent['person'],
      },
    ];
  }

  // Shape 2: Nested data object
  if (payload.data && typeof payload.data === 'object') {
    const data = payload.data as Record<string, unknown>;
    if (typeof data.event === 'string' && typeof data.distinct_id === 'string') {
      return [
        {
          id: (data.id as string) || '',
          uuid: (data.uuid as string) || `${data.distinct_id}:${Date.now()}`,
          event: data.event as string,
          distinct_id: data.distinct_id as string,
          properties: (data.properties as Record<string, unknown>) || {},
          timestamp: (data.timestamp as string) || new Date().toISOString(),
          person: data.person as PostHogEvent['person'],
        },
      ];
    }
  }

  // Shape 3: Batch array
  if (Array.isArray(payload.batch)) {
    return (payload.batch as Record<string, unknown>[])
      .filter((e) => typeof e.event === 'string')
      .map((e) => ({
        id: (e.id as string) || '',
        uuid: (e.uuid as string) || `${e.distinct_id}:${Date.now()}`,
        event: e.event as string,
        distinct_id: (e.distinct_id as string) || '',
        properties: (e.properties as Record<string, unknown>) || {},
        timestamp: (e.timestamp as string) || new Date().toISOString(),
        person: e.person as PostHogEvent['person'],
      }));
  }

  logger.warn('Unrecognized PostHog webhook payload shape', {
    keys: Object.keys(payload),
  });
  return [];
}
