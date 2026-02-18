import { Prisma, SignalSourceStatus, SignalSourceType } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

export interface SignalSourceInput {
  type: SignalSourceType;
  name: string;
  config: Record<string, unknown>;
}

export const getSignalSources = async (organizationId: string) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const sources = await prisma.signalSource.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      type: true,
      name: true,
      status: true,
      lastSyncAt: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { signals: true } },
    },
  });

  // Fetch recent signal counts in parallel
  const recentCounts = await Promise.all(
    sources.map((s) =>
      prisma.signal.count({
        where: { sourceId: s.id, timestamp: { gte: sevenDaysAgo } },
      })
    )
  );

  return sources.map((s, i) => ({
    ...s,
    recentSignals: recentCounts[i],
  }));
};

export const getSignalSourceById = async (id: string, organizationId: string) => {
  return prisma.signalSource.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      type: true,
      name: true,
      config: true,
      status: true,
      lastSyncAt: true,
      errorMessage: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { signals: true } },
    },
  });
};

export const createSignalSource = async (organizationId: string, data: SignalSourceInput) => {
  return prisma.signalSource.create({
    data: {
      organization: { connect: { id: organizationId } },
      type: data.type,
      name: data.name,
      config: data.config as Prisma.InputJsonValue,
    },
  });
};

export const updateSignalSource = async (
  id: string,
  _organizationId: string,
  data: Partial<SignalSourceInput & { status: SignalSourceStatus }>
) => {
  return prisma.signalSource.update({
    where: { id },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.config && { config: data.config as Prisma.InputJsonValue }),
      ...(data.status && { status: data.status }),
    },
  });
};

export const deleteSignalSource = async (id: string, organizationId: string) => {
  // Verify ownership before deleting
  const source = await prisma.signalSource.findFirst({
    where: { id, organizationId },
  });
  if (!source) throw new AppError('Signal source not found', 404);

  return prisma.signalSource.delete({ where: { id } });
};

export const testSignalSource = async (id: string, organizationId: string) => {
  const source = await prisma.signalSource.findFirst({
    where: { id, organizationId },
  });
  if (!source) throw new AppError('Signal source not found', 404);

  // For now, just verify the source exists and is active
  // In the future, this would test the actual connection (GitHub API, npm registry, etc.)
  const isHealthy = source.status === 'ACTIVE';

  return {
    id: source.id,
    type: source.type,
    name: source.name,
    healthy: isHealthy,
    status: source.status,
    lastSyncAt: source.lastSyncAt,
  };
};

// ============================================================
// INTEGRATION CATALOG — Metadata for all available source types
// ============================================================

export const INTEGRATION_CATALOG: Record<string, {
  type: string;
  name: string;
  description: string;
  category: 'Developer Activity' | 'Package Registry' | 'Analytics' | 'CRM' | 'Communication' | 'Community' | 'Custom';
  setupType: 'webhook' | 'api_key' | 'oauth' | 'manual';
  configFields: string[];
}> = {
  GITHUB: {
    type: 'GITHUB',
    name: 'GitHub',
    description: 'Track repository stars, forks, pull requests, issues, and developer activity via webhooks',
    category: 'Developer Activity',
    setupType: 'webhook',
    configFields: ['webhookSecret'],
  },
  NPM: {
    type: 'NPM',
    name: 'npm',
    description: 'Monitor package downloads, maintainer activity, and adoption trends',
    category: 'Package Registry',
    setupType: 'api_key',
    configFields: ['packages'],
  },
  PYPI: {
    type: 'PYPI',
    name: 'PyPI',
    description: 'Track Python package downloads and release activity',
    category: 'Package Registry',
    setupType: 'api_key',
    configFields: ['packages'],
  },
  WEBSITE: {
    type: 'WEBSITE',
    name: 'Website',
    description: 'Track website page views, signups, and visitor behavior',
    category: 'Analytics',
    setupType: 'manual',
    configFields: ['domain', 'trackingId'],
  },
  DOCS: {
    type: 'DOCS',
    name: 'Documentation',
    description: 'Monitor documentation page views, search queries, and popular topics',
    category: 'Analytics',
    setupType: 'manual',
    configFields: ['docsUrl'],
  },
  PRODUCT_API: {
    type: 'PRODUCT_API',
    name: 'Product API',
    description: 'Ingest API usage events, rate limits, and endpoint activity',
    category: 'Analytics',
    setupType: 'api_key',
    configFields: ['apiEndpoint'],
  },
  SEGMENT: {
    type: 'SEGMENT',
    name: 'Segment',
    description: 'Receive track, identify, and group events via Segment webhooks',
    category: 'Analytics',
    setupType: 'webhook',
    configFields: ['sharedSecret'],
  },
  DISCORD: {
    type: 'DISCORD',
    name: 'Discord',
    description: 'Monitor community server messages, support channels, and engagement',
    category: 'Communication',
    setupType: 'api_key',
    configFields: ['botToken', 'guildId'],
  },
  TWITTER: {
    type: 'TWITTER',
    name: 'Twitter / X',
    description: 'Track brand mentions, keyword discussions, and developer sentiment',
    category: 'Community',
    setupType: 'api_key',
    configFields: ['bearerToken', 'keywords'],
  },
  STACKOVERFLOW: {
    type: 'STACKOVERFLOW',
    name: 'Stack Overflow',
    description: 'Monitor questions tagged with your technology and community answers',
    category: 'Community',
    setupType: 'api_key',
    configFields: ['tags'],
  },
  REDDIT: {
    type: 'REDDIT',
    name: 'Reddit',
    description: 'Track subreddit discussions, mentions, and developer sentiment',
    category: 'Community',
    setupType: 'api_key',
    configFields: ['clientId', 'clientSecret', 'subreddits', 'keywords'],
  },
  POSTHOG: {
    type: 'POSTHOG',
    name: 'PostHog',
    description: 'Receive product analytics events, feature flag data, and user actions',
    category: 'Analytics',
    setupType: 'webhook',
    configFields: ['apiKey', 'webhookSecret'],
  },
  LINKEDIN: {
    type: 'LINKEDIN',
    name: 'LinkedIn',
    description: 'Track company page engagement, employee advocacy, and professional signals',
    category: 'Community',
    setupType: 'oauth',
    configFields: ['accessToken'],
  },
  INTERCOM: {
    type: 'INTERCOM',
    name: 'Intercom',
    description: 'Sync conversations, user data, and support interactions',
    category: 'Communication',
    setupType: 'api_key',
    configFields: ['accessToken'],
  },
  ZENDESK: {
    type: 'ZENDESK',
    name: 'Zendesk',
    description: 'Import support tickets, satisfaction ratings, and customer interactions',
    category: 'Communication',
    setupType: 'api_key',
    configFields: ['subdomain', 'email', 'apiToken'],
  },
  CUSTOM_WEBHOOK: {
    type: 'CUSTOM_WEBHOOK',
    name: 'Custom Webhook',
    description: 'Send any event data via HTTP webhook with custom payload mapping',
    category: 'Custom',
    setupType: 'webhook',
    configFields: [],
  },
};

export const getIntegrationCatalog = () => {
  return Object.values(INTEGRATION_CATALOG);
};

export const getSyncHistory = async (sourceId: string, organizationId: string) => {
  // Verify source belongs to org
  const source = await prisma.signalSource.findFirst({
    where: { id: sourceId, organizationId },
    select: { id: true },
  });
  if (!source) throw new AppError('Signal source not found', 404);

  return prisma.syncHistory.findMany({
    where: { sourceId },
    orderBy: { startedAt: 'desc' },
    take: 50,
  });
};
