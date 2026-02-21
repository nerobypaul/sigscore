import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REDDIT_BASE = 'https://www.reddit.com';
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_DELAY_MS = 1_000; // 1 second between requests (Reddit: 60 req/min unauthenticated)
const MAX_RESULTS = 100;
const USER_AGENT = 'Sigscore/1.0 (developer signal intelligence)';

/** Subreddit name patterns indicating showcase / side-project communities. */
const SHOWCASE_SUBREDDITS = new Set([
  'showmyproject',
  'sideproject',
  'indiehackers',
  'startups',
  'imadethis',
  'webdev_showcase',
  'buildinpublic',
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RedditConnectorConfig {
  keywords: string[];
  subreddits: string[];
  lastSyncAt: string | null;
  lastSyncResult: RedditSyncResult | null;
}

export interface RedditSyncResult {
  postsProcessed: number;
  commentsProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface RedditStatus {
  connected: boolean;
  keywords: string[];
  subreddits: string[];
  lastSyncAt: string | null;
  lastSyncResult: RedditSyncResult | null;
  sourceId: string | null;
}

interface RedditPost {
  id: string;
  name: string; // fullname: t3_xxxxx
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  permalink: string;
  url: string;
  created_utc: number;
  is_self: boolean;
  link_flair_text: string | null;
}

interface RedditListing<T> {
  kind: string;
  data: {
    children: Array<{ kind: string; data: T }>;
    after: string | null;
    before: string | null;
  };
}

// ---------------------------------------------------------------------------
// Reddit JSON API Client
// ---------------------------------------------------------------------------

async function redditFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 10_000;
    logger.warn('Reddit rate limited, waiting', { url, waitMs });
    await sleep(waitMs);
    return redditFetch<T>(url);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Reddit API error ${response.status}: ${response.statusText} - ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Signal Classification
// ---------------------------------------------------------------------------

function classifyRedditPost(post: RedditPost): string {
  // Showcase subreddits
  if (SHOWCASE_SUBREDDITS.has(post.subreddit.toLowerCase())) {
    return 'reddit_showcase';
  }

  // Question detection: title ends with "?" or starts with common question words
  const titleLower = post.title.toLowerCase().trim();
  if (
    titleLower.includes('?') ||
    titleLower.startsWith('how ') ||
    titleLower.startsWith('why ') ||
    titleLower.startsWith('what ') ||
    titleLower.startsWith('is there ') ||
    titleLower.startsWith('can ') ||
    titleLower.startsWith('does ') ||
    titleLower.startsWith('has anyone')
  ) {
    return 'reddit_question';
  }

  return 'reddit_discussion';
}

// ---------------------------------------------------------------------------
// Public API: Configure Reddit tracking
// ---------------------------------------------------------------------------

export async function configureReddit(
  organizationId: string,
  config: { keywords: string[]; subreddits: string[] },
): Promise<void> {
  const existing = await getRedditSource(organizationId);

  const redditConfig: RedditConnectorConfig = {
    keywords: config.keywords.map((k) => k.trim()).filter(Boolean),
    subreddits: config.subreddits
      .map((s) => s.trim().replace(/^r\//, '').toLowerCase())
      .filter(Boolean),
    lastSyncAt: existing
      ? ((existing.config as unknown as RedditConnectorConfig)?.lastSyncAt ??
        null)
      : null,
    lastSyncResult: existing
      ? ((existing.config as unknown as RedditConnectorConfig)
          ?.lastSyncResult ?? null)
      : null,
  };

  const name = `Reddit: ${redditConfig.keywords.join(', ')}`;

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name,
        config: redditConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
  } else {
    await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'REDDIT',
        name,
        config: redditConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Public API: Get Config
// ---------------------------------------------------------------------------

export async function getRedditConfig(
  organizationId: string,
): Promise<RedditConnectorConfig | null> {
  const source = await getRedditSource(organizationId);
  if (!source) return null;
  return source.config as unknown as RedditConnectorConfig;
}

// ---------------------------------------------------------------------------
// Public API: Get Status
// ---------------------------------------------------------------------------

export async function getRedditStatus(
  organizationId: string,
): Promise<RedditStatus> {
  const source = await getRedditSource(organizationId);
  if (!source) {
    return {
      connected: false,
      keywords: [],
      subreddits: [],
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
    };
  }

  const cfg = source.config as unknown as RedditConnectorConfig;

  return {
    connected: true,
    keywords: cfg.keywords || [],
    subreddits: cfg.subreddits || [],
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect
// ---------------------------------------------------------------------------

export async function disconnectReddit(
  organizationId: string,
): Promise<void> {
  const source = await getRedditSource(organizationId);
  if (!source) {
    throw new Error('Reddit is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Sync Reddit
// ---------------------------------------------------------------------------

/**
 * Main sync: search Reddit for keyword mentions and fetch new posts from
 * tracked subreddits. Creates signals for each relevant post/comment.
 */
export async function syncReddit(
  organizationId: string,
): Promise<RedditSyncResult> {
  const source = await getRedditSource(organizationId);
  if (!source) {
    throw new Error('Reddit is not connected for this organization');
  }

  const cfg = source.config as unknown as RedditConnectorConfig;

  if (
    (!cfg.keywords || cfg.keywords.length === 0) &&
    (!cfg.subreddits || cfg.subreddits.length === 0)
  ) {
    return {
      postsProcessed: 0,
      commentsProcessed: 0,
      signalsCreated: 0,
      contactsResolved: 0,
      errors: ['No keywords or subreddits configured'],
    };
  }

  // Determine the "since" cutoff (last sync or 7 days ago)
  const since = cfg.lastSyncAt
    ? new Date(cfg.lastSyncAt)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const sinceEpoch = Math.floor(since.getTime() / 1000);

  const result: RedditSyncResult = {
    postsProcessed: 0,
    commentsProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  // 1. Search Reddit for keyword mentions across all of Reddit
  if (cfg.keywords.length > 0) {
    try {
      await syncKeywordSearch(
        organizationId,
        source.id,
        cfg.keywords,
        sinceEpoch,
        result,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Keyword search: ${msg}`);
      logger.error('Reddit keyword search error', { error: msg });
    }
  }

  // 2. Fetch new posts from tracked subreddits
  for (const subreddit of cfg.subreddits) {
    try {
      await syncSubreddit(
        organizationId,
        source.id,
        subreddit,
        cfg.keywords,
        sinceEpoch,
        result,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`r/${subreddit}: ${msg}`);
      logger.error('Reddit subreddit sync error', {
        subreddit,
        error: msg,
      });
    }

    // Rate limit between subreddit fetches
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

export async function getRedditConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: {
      type: 'REDDIT',
      status: 'ACTIVE',
    },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Internal: Sync keyword search results
// ---------------------------------------------------------------------------

async function syncKeywordSearch(
  organizationId: string,
  sourceId: string,
  keywords: string[],
  sinceEpoch: number,
  result: RedditSyncResult,
): Promise<void> {
  // Join keywords with OR for Reddit search
  const query = keywords.map((k) => encodeURIComponent(k)).join('+OR+');
  const searchUrl = `${REDDIT_BASE}/search.json?q=${query}&sort=new&t=day&limit=${MAX_RESULTS}&restrict_sr=false`;

  const listing = await redditFetch<RedditListing<RedditPost>>(searchUrl);

  for (const child of listing.data.children) {
    if (child.kind !== 't3') continue; // Only submissions
    const post = child.data;

    // Skip posts older than our cutoff
    if (post.created_utc < sinceEpoch) continue;

    // Skip deleted/removed authors
    if (post.author === '[deleted]' || post.author === 'AutoModerator') continue;

    result.postsProcessed++;

    await createPostSignal(organizationId, sourceId, post, result);
  }

  await sleep(RATE_LIMIT_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Internal: Sync a single subreddit
// ---------------------------------------------------------------------------

async function syncSubreddit(
  organizationId: string,
  sourceId: string,
  subreddit: string,
  keywords: string[],
  sinceEpoch: number,
  result: RedditSyncResult,
): Promise<void> {
  const subredditUrl = `${REDDIT_BASE}/r/${subreddit}/new.json?limit=${MAX_RESULTS}`;

  const listing = await redditFetch<RedditListing<RedditPost>>(subredditUrl);

  // Build a regex for keyword matching in subreddit posts
  const keywordRegex = keywords.length > 0
    ? new RegExp(keywords.map((k) => escapeRegex(k)).join('|'), 'i')
    : null;

  for (const child of listing.data.children) {
    if (child.kind !== 't3') continue;
    const post = child.data;

    // Skip posts older than our cutoff
    if (post.created_utc < sinceEpoch) continue;

    // Skip deleted/removed authors
    if (post.author === '[deleted]' || post.author === 'AutoModerator') continue;

    // For subreddit posts, only create signals if keywords match
    // (or if no keywords are configured, track everything in the subreddit)
    if (keywordRegex) {
      const text = `${post.title} ${post.selftext}`.toLowerCase();
      if (!keywordRegex.test(text)) continue;
    }

    result.postsProcessed++;

    await createPostSignal(organizationId, sourceId, post, result);
  }
}

// ---------------------------------------------------------------------------
// Internal: Create signal for a Reddit post
// ---------------------------------------------------------------------------

async function createPostSignal(
  organizationId: string,
  sourceId: string,
  post: RedditPost,
  result: RedditSyncResult,
): Promise<void> {
  const idempotencyKey = `reddit:${post.id}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) return;

  // Resolve contact by Reddit username
  const contactId = await resolveRedditContact(organizationId, post.author);
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

  const signalType = classifyRedditPost(post);

  // Build metadata
  const metadata: Record<string, unknown> = {
    title: post.title,
    url: `https://www.reddit.com${post.permalink}`,
    subreddit: post.subreddit,
    author: post.author,
    score: post.score,
    numComments: post.num_comments,
    selftext: post.selftext ? post.selftext.substring(0, 500) : '',
    permalink: post.permalink,
    reddit_post_id: post.id,
    is_self: post.is_self,
    flair: post.link_flair_text,
  };

  // Create signal
  await prisma.signal.create({
    data: {
      organizationId,
      sourceId,
      type: signalType,
      actorId: contactId || null,
      accountId,
      anonymousId: contactId ? null : `reddit:${post.author}`,
      metadata: metadata as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp: new Date(post.created_utc * 1000),
    },
  });

  result.signalsCreated++;

  // Enqueue workflow for signal_received
  enqueueWorkflowExecution(organizationId, 'signal_received', {
    signalId: idempotencyKey,
    type: signalType,
    accountId,
    actorId: contactId,
    metadata,
  }).catch((err) =>
    logger.error('Reddit signal workflow enqueue error:', err),
  );
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolveRedditContact(
  organizationId: string,
  author: string,
): Promise<string | null> {
  if (!author || author === '[deleted]') return null;

  // 1. Try matching by existing Reddit identity
  const identity = await prisma.contactIdentity.findFirst({
    where: { type: 'REDDIT', value: `reddit:${author}` },
    include: {
      contact: {
        select: { id: true, organizationId: true },
      },
    },
  });

  if (identity && identity.contact.organizationId === organizationId) {
    return identity.contact.id;
  }

  // 2. Try matching by username pattern -- check if any contact has a
  // GitHub handle that matches the Reddit username (many devs reuse usernames)
  const contact = await prisma.contact.findFirst({
    where: {
      organizationId,
      github: { equals: author, mode: 'insensitive' },
    },
    select: { id: true },
  });

  if (contact) {
    // Create Reddit identity link with low confidence (username heuristic)
    await prisma.contactIdentity.upsert({
      where: {
        type_value: { type: 'REDDIT', value: `reddit:${author}` },
      },
      create: {
        contactId: contact.id,
        type: 'REDDIT',
        value: `reddit:${author}`,
        verified: false,
        confidence: 0.3,
      },
      update: {},
    });

    return contact.id;
  }

  // 3. Try matching by display name (first + last name, assuming username is "FirstLast" or "first_last")
  const nameParts = author.replace(/[_-]/g, ' ').split(' ').filter(Boolean);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');

    const nameContact = await prisma.contact.findFirst({
      where: {
        organizationId,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (nameContact) {
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'REDDIT', value: `reddit:${author}` },
        },
        create: {
          contactId: nameContact.id,
          type: 'REDDIT',
          value: `reddit:${author}`,
          verified: false,
          confidence: 0.3,
        },
        update: {},
      });

      return nameContact.id;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getRedditSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: {
      organizationId,
      type: 'REDDIT',
    },
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
