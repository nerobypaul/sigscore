import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SE_API_BASE = 'https://api.stackexchange.com/2.3';
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_DELAY_MS = 1_000; // 1 second between API calls
const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StackOverflowConfig {
  trackedTags: string[];
  apiKey: string | null;
  lastSyncAt: string | null;
  lastSyncResult: StackOverflowSyncResult | null;
}

export interface StackOverflowSyncResult {
  questionsProcessed: number;
  answersProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface StackOverflowStatus {
  connected: boolean;
  trackedTags: string[];
  hasApiKey: boolean;
  lastSyncAt: string | null;
  lastSyncResult: StackOverflowSyncResult | null;
  sourceId: string | null;
}

interface SEQuestion {
  question_id: number;
  title: string;
  link: string;
  tags: string[];
  score: number;
  view_count: number;
  answer_count: number;
  is_answered: boolean;
  creation_date: number; // Unix timestamp
  last_activity_date: number;
  owner: SEUser;
  body?: string;
}

interface SEAnswer {
  answer_id: number;
  question_id: number;
  score: number;
  is_accepted: boolean;
  creation_date: number;
  last_activity_date: number;
  owner: SEUser;
  body?: string;
}

interface SEUser {
  user_id?: number;
  display_name: string;
  link?: string;
  profile_image?: string;
  user_type?: string;
  reputation?: number;
  website_url?: string;
}

interface SEResponse<T> {
  items: T[];
  has_more: boolean;
  quota_max: number;
  quota_remaining: number;
  backoff?: number; // seconds to wait before next request
}

// ---------------------------------------------------------------------------
// Stack Exchange API Client
// ---------------------------------------------------------------------------

async function seFetch<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string | null,
): Promise<SEResponse<T>> {
  const searchParams = new URLSearchParams(params);
  if (apiKey) {
    searchParams.set('key', apiKey);
  }

  const url = `${SE_API_BASE}${path}?${searchParams.toString()}`;

  const response = await fetch(url, {
    headers: { 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 30_000;
    logger.warn('Stack Exchange rate limited, waiting', { path, waitMs });
    await sleep(waitMs);
    return seFetch<T>(path, params, apiKey);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Stack Exchange API error ${response.status}: ${response.statusText} - ${errorBody}`,
    );
  }

  const data = (await response.json()) as SEResponse<T>;

  // Respect backoff header if present
  if (data.backoff) {
    logger.warn('Stack Exchange backoff requested', {
      path,
      backoffSeconds: data.backoff,
    });
    await sleep(data.backoff * 1000);
  }

  // Log quota usage
  if (data.quota_remaining < 50) {
    logger.warn('Stack Exchange quota low', {
      remaining: data.quota_remaining,
      max: data.quota_max,
    });
  }

  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API: Configure Stack Overflow Tracking
// ---------------------------------------------------------------------------

/**
 * Save tracked tags and optional API key for Stack Overflow monitoring.
 */
export async function configureStackOverflow(
  organizationId: string,
  config: { trackedTags: string[]; apiKey?: string | null },
): Promise<void> {
  const existing = await getStackOverflowSource(organizationId);

  const soConfig: StackOverflowConfig = {
    trackedTags: config.trackedTags.map((t) => t.trim().toLowerCase()),
    apiKey: config.apiKey ?? null,
    lastSyncAt: existing
      ? ((existing.config as unknown as StackOverflowConfig)?.lastSyncAt ??
        null)
      : null,
    lastSyncResult: existing
      ? ((existing.config as unknown as StackOverflowConfig)
          ?.lastSyncResult ?? null)
      : null,
  };

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name: `Stack Overflow: ${soConfig.trackedTags.join(', ')}`,
        config: soConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
  } else {
    await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'STACKOVERFLOW',
        name: `Stack Overflow: ${soConfig.trackedTags.join(', ')}`,
        config: soConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Public API: Get Config
// ---------------------------------------------------------------------------

export async function getStackOverflowConfig(
  organizationId: string,
): Promise<StackOverflowConfig | null> {
  const source = await getStackOverflowSource(organizationId);
  if (!source) return null;
  return source.config as unknown as StackOverflowConfig;
}

// ---------------------------------------------------------------------------
// Public API: Get Status
// ---------------------------------------------------------------------------

export async function getStackOverflowStatus(
  organizationId: string,
): Promise<StackOverflowStatus> {
  const source = await getStackOverflowSource(organizationId);
  if (!source) {
    return {
      connected: false,
      trackedTags: [],
      hasApiKey: false,
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
    };
  }

  const cfg = source.config as unknown as StackOverflowConfig;

  return {
    connected: true,
    trackedTags: cfg.trackedTags || [],
    hasApiKey: !!cfg.apiKey,
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect
// ---------------------------------------------------------------------------

export async function disconnectStackOverflow(
  organizationId: string,
): Promise<void> {
  const source = await getStackOverflowSource(organizationId);
  if (!source) {
    throw new Error(
      'Stack Overflow is not connected for this organization',
    );
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Sync Stack Overflow
// ---------------------------------------------------------------------------

/**
 * Main sync: fetches recent questions and answers for all tracked tags,
 * resolves identities, and creates signals.
 */
export async function syncStackOverflow(
  organizationId: string,
): Promise<StackOverflowSyncResult> {
  const source = await getStackOverflowSource(organizationId);
  if (!source) {
    throw new Error(
      'Stack Overflow is not connected for this organization',
    );
  }

  const cfg = source.config as unknown as StackOverflowConfig;

  if (!cfg.trackedTags || cfg.trackedTags.length === 0) {
    return {
      questionsProcessed: 0,
      answersProcessed: 0,
      signalsCreated: 0,
      contactsResolved: 0,
      errors: ['No tags configured for tracking'],
    };
  }

  // Determine the "since" cutoff (last sync or 7 days ago)
  const since = cfg.lastSyncAt
    ? new Date(cfg.lastSyncAt)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const fromDate = Math.floor(since.getTime() / 1000); // Unix timestamp

  const result: StackOverflowSyncResult = {
    questionsProcessed: 0,
    answersProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  // Process each tracked tag
  for (const tag of cfg.trackedTags) {
    try {
      await syncTag(
        organizationId,
        source.id,
        tag,
        fromDate,
        cfg.apiKey,
        result,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Tag [${tag}]: ${msg}`);
      logger.error('Stack Overflow sync error for tag', {
        tag,
        error: msg,
      });
    }

    // Rate limit between tags
    await sleep(RATE_LIMIT_DELAY_MS);
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

export async function getStackOverflowConnectedOrganizations(): Promise<
  string[]
> {
  // We store SO connectors as type CUSTOM with a name prefix
  const sources = await prisma.signalSource.findMany({
    where: {
      type: 'STACKOVERFLOW',
      status: 'ACTIVE',
      name: { startsWith: 'Stack Overflow:' },
    },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Internal: Sync a single tag
// ---------------------------------------------------------------------------

async function syncTag(
  organizationId: string,
  sourceId: string,
  tag: string,
  fromDate: number,
  apiKey: string | null,
  result: StackOverflowSyncResult,
): Promise<void> {
  // Fetch recent questions for this tag
  const questionsResponse = await seFetch<SEQuestion>('/questions', {
    order: 'desc',
    sort: 'activity',
    tagged: tag,
    site: 'stackoverflow',
    fromdate: fromDate.toString(),
    filter: '!nNPvSNdWme', // includes body, owner details
    pagesize: MAX_PAGE_SIZE.toString(),
  }, apiKey);

  const questions = questionsResponse.items;
  const questionIds: number[] = [];

  for (const question of questions) {
    result.questionsProcessed++;
    questionIds.push(question.question_id);

    const idempotencyKey = `stackoverflow:q:${question.question_id}`;

    // Check idempotency
    const existing = await prisma.signal.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) continue;

    // Resolve contact from question owner
    const contactId = await resolveStackOverflowContact(
      organizationId,
      question.owner,
    );
    if (contactId) result.contactsResolved++;

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
      title: question.title,
      url: question.link,
      tags: question.tags,
      score: question.score,
      views: question.view_count,
      answers: question.answer_count,
      isAnswered: question.is_answered,
      stackoverflow_question_id: question.question_id,
      stackoverflow_user_id: question.owner.user_id,
      stackoverflow_user_name: question.owner.display_name,
      tracked_tag: tag,
    };

    // Create signal
    await prisma.signal.create({
      data: {
        organizationId,
        sourceId,
        type: 'stackoverflow_question',
        actorId: contactId || null,
        accountId,
        anonymousId: contactId
          ? null
          : question.owner.user_id
            ? `stackoverflow:${question.owner.user_id}`
            : null,
        metadata: metadata as Prisma.InputJsonValue,
        idempotencyKey,
        timestamp: new Date(question.creation_date * 1000),
      },
    });

    result.signalsCreated++;

    // Enqueue workflow for signal_received
    enqueueWorkflowExecution(organizationId, 'signal_received', {
      signalId: idempotencyKey,
      type: 'stackoverflow_question',
      accountId,
      actorId: contactId,
      metadata,
    }).catch((err) =>
      logger.error('SO question workflow enqueue error:', err),
    );
  }

  // Fetch answers for these questions (batch by 100 IDs max)
  if (questionIds.length > 0) {
    await sleep(RATE_LIMIT_DELAY_MS);

    try {
      // Stack Exchange allows semicolon-separated IDs
      const ids = questionIds.join(';');
      const answersResponse = await seFetch<SEAnswer>(
        `/questions/${ids}/answers`,
        {
          order: 'desc',
          sort: 'activity',
          site: 'stackoverflow',
          fromdate: fromDate.toString(),
          filter: '!nNPvSNdWme',
          pagesize: MAX_PAGE_SIZE.toString(),
        },
        apiKey,
      );

      for (const answer of answersResponse.items) {
        result.answersProcessed++;

        const idempotencyKey = `stackoverflow:a:${answer.answer_id}`;

        // Check idempotency
        const existing = await prisma.signal.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) continue;

        // Resolve contact from answer owner
        const contactId = await resolveStackOverflowContact(
          organizationId,
          answer.owner,
        );
        if (contactId) result.contactsResolved++;

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
          url: `https://stackoverflow.com/a/${answer.answer_id}`,
          stackoverflow_answer_id: answer.answer_id,
          stackoverflow_question_id: answer.question_id,
          score: answer.score,
          isAccepted: answer.is_accepted,
          stackoverflow_user_id: answer.owner.user_id,
          stackoverflow_user_name: answer.owner.display_name,
          tracked_tag: tag,
        };

        // Create signal
        await prisma.signal.create({
          data: {
            organizationId,
            sourceId,
            type: 'stackoverflow_answer',
            actorId: contactId || null,
            accountId,
            anonymousId: contactId
              ? null
              : answer.owner.user_id
                ? `stackoverflow:${answer.owner.user_id}`
                : null,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: new Date(answer.creation_date * 1000),
          },
        });

        result.signalsCreated++;

        // Enqueue workflow for signal_received
        enqueueWorkflowExecution(organizationId, 'signal_received', {
          signalId: idempotencyKey,
          type: 'stackoverflow_answer',
          accountId,
          actorId: contactId,
          metadata,
        }).catch((err) =>
          logger.error('SO answer workflow enqueue error:', err),
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Answers for tag [${tag}]: ${msg}`);
      logger.error('Stack Overflow answers sync error', {
        tag,
        error: msg,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolveStackOverflowContact(
  organizationId: string,
  owner: SEUser,
): Promise<string | null> {
  if (!owner.user_id) return null;

  const soUserId = owner.user_id.toString();

  // 1. Try matching by existing Stack Overflow identity
  const identity = await prisma.contactIdentity.findFirst({
    where: { type: 'STACKOVERFLOW', value: `stackoverflow:${soUserId}` },
    include: {
      contact: {
        select: { id: true, organizationId: true },
      },
    },
  });

  if (identity && identity.contact.organizationId === organizationId) {
    return identity.contact.id;
  }

  // 2. Try to extract domain from website_url for company matching
  if (owner.website_url) {
    try {
      const url = new URL(
        owner.website_url.startsWith('http')
          ? owner.website_url
          : `https://${owner.website_url}`,
      );
      const domain = url.hostname.replace(/^www\./, '');

      // Skip common free hosting / personal domains
      if (!isFreeHostingDomain(domain)) {
        // Try to find a company by this domain
        const company = await prisma.company.findFirst({
          where: {
            organizationId,
            OR: [
              { website: { contains: domain, mode: 'insensitive' } },
              { domain: { equals: domain, mode: 'insensitive' } },
            ],
          },
          select: { id: true },
        });

        if (company) {
          // Find any contact in that company
          const contact = await prisma.contact.findFirst({
            where: { organizationId, companyId: company.id },
            select: { id: true },
          });

          if (contact) {
            // Create SO identity link
            await prisma.contactIdentity.upsert({
              where: {
                type_value: {
                  type: 'STACKOVERFLOW',
                  value: `stackoverflow:${soUserId}`,
                },
              },
              create: {
                contactId: contact.id,
                type: 'STACKOVERFLOW',
                value: `stackoverflow:${soUserId}`,
                verified: false,
                confidence: 0.5,
              },
              update: {},
            });

            return contact.id;
          }
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // 3. Try matching by display name (first + last name)
  const displayName = owner.display_name;
  if (displayName && displayName.includes(' ')) {
    const parts = displayName.split(' ');
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
      // Create SO identity link with lower confidence
      await prisma.contactIdentity.upsert({
        where: {
          type_value: {
            type: 'STACKOVERFLOW',
            value: `stackoverflow:${soUserId}`,
          },
        },
        create: {
          contactId: contact.id,
          type: 'STACKOVERFLOW',
          value: `stackoverflow:${soUserId}`,
          verified: false,
          confidence: 0.4,
        },
        update: {},
      });

      return contact.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getStackOverflowSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: {
      organizationId,
      type: 'STACKOVERFLOW',
      name: { startsWith: 'Stack Overflow:' },
    },
  });
}

const FREE_HOSTING_DOMAINS = new Set([
  'github.io',
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'stackoverflow.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'medium.com',
  'dev.to',
  'hashnode.dev',
  'wordpress.com',
  'blogspot.com',
  'tumblr.com',
  'about.me',
  'codepen.io',
  'repl.it',
  'netlify.app',
  'vercel.app',
  'herokuapp.com',
  'firebase.com',
  'google.com',
  'youtube.com',
  'facebook.com',
]);

function isFreeHostingDomain(domain: string): boolean {
  if (FREE_HOSTING_DOMAINS.has(domain)) return true;
  // Check if the domain ends with a known free hosting suffix
  for (const freeDomain of FREE_HOSTING_DOMAINS) {
    if (domain.endsWith(`.${freeDomain}`)) return true;
  }
  return false;
}
