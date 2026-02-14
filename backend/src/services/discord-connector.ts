import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 1_000; // 1 second between batched requests
const MAX_MESSAGES_PER_FETCH = 100;

/** Channel name patterns that indicate support/help channels. */
const SUPPORT_CHANNEL_PATTERNS = [
  /^help/i,
  /^support/i,
  /^questions/i,
  /^troubleshoot/i,
  /^ask-/i,
];

/** Channel name patterns for showcase/community highlight channels. */
const SHOWCASE_CHANNEL_PATTERNS = [
  /^showcase/i,
  /^show-and-tell/i,
  /^built-with/i,
  /^community-showcase/i,
];

/** Channel name patterns that are typically bot-heavy and should be excluded. */
const BOT_CHANNEL_PATTERNS = [
  /^bot/i,
  /^logs/i,
  /^audit/i,
  /^github-?feed/i,
  /^deploy/i,
  /^alerts/i,
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscordServerInfo {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  channels: DiscordChannelInfo[];
}

export interface DiscordChannelInfo {
  id: string;
  name: string;
  type: number; // 0=text, 2=voice, 4=category, 5=announcement, etc.
  parentId: string | null;
  position: number;
  isSupportChannel: boolean;
  isShowcaseChannel: boolean;
  isBotChannel: boolean;
}

export interface DiscordSyncResult {
  messagesProcessed: number;
  signalsCreated: number;
  contactsResolved: number;
  errors: string[];
}

export interface DiscordConnectorConfig {
  botToken: string;
  guildId: string;
  guildName: string;
  guildIcon: string | null;
  memberCount: number;
  monitoredChannels: string[]; // channel IDs
  lastSyncAt: string | null;
  lastSyncResult: DiscordSyncResult | null;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name: string | null;
  avatar: string | null;
  bot?: boolean;
  email?: string;
}

interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  type: number;
  thread?: { id: string; name: string };
  reactions?: Array<{ emoji: { name: string }; count: number }>;
  referenced_message?: DiscordMessage | null;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
  last_message_id: string | null;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  approximate_member_count?: number;
  member_count?: number;
}

// ---------------------------------------------------------------------------
// Discord REST API Client
// ---------------------------------------------------------------------------

async function discordFetch<T>(
  botToken: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${DISCORD_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 5000;
    logger.warn('Discord rate limited, waiting', { path, waitMs });
    await sleep(waitMs);
    return discordFetch<T>(botToken, path, options);
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Discord API error ${response.status}: ${response.statusText} - ${errorBody}`,
    );
  }

  return response.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Channel Classification
// ---------------------------------------------------------------------------

function matchesPatterns(name: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(name));
}

function classifyChannel(channel: DiscordChannel): DiscordChannelInfo {
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parent_id,
    position: channel.position,
    isSupportChannel: matchesPatterns(channel.name, SUPPORT_CHANNEL_PATTERNS),
    isShowcaseChannel: matchesPatterns(channel.name, SHOWCASE_CHANNEL_PATTERNS),
    isBotChannel: matchesPatterns(channel.name, BOT_CHANNEL_PATTERNS),
  };
}

// ---------------------------------------------------------------------------
// Signal Type Detection
// ---------------------------------------------------------------------------

function detectSignalType(
  message: DiscordMessage,
  channelName: string,
): string {
  // Thread creation (type 18 = thread starter message)
  if (message.type === 18) {
    return 'discord_thread_created';
  }

  // Support/help channel messages
  if (matchesPatterns(channelName, SUPPORT_CHANNEL_PATTERNS)) {
    return 'discord_question_asked';
  }

  // Default message
  return 'discord_message';
}

// ---------------------------------------------------------------------------
// Public API: Connect to Discord Server
// ---------------------------------------------------------------------------

/**
 * Validates a Discord bot token and fetches server (guild) info + channels.
 */
export async function connectDiscordServer(
  botToken: string,
): Promise<DiscordServerInfo> {
  // Fetch the guilds the bot is in
  const guilds = await discordFetch<DiscordGuild[]>(
    botToken,
    '/users/@me/guilds?with_counts=true',
  );

  if (guilds.length === 0) {
    throw new Error(
      'Bot is not a member of any Discord servers. Please add the bot to a server first.',
    );
  }

  // Use the first guild (most bots are single-server)
  const guild = guilds[0];
  const guildId = guild.id;

  // Fetch channels
  const channels = await discordFetch<DiscordChannel[]>(
    botToken,
    `/guilds/${guildId}/channels`,
  );

  // Only include text-based channels (type 0 = text, 5 = announcement)
  const textChannels = channels
    .filter((c) => c.type === 0 || c.type === 5)
    .map(classifyChannel)
    .sort((a, b) => a.position - b.position);

  return {
    id: guildId,
    name: guild.name,
    icon: guild.icon
      ? `https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png`
      : null,
    memberCount: guild.approximate_member_count || guild.member_count || 0,
    channels: textChannels,
  };
}

// ---------------------------------------------------------------------------
// Public API: Get Channels (from stored config)
// ---------------------------------------------------------------------------

export async function getDiscordChannels(
  organizationId: string,
): Promise<{ channels: DiscordChannelInfo[]; monitoredChannels: string[] }> {
  const source = await getDiscordSource(organizationId);
  if (!source) {
    throw new Error('Discord is not connected for this organization');
  }

  const cfg = source.config as unknown as DiscordConnectorConfig;

  // Re-fetch live channel list
  const channels = await discordFetch<DiscordChannel[]>(
    cfg.botToken,
    `/guilds/${cfg.guildId}/channels`,
  );

  const textChannels = channels
    .filter((c) => c.type === 0 || c.type === 5)
    .map(classifyChannel)
    .sort((a, b) => a.position - b.position);

  return {
    channels: textChannels,
    monitoredChannels: cfg.monitoredChannels || [],
  };
}

// ---------------------------------------------------------------------------
// Public API: Update Monitored Channels
// ---------------------------------------------------------------------------

export async function updateMonitoredChannels(
  organizationId: string,
  channelIds: string[],
): Promise<void> {
  const source = await getDiscordSource(organizationId);
  if (!source) {
    throw new Error('Discord is not connected for this organization');
  }

  const cfg = source.config as unknown as DiscordConnectorConfig;
  cfg.monitoredChannels = channelIds;

  await prisma.signalSource.update({
    where: { id: source.id },
    data: {
      config: cfg as unknown as Prisma.InputJsonValue,
    },
  });
}

// ---------------------------------------------------------------------------
// Public API: Get Sync Status
// ---------------------------------------------------------------------------

export interface DiscordSyncStatus {
  connected: boolean;
  guildName: string | null;
  guildIcon: string | null;
  guildId: string | null;
  memberCount: number;
  monitoredChannels: number;
  lastSyncAt: string | null;
  lastSyncResult: DiscordSyncResult | null;
  sourceId: string | null;
}

export async function getDiscordStatus(
  organizationId: string,
): Promise<DiscordSyncStatus> {
  const source = await getDiscordSource(organizationId);
  if (!source) {
    return {
      connected: false,
      guildName: null,
      guildIcon: null,
      guildId: null,
      memberCount: 0,
      monitoredChannels: 0,
      lastSyncAt: null,
      lastSyncResult: null,
      sourceId: null,
    };
  }

  const cfg = source.config as unknown as DiscordConnectorConfig;

  return {
    connected: true,
    guildName: cfg.guildName,
    guildIcon: cfg.guildIcon,
    guildId: cfg.guildId,
    memberCount: cfg.memberCount || 0,
    monitoredChannels: (cfg.monitoredChannels || []).length,
    lastSyncAt: cfg.lastSyncAt || (source.lastSyncAt?.toISOString() ?? null),
    lastSyncResult: cfg.lastSyncResult || null,
    sourceId: source.id,
  };
}

// ---------------------------------------------------------------------------
// Public API: Disconnect
// ---------------------------------------------------------------------------

export async function disconnectDiscord(
  organizationId: string,
): Promise<void> {
  const source = await getDiscordSource(organizationId);
  if (!source) {
    throw new Error('Discord is not connected for this organization');
  }

  await prisma.signalSource.delete({ where: { id: source.id } });
}

// ---------------------------------------------------------------------------
// Public API: Sync Discord Server
// ---------------------------------------------------------------------------

/**
 * Full sync: fetches recent messages from all monitored channels,
 * resolves identities, and creates signals.
 */
export async function syncDiscordServer(
  organizationId: string,
): Promise<DiscordSyncResult> {
  const source = await getDiscordSource(organizationId);
  if (!source) {
    throw new Error('Discord is not connected for this organization');
  }

  const cfg = source.config as unknown as DiscordConnectorConfig;
  const channelIds = cfg.monitoredChannels || [];

  if (channelIds.length === 0) {
    return {
      messagesProcessed: 0,
      signalsCreated: 0,
      contactsResolved: 0,
      errors: ['No channels configured for monitoring'],
    };
  }

  // Determine the "since" cutoff (last sync or 7 days ago)
  const since = cfg.lastSyncAt
    ? new Date(cfg.lastSyncAt)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const result = await syncRecentMessages(
    organizationId,
    source.id,
    cfg.botToken,
    cfg.guildId,
    channelIds,
    since,
  );

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
// Public API: Sync Recent Messages (incremental)
// ---------------------------------------------------------------------------

export async function syncRecentMessages(
  organizationId: string,
  sourceId: string,
  botToken: string,
  guildId: string,
  channelIds: string[],
  since: Date,
): Promise<DiscordSyncResult> {
  const result: DiscordSyncResult = {
    messagesProcessed: 0,
    signalsCreated: 0,
    contactsResolved: 0,
    errors: [],
  };

  // Fetch channel names for classification
  let channelMap: Map<string, string> = new Map();
  try {
    const channels = await discordFetch<DiscordChannel[]>(
      botToken,
      `/guilds/${guildId}/channels`,
    );
    channelMap = new Map(channels.map((c) => [c.id, c.name]));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    result.errors.push(`Failed to fetch channels: ${msg}`);
    return result;
  }

  // Convert since to Discord snowflake for efficient filtering
  const sinceSnowflake = dateToSnowflake(since);

  for (const channelId of channelIds) {
    try {
      // Fetch messages after the "since" point
      const messages = await discordFetch<DiscordMessage[]>(
        botToken,
        `/channels/${channelId}/messages?limit=${MAX_MESSAGES_PER_FETCH}&after=${sinceSnowflake}`,
      );

      const channelName = channelMap.get(channelId) || 'unknown';

      for (const message of messages) {
        // Skip bot messages
        if (message.author.bot) continue;

        result.messagesProcessed++;

        const signalType = detectSignalType(message, channelName);
        const idempotencyKey = `discord:${message.id}`;

        // Check idempotency
        const existing = await prisma.signal.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });
        if (existing) continue;

        // Resolve contact by Discord identity
        const contactId = await resolveDiscordContact(
          organizationId,
          message.author,
          guildId,
          botToken,
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
          discord_message_id: message.id,
          discord_channel_id: channelId,
          discord_channel_name: channelName,
          discord_author_id: message.author.id,
          discord_author_username: message.author.username,
          discord_author_global_name: message.author.global_name,
          content_preview: message.content.substring(0, 200),
          content_length: message.content.length,
          has_reactions: (message.reactions?.length ?? 0) > 0,
          reaction_count: message.reactions?.reduce(
            (sum, r) => sum + r.count,
            0,
          ) ?? 0,
          is_reply: !!message.referenced_message,
        };

        // Create signal
        await prisma.signal.create({
          data: {
            organizationId,
            sourceId,
            type: signalType,
            actorId: contactId || null,
            accountId,
            anonymousId: contactId
              ? null
              : `discord:${message.author.id}`,
            metadata: metadata as Prisma.InputJsonValue,
            idempotencyKey,
            timestamp: new Date(message.timestamp),
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
          logger.error('Discord signal workflow enqueue error:', err),
        );
      }

      // Rate limit compliance between channel fetches
      await sleep(RATE_LIMIT_WINDOW_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Channel ${channelId}: ${msg}`);
      logger.error('Discord sync error for channel', {
        channelId,
        error: msg,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API: Process Inbound Webhook Event
// ---------------------------------------------------------------------------

/**
 * Processes an inbound Discord webhook event (from Discord's event subscription).
 * Returns a processed result similar to other connectors.
 */
export async function processDiscordWebhookEvent(
  organizationId: string,
  sourceId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; signalType?: string }> {
  const eventTypeMap: Record<string, string> = {
    MESSAGE_CREATE: 'discord_message',
    THREAD_CREATE: 'discord_thread_created',
    MESSAGE_REACTION_ADD: 'discord_reaction',
    GUILD_MEMBER_ADD: 'discord_member_joined',
  };

  const signalType = eventTypeMap[eventType];
  if (!signalType) {
    return { processed: false };
  }

  const messageId =
    (payload.id as string) ||
    (payload.message_id as string) ||
    `${Date.now()}`;
  const idempotencyKey = `discord_wh:${messageId}`;

  // Check idempotency
  const existing = await prisma.signal.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) {
    return { processed: true, signalType };
  }

  const authorId =
    (payload.author as Record<string, unknown>)?.id as string | undefined;
  const channelId = payload.channel_id as string | undefined;

  // Build metadata from webhook payload
  const metadata: Record<string, unknown> = {
    discord_event: eventType,
    discord_channel_id: channelId,
    discord_author_id: authorId,
    raw_payload: payload,
  };

  await prisma.signal.create({
    data: {
      organizationId,
      sourceId,
      type: signalType,
      actorId: null,
      accountId: null,
      anonymousId: authorId ? `discord:${authorId}` : null,
      metadata: metadata as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp: new Date(),
    },
  });

  // Update lastSyncAt
  await prisma.signalSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date() },
  });

  return { processed: true, signalType };
}

// ---------------------------------------------------------------------------
// Public API: Get connected org IDs (for scheduler)
// ---------------------------------------------------------------------------

export async function getDiscordConnectedOrganizations(): Promise<string[]> {
  const sources = await prisma.signalSource.findMany({
    where: { type: 'DISCORD', status: 'ACTIVE' },
    select: { organizationId: true },
    distinct: ['organizationId'],
  });
  return sources.map((s) => s.organizationId);
}

// ---------------------------------------------------------------------------
// Identity Resolution
// ---------------------------------------------------------------------------

async function resolveDiscordContact(
  organizationId: string,
  author: DiscordUser,
  _guildId: string,
  _botToken: string,
): Promise<string | null> {
  // 1. Try matching by existing Discord identity
  const identity = await prisma.contactIdentity.findFirst({
    where: { type: 'DISCORD', value: author.id },
    include: {
      contact: {
        select: { id: true, organizationId: true },
      },
    },
  });

  if (identity && identity.contact.organizationId === organizationId) {
    return identity.contact.id;
  }

  // 2. Try matching by email (if we have it from Discord)
  if (author.email) {
    const contact = await prisma.contact.findFirst({
      where: { organizationId, email: author.email },
      select: { id: true },
    });

    if (contact) {
      // Create Discord identity link
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'DISCORD', value: author.id },
        },
        create: {
          contactId: contact.id,
          type: 'DISCORD',
          value: author.id,
          verified: true,
          confidence: 0.9,
        },
        update: { contactId: contact.id },
      });

      return contact.id;
    }
  }

  // 3. Try matching by username/global_name heuristics
  // Check if any contact's first+last name matches the Discord display name
  const displayName = author.global_name || author.username;
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
      // Create Discord identity link with lower confidence
      await prisma.contactIdentity.upsert({
        where: {
          type_value: { type: 'DISCORD', value: author.id },
        },
        create: {
          contactId: contact.id,
          type: 'DISCORD',
          value: author.id,
          verified: false,
          confidence: 0.6,
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

async function getDiscordSource(organizationId: string) {
  return prisma.signalSource.findFirst({
    where: { organizationId, type: 'DISCORD' },
  });
}

/**
 * Convert a JS Date to a Discord snowflake (for use with ?after= parameter).
 * Discord snowflakes encode a timestamp as (timestamp - EPOCH) << 22.
 */
function dateToSnowflake(date: Date): string {
  const DISCORD_EPOCH = 1420070400000n; // 2015-01-01 00:00:00 UTC
  const timestamp = BigInt(date.getTime());
  const snowflake = (timestamp - DISCORD_EPOCH) << 22n;
  return snowflake.toString();
}
