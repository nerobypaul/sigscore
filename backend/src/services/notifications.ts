import type { EmailDigestFrequency, SignalAlertLevel } from '@prisma/client';
import { prisma } from '../config/database';
import { broadcast } from './websocket';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

interface GetNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

// ---------------------------------------------------------------------------
// Create a single notification and broadcast via WebSocket
// ---------------------------------------------------------------------------

export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });

  // Broadcast to the organization via WebSocket — the frontend filters by userId
  broadcast(input.organizationId, {
    type: 'notification',
    data: { notification },
  });

  logger.debug('Notification created', {
    id: notification.id,
    userId: input.userId,
    type: input.type,
  });

  return notification;
}

// ---------------------------------------------------------------------------
// Get paginated notifications for a user (cursor-based)
// ---------------------------------------------------------------------------

export async function getNotifications(
  userId: string,
  options: GetNotificationsOptions = {}
) {
  const { unreadOnly = false, limit = 20, cursor } = options;

  const take = Math.min(Math.max(limit, 1), 100);

  const where: Record<string, unknown> = { userId };
  if (unreadOnly) {
    where.read = false;
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1, // fetch one extra to determine if there's a next page
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1, // skip the cursor itself
        }
      : {}),
  });

  const hasMore = notifications.length > take;
  const items = hasMore ? notifications.slice(0, take) : notifications;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    notifications: items,
    nextCursor,
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// Mark a single notification as read
// ---------------------------------------------------------------------------

export async function markAsRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  if (notification.userId !== userId) {
    throw new AppError('Notification not found', 404);
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Mark all notifications as read for a user
// ---------------------------------------------------------------------------

export async function markAllAsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return { updated: result.count };
}

// ---------------------------------------------------------------------------
// Get unread count for a user
// ---------------------------------------------------------------------------

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

// ---------------------------------------------------------------------------
// Notify all users in an organization (bulk create + broadcast)
// ---------------------------------------------------------------------------

export async function notifyOrgUsers(
  organizationId: string,
  input: {
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    excludeUserId?: string;
  }
) {
  // Find all users in the organization
  const memberships = await prisma.userOrganization.findMany({
    where: { organizationId },
    select: { userId: true },
  });

  const userIds = memberships
    .map((m) => m.userId)
    .filter((id) => id !== input.excludeUserId);

  if (userIds.length === 0) return [];

  // Batch-create notifications for all org users
  const notifications = await Promise.all(
    userIds.map((userId) =>
      createNotification({
        organizationId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      })
    )
  );

  logger.debug('Org-wide notifications created', {
    organizationId,
    count: notifications.length,
    type: input.type,
  });

  return notifications;
}

// ---------------------------------------------------------------------------
// Notification preference types
// ---------------------------------------------------------------------------

export interface NotificationPreferenceData {
  emailDigest: EmailDigestFrequency;
  signalAlerts: SignalAlertLevel;
  workflowNotifications: boolean;
  teamMentions: boolean;
  usageLimitWarnings: boolean;
}

export interface NotificationPreferenceResponse extends NotificationPreferenceData {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Get notification preferences (returns defaults if none exist yet)
// ---------------------------------------------------------------------------

const DEFAULT_PREFERENCES: NotificationPreferenceData = {
  emailDigest: 'WEEKLY' as EmailDigestFrequency,
  signalAlerts: 'ALL' as SignalAlertLevel,
  workflowNotifications: true,
  teamMentions: true,
  usageLimitWarnings: true,
};

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferenceResponse> {
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  // Return a virtual default (not yet persisted) so the frontend always gets a response
  return {
    id: '',
    userId,
    ...DEFAULT_PREFERENCES,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Upsert notification preferences
// ---------------------------------------------------------------------------

export async function upsertNotificationPreferences(
  userId: string,
  data: Partial<NotificationPreferenceData>
): Promise<NotificationPreferenceResponse> {
  const preference = await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      emailDigest: data.emailDigest ?? DEFAULT_PREFERENCES.emailDigest,
      signalAlerts: data.signalAlerts ?? DEFAULT_PREFERENCES.signalAlerts,
      workflowNotifications:
        data.workflowNotifications ?? DEFAULT_PREFERENCES.workflowNotifications,
      teamMentions: data.teamMentions ?? DEFAULT_PREFERENCES.teamMentions,
      usageLimitWarnings:
        data.usageLimitWarnings ?? DEFAULT_PREFERENCES.usageLimitWarnings,
    },
    update: {
      ...(data.emailDigest !== undefined && { emailDigest: data.emailDigest }),
      ...(data.signalAlerts !== undefined && { signalAlerts: data.signalAlerts }),
      ...(data.workflowNotifications !== undefined && {
        workflowNotifications: data.workflowNotifications,
      }),
      ...(data.teamMentions !== undefined && { teamMentions: data.teamMentions }),
      ...(data.usageLimitWarnings !== undefined && {
        usageLimitWarnings: data.usageLimitWarnings,
      }),
    },
  });

  logger.debug('Notification preferences updated', { userId, data });

  return preference;
}
