import { Prisma, SignalSourceStatus, SignalSourceType } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

export interface SignalSourceInput {
  type: SignalSourceType;
  name: string;
  config: Record<string, unknown>;
}

export const getSignalSources = async (organizationId: string) => {
  return prisma.signalSource.findMany({
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
