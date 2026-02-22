import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logAudit } from './audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateNoteParams {
  organizationId: string;
  authorId: string;
  entityType: string;
  entityId: string;
  content: string;
}

interface UpdateNoteParams {
  noteId: string;
  organizationId: string;
  userId: string;
  userRole: string;
  content: string;
}

interface DeleteNoteParams {
  noteId: string;
  organizationId: string;
  userId: string;
  userRole: string;
}

interface ListNotesParams {
  organizationId: string;
  entityType: string;
  entityId: string;
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract @mentions from content using the format @[Display Name](userId)
 * Returns an array of unique user IDs.
 */
export function extractMentions(content: string): string[] {
  const mentionRegex = /@\[([^\]]*)\]\(([^)]+)\)/g;
  const userIds: Set<string> = new Set();
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(content)) !== null) {
    userIds.add(match[2]);
  }
  return Array.from(userIds);
}

const VALID_ENTITY_TYPES = ['company', 'contact', 'deal'];

function validateEntityType(entityType: string): void {
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    throw new AppError(`Invalid entity type: ${entityType}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`, 400);
  }
}

// ---------------------------------------------------------------------------
// createNote
// ---------------------------------------------------------------------------

export async function createNote(params: CreateNoteParams) {
  validateEntityType(params.entityType);

  if (!params.content || params.content.trim().length === 0) {
    throw new AppError('Note content is required', 400);
  }

  const mentions = extractMentions(params.content);

  const note = await prisma.note.create({
    data: {
      organizationId: params.organizationId,
      authorId: params.authorId,
      entityType: params.entityType,
      entityId: params.entityId,
      content: params.content.trim(),
      mentions,
    },
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  // Fire-and-forget audit log
  logAudit({
    organizationId: params.organizationId,
    userId: params.authorId,
    action: 'create',
    entityType: 'note',
    entityId: note.id,
    metadata: {
      parentEntityType: params.entityType,
      parentEntityId: params.entityId,
      mentionCount: mentions.length,
    },
  });

  return note;
}

// ---------------------------------------------------------------------------
// listNotes — cursor-based pagination, pinned first
// ---------------------------------------------------------------------------

export async function listNotes(params: ListNotesParams) {
  validateEntityType(params.entityType);

  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);

  // Fetch pinned notes first (always shown at top, no pagination)
  const pinnedNotes = await prisma.note.findMany({
    where: {
      organizationId: params.organizationId,
      entityType: params.entityType,
      entityId: params.entityId,
      isPinned: true,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  // Fetch unpinned notes with cursor pagination
  const unpinnedNotes = await prisma.note.findMany({
    where: {
      organizationId: params.organizationId,
      entityType: params.entityType,
      entityId: params.entityId,
      isPinned: false,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(params.cursor
      ? {
          cursor: { id: params.cursor },
          skip: 1,
        }
      : {}),
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  const hasMore = unpinnedNotes.length > limit;
  const results = hasMore ? unpinnedNotes.slice(0, limit) : unpinnedNotes;
  const nextCursor = hasMore ? results[results.length - 1].id : null;

  return {
    notes: [...pinnedNotes, ...results],
    nextCursor,
    hasMore,
  };
}

// ---------------------------------------------------------------------------
// updateNote — only author or ADMIN/OWNER can update
// ---------------------------------------------------------------------------

export async function updateNote(params: UpdateNoteParams) {
  const note = await prisma.note.findFirst({
    where: {
      id: params.noteId,
      organizationId: params.organizationId,
    },
  });

  if (!note) {
    throw new AppError('Note not found', 404);
  }

  const isAuthor = note.authorId === params.userId;
  const isPrivileged = params.userRole === 'ADMIN' || params.userRole === 'OWNER';

  if (!isAuthor && !isPrivileged) {
    throw new AppError('You can only edit your own notes', 403);
  }

  if (!params.content || params.content.trim().length === 0) {
    throw new AppError('Note content is required', 400);
  }

  const mentions = extractMentions(params.content);

  const updated = await prisma.note.update({
    where: { id: params.noteId },
    data: {
      content: params.content.trim(),
      mentions,
    },
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  logAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: 'update',
    entityType: 'note',
    entityId: params.noteId,
    changes: { content: { from: note.content, to: params.content.trim() } },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// deleteNote — only author or ADMIN/OWNER can delete
// ---------------------------------------------------------------------------

export async function deleteNote(params: DeleteNoteParams) {
  const note = await prisma.note.findFirst({
    where: {
      id: params.noteId,
      organizationId: params.organizationId,
    },
  });

  if (!note) {
    throw new AppError('Note not found', 404);
  }

  const isAuthor = note.authorId === params.userId;
  const isPrivileged = params.userRole === 'ADMIN' || params.userRole === 'OWNER';

  if (!isAuthor && !isPrivileged) {
    throw new AppError('You can only delete your own notes', 403);
  }

  await prisma.note.delete({ where: { id: params.noteId } });

  logAudit({
    organizationId: params.organizationId,
    userId: params.userId,
    action: 'delete',
    entityType: 'note',
    entityId: params.noteId,
    metadata: {
      parentEntityType: note.entityType,
      parentEntityId: note.entityId,
    },
  });
}

// ---------------------------------------------------------------------------
// togglePin — ADMIN/OWNER only
// ---------------------------------------------------------------------------

export async function togglePin(
  noteId: string,
  organizationId: string,
  userId: string,
  userRole: string,
) {
  const isPrivileged = userRole === 'ADMIN' || userRole === 'OWNER';
  if (!isPrivileged) {
    throw new AppError('Only admins can pin or unpin notes', 403);
  }

  const note = await prisma.note.findFirst({
    where: { id: noteId, organizationId },
  });

  if (!note) {
    throw new AppError('Note not found', 404);
  }

  const updated = await prisma.note.update({
    where: { id: noteId },
    data: { isPinned: !note.isPinned },
    include: {
      author: {
        select: { id: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });

  logAudit({
    organizationId,
    userId,
    action: 'update',
    entityType: 'note',
    entityId: noteId,
    changes: { isPinned: { from: note.isPinned, to: !note.isPinned } },
  });

  return updated;
}
