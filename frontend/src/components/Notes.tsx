import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from './Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NoteAuthor {
  id: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
}

interface NoteData {
  id: string;
  content: string;
  authorId: string;
  author: NoteAuthor;
  entityType: string;
  entityId: string;
  mentions: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotesProps {
  entityType: 'company' | 'contact' | 'deal';
  entityId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

/** Render note content with @mentions highlighted */
function renderContent(content: string): (string | JSX.Element)[] {
  const mentionRegex = /@\[([^\]]*)\]\(([^)]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={`mention-${match.index}`}
        className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium"
      >
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function Notes({ entityType, entityId }: NotesProps) {
  const { user } = useAuth();
  const toast = useToast();

  const [notes, setNotes] = useState<NoteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Determine if current user is an admin/owner in the org
  const currentOrgId = localStorage.getItem('organizationId');
  const orgMembership = user?.organizations?.find(
    (uo) => uo.organizationId === currentOrgId,
  );
  const isAdmin = orgMembership?.role === 'ADMIN' || orgMembership?.role === 'OWNER';

  // -------------------------------------------------------------------------
  // Fetch notes
  // -------------------------------------------------------------------------

  const fetchNotes = useCallback(async () => {
    try {
      const { data } = await api.get('/notes', {
        params: { entityType, entityId, limit: 50 },
      });
      setNotes(data.notes || []);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore || false);
    } catch {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // -------------------------------------------------------------------------
  // Load more
  // -------------------------------------------------------------------------

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { data } = await api.get('/notes', {
        params: { entityType, entityId, limit: 50, cursor: nextCursor },
      });
      setNotes((prev) => [...prev, ...(data.notes || [])]);
      setNextCursor(data.nextCursor || null);
      setHasMore(data.hasMore || false);
    } catch {
      toast.error('Failed to load more notes');
    } finally {
      setLoadingMore(false);
    }
  };

  // -------------------------------------------------------------------------
  // Create note
  // -------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const { data } = await api.post('/notes', {
        entityType,
        entityId,
        content: newContent.trim(),
      });
      // Insert new note after pinned notes
      setNotes((prev) => {
        const pinnedNotes = prev.filter((n) => n.isPinned);
        const unpinnedNotes = prev.filter((n) => !n.isPinned);
        return [...pinnedNotes, data, ...unpinnedNotes];
      });
      setNewContent('');
      inputRef.current?.focus();
    } catch {
      toast.error('Failed to post note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // -------------------------------------------------------------------------
  // Edit note
  // -------------------------------------------------------------------------

  const startEdit = (note: NoteData) => {
    setEditingId(note.id);
    setEditContent(note.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    try {
      const { data } = await api.patch(`/notes/${editingId}`, {
        content: editContent.trim(),
      });
      setNotes((prev) => prev.map((n) => (n.id === editingId ? data : n)));
      setEditingId(null);
      setEditContent('');
    } catch {
      toast.error('Failed to update note');
    }
  };

  // -------------------------------------------------------------------------
  // Delete note
  // -------------------------------------------------------------------------

  const handleDelete = async (noteId: string) => {
    if (!confirm('Delete this note?')) return;
    try {
      await api.delete(`/notes/${noteId}`);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      toast.error('Failed to delete note');
    }
  };

  // -------------------------------------------------------------------------
  // Pin/unpin
  // -------------------------------------------------------------------------

  const handleTogglePin = async (noteId: string) => {
    try {
      const { data } = await api.post(`/notes/${noteId}/pin`);
      setNotes((prev) => {
        const updated = prev.map((n) => (n.id === noteId ? data : n));
        // Re-sort so pinned notes come first
        const pinned = updated.filter((n) => n.isPinned);
        const unpinned = updated.filter((n) => !n.isPinned);
        return [...pinned, ...unpinned];
      });
    } catch {
      toast.error('Failed to toggle pin');
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900">
          Notes
          {!loading && notes.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-gray-400">({notes.length})</span>
          )}
        </h3>
      </div>

      {/* New note input */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex gap-3">
          {user && (
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
          )}
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note... (Cmd+Enter to post)"
              rows={2}
              className="w-full text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center justify-end mt-2 gap-2">
              <span className="text-xs text-gray-400 mr-auto">
                Use @[Name](userId) to mention team members
              </span>
              <button
                onClick={handleSubmit}
                disabled={!newContent.trim() || submitting}
                className="px-3.5 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notes list */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="px-5 py-8 text-center">
            <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-gray-400 mt-2">Loading notes...</p>
          </div>
        ) : notes.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <svg className="w-10 h-10 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <p className="text-sm text-gray-400">No notes yet. Be the first to add one.</p>
          </div>
        ) : (
          <>
            {notes.map((note) => {
              const isAuthor = note.authorId === user?.id;
              const canEdit = isAuthor || isAdmin;
              const isEditing = editingId === note.id;

              return (
                <div
                  key={note.id}
                  className={`px-5 py-4 hover:bg-gray-50/50 transition-colors ${
                    note.isPinned ? 'bg-amber-50/30' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Author avatar */}
                    <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {note.author.firstName?.[0]}{note.author.lastName?.[0]}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">
                          {note.author.firstName} {note.author.lastName}
                        </span>
                        <span className="text-xs text-gray-400">{timeAgo(note.createdAt)}</span>
                        {note.isPinned && (
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                            </svg>
                            Pinned
                          </span>
                        )}
                        {note.createdAt !== note.updatedAt && (
                          <span className="text-xs text-gray-400 italic">(edited)</span>
                        )}
                      </div>

                      {/* Content */}
                      {isEditing ? (
                        <div className="mt-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full text-sm text-gray-900 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={saveEdit}
                              disabled={!editContent.trim()}
                              className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap leading-relaxed">
                          {renderContent(note.content)}
                        </p>
                      )}

                      {/* Action buttons */}
                      {!isEditing && canEdit && (
                        <div className="flex items-center gap-3 mt-2">
                          {(isAuthor || isAdmin) && (
                            <button
                              onClick={() => startEdit(note)}
                              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          {(isAuthor || isAdmin) && (
                            <button
                              onClick={() => handleDelete(note.id)}
                              className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => handleTogglePin(note.id)}
                              className="text-xs text-gray-400 hover:text-amber-600 transition-colors"
                            >
                              {note.isPinned ? 'Unpin' : 'Pin'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load more */}
            {hasMore && (
              <div className="px-5 py-3 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Loading...' : 'Load more notes'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
