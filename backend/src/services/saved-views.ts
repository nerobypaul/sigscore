import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { Prisma } from '@prisma/client';

interface CreateViewData {
  organizationId: string;
  userId: string;
  name: string;
  entityType: string;
  filters: Prisma.InputJsonValue;
  sortField?: string;
  sortDirection?: string;
  isShared?: boolean;
  icon?: string;
  color?: string;
}

interface UpdateViewData {
  name?: string;
  filters?: Prisma.InputJsonValue;
  sortField?: string | null;
  sortDirection?: string | null;
  isShared?: boolean;
  icon?: string | null;
  color?: string | null;
}

/**
 * List saved views for an entity type.
 * Returns the user's own views plus any shared views from other org members.
 */
export async function listViews(
  organizationId: string,
  userId: string,
  entityType?: string
) {
  const where: Prisma.SavedViewWhereInput = {
    organizationId,
    AND: [
      {
        OR: [
          { userId },
          { isShared: true },
        ],
      },
      ...(entityType ? [{ entityType }] : []),
    ],
  };

  const views = await prisma.savedView.findMany({
    where,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return views;
}

/**
 * Create a new saved view.
 */
export async function createView(data: CreateViewData) {
  const view = await prisma.savedView.create({
    data: {
      organizationId: data.organizationId,
      userId: data.userId,
      name: data.name,
      entityType: data.entityType,
      filters: data.filters,
      sortField: data.sortField,
      sortDirection: data.sortDirection,
      isShared: data.isShared ?? false,
      icon: data.icon,
      color: data.color,
    },
  });

  logger.info('Saved view created', { viewId: view.id, entityType: data.entityType });
  return view;
}

/**
 * Update a saved view. Only the owner or an ADMIN can update.
 */
export async function updateView(
  id: string,
  organizationId: string,
  userId: string,
  orgRole: string,
  data: UpdateViewData
) {
  const existing = await prisma.savedView.findFirst({
    where: { id, organizationId },
  });

  if (!existing) {
    throw new AppError('Saved view not found', 404);
  }

  if (existing.userId !== userId && orgRole !== 'ADMIN' && orgRole !== 'OWNER') {
    throw new AppError('Not authorized to update this view', 403);
  }

  const view = await prisma.savedView.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.filters !== undefined && { filters: data.filters }),
      ...(data.sortField !== undefined && { sortField: data.sortField }),
      ...(data.sortDirection !== undefined && { sortDirection: data.sortDirection }),
      ...(data.isShared !== undefined && { isShared: data.isShared }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.color !== undefined && { color: data.color }),
    },
  });

  return view;
}

/**
 * Delete a saved view. Only the owner or an ADMIN can delete.
 */
export async function deleteView(
  id: string,
  organizationId: string,
  userId: string,
  orgRole: string
) {
  const existing = await prisma.savedView.findFirst({
    where: { id, organizationId },
  });

  if (!existing) {
    throw new AppError('Saved view not found', 404);
  }

  if (existing.userId !== userId && orgRole !== 'ADMIN' && orgRole !== 'OWNER') {
    throw new AppError('Not authorized to delete this view', 403);
  }

  await prisma.savedView.delete({ where: { id } });

  logger.info('Saved view deleted', { viewId: id });
}

/**
 * Set a view as the default for a given entity type.
 * Clears any previous default for that user + entity type, then sets the new one.
 */
export async function setDefault(
  id: string,
  organizationId: string,
  userId: string
) {
  const existing = await prisma.savedView.findFirst({
    where: { id, organizationId },
  });

  if (!existing) {
    throw new AppError('Saved view not found', 404);
  }

  // Only the owner can set their own default
  if (existing.userId !== userId && !existing.isShared) {
    throw new AppError('Not authorized to set this view as default', 403);
  }

  // Clear existing defaults for this user + entity type
  await prisma.savedView.updateMany({
    where: {
      organizationId,
      userId,
      entityType: existing.entityType,
      isDefault: true,
    },
    data: { isDefault: false },
  });

  // Set the new default
  const view = await prisma.savedView.update({
    where: { id },
    data: { isDefault: true },
  });

  return view;
}
