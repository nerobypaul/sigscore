import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useToast } from './Toast';
import SaveViewModal from './SaveViewModal';
import type { SavedView } from '../types';

interface SavedViewSelectorProps {
  entityType: 'contact' | 'company' | 'deal';
  currentFilters: Record<string, unknown>;
  onFiltersChange: (filters: Record<string, unknown>) => void;
}

const ENTITY_LABELS: Record<string, string> = {
  contact: 'Contacts',
  company: 'Companies',
  deal: 'Deals',
};

export default function SavedViewSelector({
  entityType,
  currentFilters,
  onFiltersChange,
}: SavedViewSelectorProps) {
  const toast = useToast();
  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuViewId, setMenuViewId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchViews = useCallback(async () => {
    try {
      const { data } = await api.get('/views', { params: { entityType } });
      setViews(data.views || []);

      // Auto-select default view on first load
      const defaultView = (data.views || []).find((v: SavedView) => v.isDefault);
      if (defaultView && !activeViewId) {
        setActiveViewId(defaultView.id);
        onFiltersChange(defaultView.filters);
      }
    } catch {
      // Silently fail — views are non-critical
    }
  }, [entityType]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuViewId(null);
      }
    };
    if (menuViewId) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [menuViewId]);

  const handleSelectAll = () => {
    setActiveViewId(null);
    onFiltersChange({});
  };

  const handleSelectView = (view: SavedView) => {
    setActiveViewId(view.id);
    onFiltersChange(view.filters);
  };

  const handleSaveView = async (data: { name: string; icon?: string; isShared: boolean }) => {
    setSaving(true);
    try {
      await api.post('/views', {
        name: data.name,
        entityType,
        filters: currentFilters,
        isShared: data.isShared,
        icon: data.icon,
      });
      toast.success('View saved');
      setShowSaveModal(false);
      fetchViews();
    } catch {
      toast.error('Failed to save view');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/views/${id}`);
      toast.success('View deleted');
      if (activeViewId === id) {
        setActiveViewId(null);
        onFiltersChange({});
      }
      setMenuViewId(null);
      fetchViews();
    } catch {
      toast.error('Failed to delete view');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await api.post(`/views/${id}/default`);
      toast.success('Default view updated');
      setMenuViewId(null);
      fetchViews();
    } catch {
      toast.error('Failed to set default view');
    }
  };

  const handleToggleShare = async (view: SavedView) => {
    try {
      await api.put(`/views/${view.id}`, { isShared: !view.isShared });
      toast.success(view.isShared ? 'View unshared' : 'View shared with team');
      setMenuViewId(null);
      fetchViews();
    } catch {
      toast.error('Failed to update view');
    }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) {
      setRenaming(null);
      return;
    }
    try {
      await api.put(`/views/${id}`, { name: renameValue.trim() });
      toast.success('View renamed');
      setRenaming(null);
      setMenuViewId(null);
      fetchViews();
    } catch {
      toast.error('Failed to rename view');
    }
  };

  return (
    <>
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {/* "All" tab */}
        <button
          onClick={handleSelectAll}
          className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
            activeViewId === null
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          All {ENTITY_LABELS[entityType]}
        </button>

        {/* Saved view tabs */}
        {views.map((view) => (
          <div key={view.id} className="relative flex items-center">
            {renaming === view.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(view.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(view.id);
                  if (e.key === 'Escape') setRenaming(null);
                }}
                autoFocus
                className="px-2 py-1 text-sm border border-indigo-300 rounded outline-none focus:ring-1 focus:ring-indigo-500 w-32"
              />
            ) : (
              <button
                onClick={() => handleSelectView(view)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuViewId(menuViewId === view.id ? null : view.id);
                }}
                className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeViewId === view.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {view.icon && <span>{view.icon}</span>}
                {view.name}
                {view.isDefault && (
                  <span className="text-xs text-indigo-400 ml-0.5">(default)</span>
                )}
              </button>
            )}

            {/* "..." menu trigger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuViewId(menuViewId === view.id ? null : view.id);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 hover:opacity-100 focus:opacity-100"
              style={{ opacity: menuViewId === view.id ? 1 : undefined }}
              aria-label="View options"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>

            {/* Context menu */}
            {menuViewId === view.id && (
              <div
                ref={menuRef}
                className="absolute top-full left-0 mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-44"
              >
                <button
                  onClick={() => {
                    setRenameValue(view.name);
                    setRenaming(view.id);
                    setMenuViewId(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={() => handleSetDefault(view.id)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {view.isDefault ? 'Unset default' : 'Set as default'}
                </button>
                <button
                  onClick={() => handleToggleShare(view)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {view.isShared ? 'Unshare' : 'Share with team'}
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => handleDelete(view.id)}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}

        {/* "+" save button */}
        <button
          onClick={() => setShowSaveModal(true)}
          className="px-2 py-2 text-gray-400 hover:text-indigo-600 transition-colors flex-shrink-0"
          title="Save current view"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {showSaveModal && (
        <SaveViewModal
          onSave={handleSaveView}
          onClose={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}
    </>
  );
}
