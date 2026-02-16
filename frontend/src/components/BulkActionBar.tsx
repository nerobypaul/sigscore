import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from './Toast';
import { DEAL_STAGES, STAGE_LABELS } from '../types';
import type { DealStage } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Member {
  userId: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface BulkActionBarProps {
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onActionComplete: () => void;
}

type ActiveDropdown = 'add_tag' | 'remove_tag' | 'update_stage' | 'assign_owner' | null;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BulkActionBar({
  selectedIds,
  onClearSelection,
  onActionComplete,
}: BulkActionBarProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);

  // Input state for each action
  const [tagInput, setTagInput] = useState('');
  const [removeTagInput, setRemoveTagInput] = useState('');
  const [stageInput, setStageInput] = useState<DealStage | ''>('');
  const [ownerInput, setOwnerInput] = useState('');

  // Data for dropdowns
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch tags for selected contacts when remove_tag dropdown opens
  useEffect(() => {
    if (activeDropdown === 'remove_tag') {
      const ids = Array.from(selectedIds);
      // Fetch tags for the selected contacts
      Promise.all(
        ids.slice(0, 50).map((id) =>
          api.get(`/contacts/${id}`).then((r) => {
            const tags = r.data?.tags as Array<{ tag: { name: string } }> | undefined;
            return tags?.map((t) => t.tag.name) ?? [];
          }).catch(() => [] as string[])
        )
      ).then((results) => {
        const allTags = new Set<string>();
        results.forEach((tagList) => tagList.forEach((t) => allTags.add(t)));
        setExistingTags(Array.from(allTags).sort());
      });
    }
  }, [activeDropdown, selectedIds]);

  // Fetch members when assign_owner dropdown opens
  useEffect(() => {
    if (activeDropdown === 'assign_owner') {
      api.get('/members')
        .then(({ data }) => setMembers(data.members || []))
        .catch(() => setMembers([]));
    }
  }, [activeDropdown]);

  const contactIds = Array.from(selectedIds);

  const executeBulkAction = useCallback(
    async (action: string, params: Record<string, unknown>) => {
      setLoading(true);
      try {
        const isExport = action === 'export';

        if (isExport) {
          const { data } = await api.post('/contacts/bulk-action', {
            contactIds,
            action,
            params,
          }, { responseType: 'blob' });

          const blob = new Blob([data], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `contacts-bulk-export-${new Date().toISOString().slice(0, 10)}.csv`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.URL.revokeObjectURL(url);

          toast.success(`Exported ${contactIds.length} contacts`);
        } else {
          const { data } = await api.post('/contacts/bulk-action', {
            contactIds,
            action,
            params,
          });

          const actionLabels: Record<string, string> = {
            add_tag: 'Tagged',
            remove_tag: 'Untagged',
            update_stage: 'Updated stage for',
            assign_owner: 'Assigned owner for',
          };
          const label = actionLabels[action] || 'Updated';
          toast.success(`${label} ${data.affected} item${data.affected !== 1 ? 's' : ''}`);
        }

        setActiveDropdown(null);
        onClearSelection();
        onActionComplete();
      } catch {
        toast.error('Bulk action failed. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [contactIds, toast, onClearSelection, onActionComplete]
  );

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    executeBulkAction('add_tag', { tag: tagInput.trim() });
    setTagInput('');
  };

  const handleRemoveTag = () => {
    if (!removeTagInput) return;
    executeBulkAction('remove_tag', { tag: removeTagInput });
    setRemoveTagInput('');
  };

  const handleUpdateStage = () => {
    if (!stageInput) return;
    executeBulkAction('update_stage', { stage: stageInput });
    setStageInput('');
  };

  const handleAssignOwner = () => {
    if (!ownerInput) return;
    executeBulkAction('assign_owner', { ownerId: ownerInput });
    setOwnerInput('');
  };

  const handleExport = () => {
    executeBulkAction('export', {});
  };

  const toggleDropdown = (dropdown: ActiveDropdown) => {
    setActiveDropdown((prev) => (prev === dropdown ? null : dropdown));
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom">
      <div className="mx-auto max-w-5xl px-4 pb-4">
        <div
          ref={dropdownRef}
          className="relative bg-gray-900 text-white rounded-xl shadow-2xl px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3"
        >
          {/* Count */}
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''} selected
          </span>

          <div className="hidden sm:block h-5 w-px bg-gray-600" />

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => toggleDropdown('add_tag')}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeDropdown === 'add_tag'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Tag
            </button>

            <button
              onClick={() => toggleDropdown('remove_tag')}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeDropdown === 'remove_tag'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Remove Tag
            </button>

            <button
              onClick={() => toggleDropdown('update_stage')}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeDropdown === 'update_stage'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Change Stage
            </button>

            <button
              onClick={() => toggleDropdown('assign_owner')}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeDropdown === 'assign_owner'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
              } disabled:opacity-50`}
            >
              Assign Owner
            </button>

            <button
              onClick={handleExport}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              {loading ? 'Exporting...' : 'Export'}
            </button>
          </div>

          {/* Clear / Close */}
          <button
            onClick={onClearSelection}
            className="ml-auto text-xs text-gray-400 hover:text-white transition-colors"
          >
            Clear
          </button>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-gray-900/80 rounded-xl flex items-center justify-center">
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-2 text-sm">Processing...</span>
            </div>
          )}

          {/* --- Dropdowns --- */}

          {/* Add Tag Dropdown */}
          {activeDropdown === 'add_tag' && (
            <div className="absolute bottom-full mb-2 left-4 sm:left-auto sm:right-auto bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-64">
              <p className="text-xs font-semibold text-gray-700 mb-2">Add tag to {selectedIds.size} contacts</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Tag name..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagInput.trim()) handleAddTag();
                  }}
                  autoFocus
                  className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <button
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Remove Tag Dropdown */}
          {activeDropdown === 'remove_tag' && (
            <div className="absolute bottom-full mb-2 left-4 sm:left-auto sm:right-auto bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-64">
              <p className="text-xs font-semibold text-gray-700 mb-2">Remove tag from {selectedIds.size} contacts</p>
              {existingTags.length === 0 ? (
                <p className="text-xs text-gray-400">No tags found on selected contacts</p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={removeTagInput}
                    onChange={(e) => setRemoveTagInput(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="">Select tag...</option>
                    {existingTags.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleRemoveTag}
                    disabled={!removeTagInput}
                    className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Update Stage Dropdown */}
          {activeDropdown === 'update_stage' && (
            <div className="absolute bottom-full mb-2 left-4 sm:left-auto sm:right-auto bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-72">
              <p className="text-xs font-semibold text-gray-700 mb-2">Change deal stage for {selectedIds.size} contacts</p>
              <div className="flex gap-2">
                <select
                  value={stageInput}
                  onChange={(e) => setStageInput(e.target.value as DealStage)}
                  className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Select stage...</option>
                  {DEAL_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleUpdateStage}
                  disabled={!stageInput}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Assign Owner Dropdown */}
          {activeDropdown === 'assign_owner' && (
            <div className="absolute bottom-full mb-2 left-4 sm:left-auto sm:right-auto bg-white rounded-lg shadow-xl border border-gray-200 p-3 w-72">
              <p className="text-xs font-semibold text-gray-700 mb-2">Assign owner for {selectedIds.size} contacts</p>
              {members.length === 0 ? (
                <p className="text-xs text-gray-400">Loading team members...</p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={ownerInput}
                    onChange={(e) => setOwnerInput(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="">Select owner...</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.firstName} {m.user.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignOwner}
                    disabled={!ownerInput}
                    className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
