import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogParams {
  organizationId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityName?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  metadata?: Record<string, unknown>;
}

interface AuditLogFilters {
  action?: string;
  entityType?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// logAudit — fire-and-forget audit log creation
// ---------------------------------------------------------------------------

export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        changes: params.changes as unknown as Prisma.InputJsonValue | undefined,
        metadata: params.metadata as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    // Never throw — audit logging is non-critical
    logger.error('Failed to write audit log', { error, params });
  }
}

// ---------------------------------------------------------------------------
// getAuditLogs — paginated list with cursor, filterable
// ---------------------------------------------------------------------------

export async function getAuditLogs(
  organizationId: string,
  filters: AuditLogFilters,
) {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);

  const where: Record<string, unknown> = { organizationId };

  if (filters.action) {
    where.action = filters.action;
  }
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }
  if (filters.userId) {
    where.userId = filters.userId;
  }
  if (filters.startDate || filters.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) {
      createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      createdAt.lte = new Date(filters.endDate);
    }
    where.createdAt = createdAt;
  }

  const auditLogs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(filters.cursor
      ? {
          cursor: { id: filters.cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = auditLogs.length > limit;
  const results = hasMore ? auditLogs.slice(0, limit) : auditLogs;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  return {
    auditLogs: results,
    nextCursor,
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// getEntityHistory — history for a specific entity
// ---------------------------------------------------------------------------

export async function getEntityHistory(
  organizationId: string,
  entityType: string,
  entityId: string,
) {
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      organizationId,
      entityType,
      entityId,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return { auditLogs };
}
