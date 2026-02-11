import crypto from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const API_KEY_PREFIX = 'ds_live_';

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateRawKey(): string {
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `${API_KEY_PREFIX}${randomPart}`;
}

export interface GenerateApiKeyResult {
  key: string; // full key, only returned once
  apiKey: {
    id: string;
    organizationId: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    expiresAt: Date | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export const generateApiKey = async (
  organizationId: string,
  name: string,
  scopes: string[],
  expiresAt?: Date
): Promise<GenerateApiKeyResult> => {
  const rawKey = generateRawKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.substring(0, 12); // e.g. "ds_live_a1b2"

  const apiKey = await prisma.apiKey.create({
    data: {
      organizationId,
      name,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt: expiresAt ?? null,
    },
    select: {
      id: true,
      organizationId: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      expiresAt: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info(`API key created: ${apiKey.id} for org ${organizationId}`);

  return {
    key: rawKey,
    apiKey,
  };
};

export const validateApiKey = async (rawKey: string) => {
  const keyHash = hashKey(rawKey);

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
  });

  if (!apiKey) {
    return null;
  }

  if (!apiKey.active) {
    logger.warn(`Attempted use of inactive API key: ${apiKey.keyPrefix}...`);
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    logger.warn(`Attempted use of expired API key: ${apiKey.keyPrefix}...`);
    return null;
  }

  // Update lastUsedAt (fire-and-forget to avoid slowing down the request)
  prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      logger.error('Failed to update API key lastUsedAt:', err);
    });

  return apiKey;
};

export const listApiKeys = async (organizationId: string) => {
  const apiKeys = await prisma.apiKey.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return apiKeys;
};

export const revokeApiKey = async (organizationId: string, keyId: string) => {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!apiKey) {
    return null;
  }

  const updated = await prisma.apiKey.update({
    where: { id: keyId },
    data: { active: false },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      active: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info(`API key revoked: ${keyId} for org ${organizationId}`);

  return updated;
};

export const deleteApiKey = async (organizationId: string, keyId: string) => {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId },
  });

  if (!apiKey) {
    return null;
  }

  await prisma.apiKey.delete({
    where: { id: keyId },
  });

  logger.info(`API key deleted: ${keyId} for org ${organizationId}`);

  return true;
};
