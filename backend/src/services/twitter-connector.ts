import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TWITTER_API_BASE = 'https://api.twitter.com/2';
const REQUEST_TIMEOUT_MS = 15_000;

/** Keywords that signal positive sentiment. */
const POSITIVE_KEYWORDS = [
  'love',
  'amazing',
  'great',
  'awesome',
  'excellent',
  'fantastic',
  'switched to',
  'impressed',
  'best',
  'beautiful',
  'incredible',
  'perfect',
  'fast',
  'loving',
  'thank',
  'kudos',
  'bravo',
  'recommend',
  'solid',
];

/** Keywords that signal negative sentiment. */
const NEGATIVE_KEYWORDS = [
  'broken',
  'bug',
  'issue',
  'hate',
  'terrible',
  'awful',
  'worst',
  'slow',
  'crash',
  'sucks',
  'frustrat',
  'annoying',
  'unusable',
  'downtime',
  'down again',
  'broken again',
  'disappointed',
  'regret',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwitterConnectorConfig {
  bearerToken: string;
  keywords: string[];
  lastSyncAt: string | null;
  lastSyncedTweetId: string | null;
  lastSyncResult: TwitterSyncResult | null;
}

export interface TwitterSyncResult {
  tweetsProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  sentimentBreakdown: {
    positive: number;
    negative: number;
    neutral: number;
  };
  errors: string[];
}

export interface TwitterSyncStatus {
  connected: boolean;
  keywords: string[];
  lastSyncAt: string | null;
  lastSyncResult: TwitterSyncResult | null;
  sourceId: string | null;
}

interface TwitterUser {
  id: string;
  name: string;
  username: string;
  description?: string;
  location?: string;
  url?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  conversation_id?: string;
  lang?: string;
  public_metrics?: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    quote_count: number;
    impression_count: number;
  };
}

interface TwitterSearchResponse {
  data?: TwitterTweet[];
  includes?: {
    users?: TwitterUser[];
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
}

type Sentiment = 'positive' | 'negative' | 'neutral';

// ---------------------------------------------------------------------------
// Twitter REST API Client
// ---------------------------------------------------------------------------

async function twitterFetch<T>(
  bearerToken: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${TWITTER_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const resetHeader = response.headers.get('x-rate-limit-reset');
    let waitMs: number;

    if (retryAfter) {
      waitMs = parseInt(retryAfter, 10) * 1000;
    } else if (resetHeader) {
      const resetTime = parseInt(resetHeader, 10) * 1000;
      waitMs = Math.max(resetTime - Date.now(), 1000);
    } else {
      waitMs = 60_000; // Default to 1 minute for Twitter
    }

    // Cap wait time at 5 minutes
    waitMs = Math.min(waitMs, 300_000);

    logger.warn('Twitter rate limited, waiting', { path, waitMs });
    await sleep(waitMs);
    return twitterFetch<T>(bearerToken, path, options);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Twitter API error ${response.status}: ${response.statusText} - ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Sentiment & Type Classification
// ---------------------------------------------------------------------------

function classifySentiment(text: string): Sentiment {
  const lower = text.toLowerCase();

  const hasPositive = POSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
  const hasNegative = NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw));

  // If both, the one with more keyword matches wins
  if (hasPositive && hasNegative) {
    const posCount = POSITIVE_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    const negCount = NEGATIVE_KEYWORDS.filter((kw) => lower.includes(kw)).length;
    return posCount >= negCount ? 'positive' : 'negative';
  }

  if (hasPositive) return 'positive';
  if (hasNegative) return 'negative';
  return 'neutral';
}

function classifyTweetType(text: string, sentiment: Sentiment): string {
  if (text.includes('?')) return 'twitter_question';
  if (sentiment === 'negative') return 'twitter_complaint';
  if (sentiment === 'positive') return 'twitter_praise';
  return 'twitter_mention';
}

// ---------------------------------------------------------------------------
// Domain extraction from Twitter bio
// ---------------------------------------------------------------------------

function extractDomainFromBio(bio: string | undefined): string | null {
  if (!bio) return null;

  // Look for common patterns: "at company.com", "company.io", etc.
  const domainPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/g;
  const matches = bio.match(domainPattern);
  if (matches && matches.length > 0) {
    // Clean up the match
    let domain = matches[0]
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '');
    // Strip trailing path
    const slashIdx = domain.indexOf('/');
    if (slashIdx > 0) domain = domain.substring(0, slashIdx);
    return domain;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API: Configure Twitter
// ---------------------------------------------------------------------------

export async function configureTwitter(
  organizationId: string,
  config: { bearerToken: string; keywords: string[] },
): Promise<void> {
  // Validate the bearer token by making a test request
  try {
    await twitterFetch<unknown>(
      config.bearerToken,
      '/tweets/search/recent?query=test&max_results=10',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Invalid bearer token or API access: ${msg}`);
  }

  const twitterConfig: TwitterConnectorConfig = {
    bearerToken: config.bearerToken,
    keywords: config.keywords,
    lastSyncAt: null,
    lastSyncedTweetId: null,
    lastSyncResult: null,
  };

  // Check if already connected
  const existing = await getTwitterSource(organizationId);

  if (existing) {
    await prisma.signalSource.update({
      where: { id: existing.id },
      data: {
        name: `Twitter/X: ${config.keywords.slice(0, 3).join(', ')}`,
        config: twitterConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        errorMessage: null,
      },
    });
  } else {
    await prisma.signalSource.create({
      data: {
        organizationId,
        type: 'TWITTER',
        name: `Twitter/X: ${config.keywords.slice(0, 3).join(', ')}`,
        config: twitterConfig as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Public API: Get Twitter Config (masked)
// ---------------------------------------------------------------------------

export async function getTwitterConfig(
  organizationId: string,
): Promise<TwitterSyncStatus> {
  const source = await getTwitterSource(organizationId);
  if (!source) {
    return {
      connected: false,
      keywords: [],
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
    };
  }

  const cfg = source.config as unknown as TwitterConnectorConfig;

  return {
    connected: true,
    keywords: cfg.keywords || [],
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect Twitter
// ---------------------------------------------------------------------------

export async function disconnectTwitter(
  organizationId: string,
): Promise<void> {
  const source = await getTwitterSource(organizationId);
  if (!source) {
    throw new Error('Twitter is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Sync Twitter Mentions
// ---------------------------------------------------------------------------

export async function syncTwitterMentions(
  organizationId: string,
): Promise<TwitterSyncResult> {
  const source = await getTwitterSource(organizationId);
  if (!source) {
    throw new Error('Twitter is not connected for this organization');
  }

  const cfg = source.config as unknown as TwitterConnectorConfig;
  const keywords = cfg.keywords || [];

  if (keywords.length === 0) {
    return {
      tweetsProcessed: 0,
      signalsCreated: 0,
      contactsResolved: 0,
      sentimentBreakdown: { positive: 0, negative: 0, neutral: 0 },
      errors: ['No keywords configured for tracking'],
    };
  }

  const result: TwitterSyncResult = {
    tweetsProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    sentimentBreakdown: { positive: 0, negative: 0, neutral: 0 },
    errors: [],
  };

  try {
    // Build search query: keywords joined with OR, exclude retweets
    const queryTerms = keywords.map((kw) => {
      // If it contains spaces, wrap in quotes
      if (kw.includes(' ')) return `"${kw}"`;
      return kw;
    });
    const query = `(${queryTerms.join(' OR ')}) -is:retweet`;

    // Build URL with params
    const params = new URLSearchParams({
      query,
      max_results: '100',
      'tweet.fields': 'created_at,public_metrics,author_id,conversation_id,lang',
      'user.fields': 'name,username,description,location,public_metrics,url',
      expansions: 'author_id',
    });

    if (cfg.lastSyncedTweetId) {
      params.set('since_id', cfg.lastSyncedTweetId);
    }

    const searchResult = await twitterFetch<TwitterSearchResponse>(
      cfg.bearerToken,
      `/tweets/search/recent?${params.toString()}`,
    );

    const tweets = searchResult.data || [];
    const users = searchResult.includes?.users || [];

    // Build user lookup map
    const userMap = new Map<string, TwitterUser>();
    for (const user of users) {
      userMap.set(user.id, user);
    }

    // Track newest tweet ID for pagination
    let newestTweetId = cfg.lastSyncedTweetId;

    for (const tweet of tweets) {
      result.tweetsProcessed++;

      const author = userMap.get(tweet.author_id);
      const sentiment = classifySentiment(tweet.text);
      const signalType = classifyTweetType(tweet.text, sentiment);

      // Track sentiment
      result.sentimentBreakdown[sentiment]++;

      const idempotencyKey = `twitter:${tweet.id}`;

      // Check idempotency
      const existing = await prisma.signal.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) continue;

      // Resolve contact by Twitter identity
      const contactId = await resolveTwitterContact(
        organizationId,
        author,
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
        tweetId: tweet.id,
        text: tweet.text.substring(0, 500),
        authorUsername: author?.username || 'unknown',
        authorName: author?.name || 'Unknown',
        authorFollowers: author?.public_metrics?.followers_count || 0,
        sentiment,
        url: `https://twitter.com/${author?.username || 'i'}/status/${tweet.id}`,
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
        language: tweet.lang || 'en',
      };

      // Create signal
      await prisma.signal.create({
        data: {
          organizationId,
          sourceId: source.id,
          type: signalType,
          actorId: contactId || null,
          accountId,
          anonymousId: contactId
            ? null
            : `twitter:${author?.username || tweet.author_id}`,
          metadata: metadata as Prisma.InputJsonValue,
          idempotencyKey,
          timestamp: new Date(tweet.created_at),
        },
      });

      result.signalsCreated++;

      // Track newest tweet ID (Twitter returns newest first)
      if (
        !newestTweetId ||
        BigInt(tweet.id) > BigInt(newestTweetId)
      ) {
        newestTweetId = tweet.id;
      }

      // Enqueue workflow for signal_received
      enqueueWorkflowExecution(organizationId, 'signal_received', {
        signalId: idempotencyKey,
        type: signalType,
        accountId,
        actorId: contactId,
        metadata,
      }).catch((err) =>
        logger.error('Twitter signal workflow enqueue error:', err),
      );
    }

    // Update config with sync result and newest tweet ID
    cfg.lastSyncAt = new Date().toISOString();
    cfg.lastSyncResult = result;
    if (newestTweetId) {
      cfg.lastSyncedTweetId = newestTweetId;
    }

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Twitter sync failed: ${msg}`);
    logger.error('Twitter sync error', { organizationId, error: msg });

    // Update source status on error
    await prisma.signalSource.update({
      where: { id: source.id },
      data: {
        status: 'ERROR',
        errorMessage: msg,
        lastSyncAt: new Date(),
      },
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API: Get connected org IDs (for scheduler)
// ---------------------------------------------------------------------------

export async function getTwitterConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'TWITTER', status: 'ACTIVE' },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolveTwitterContact(
  organizationId: string,
  author: TwitterUser | undefined,
): Promise<string | null> {
  if (!author) return null;

  // 1. Try matching by existing Twitter identity (username)
  const identity = await prisma.contactIdentity.findFirst({
    where: { type: 'TWITTER', value: author.username },
    include: {
      contact: {
        select: { id: true, organizationId: true },
      },
    },
  });

  if (identity && identity.contact.organizationId === organizationId) {
    return identity.contact.id;
  }

  // 2. Try matching by Twitter display name as first+last name
  const displayName = author.name;
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
      // Create Twitter identity link
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'TWITTER', value: author.username },
        },
        create: {
          contactId: contact.id,
          type: 'TWITTER',
          value: author.username,
          verified: false,
          confidence: 0.6,
        },
        update: {},
      });

      return contact.id;
    }
  }

  // 3. Try domain extraction from bio for account matching
  const domain = extractDomainFromBio(author.description);
  if (domain) {
    // Look for contacts whose email domain matches
    const contact = await prisma.contact.findFirst({
      where: {
        organizationId,
        email: { endsWith: `@${domain}`, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (contact) {
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'TWITTER', value: author.username },
        },
        create: {
          contactId: contact.id,
          type: 'TWITTER',
          value: author.username,
          verified: false,
          confidence: 0.5,
        },
        update: {},
      });

      return contact.id;
    }
  }

  // 4. Store the Twitter identity even if unresolved to a contact
  // so future imports can link them
  // (We skip creating a new contact -- only resolve to existing ones)

  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTwitterSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: { organizationId, type: 'TWITTER' },
  });
}
