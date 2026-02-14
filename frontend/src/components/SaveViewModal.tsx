import { useState } from 'react';

const ICON_OPTIONS = ['', '🔍', '⭐', '🔥', '📋', '🎯', '💎'];

interface SaveViewModalProps {
  onSave: (data: { name: string; icon?: string; isShared: boolean }) => void;
  onClose: () => void;
  saving?: boolean;
}

export default function SaveViewModal({ onSave, onClose, saving }: SaveViewModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [isShared, setIsShared] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon: icon || undefined, isShared });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Save View</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">View name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., High-value contacts"
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon (optional)</label>
            <div className="flex gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt || '__none'}
                  type="button"
                  onClick={() => setIcon(opt)}
                  className={`w-9 h-9 rounded-lg border text-base flex items-center justify-center transition-colors ${
                    icon === opt
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt || (
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isShared}
              onClick={() => setIsShared(!isShared)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                isShared ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isShared ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">Share with team</span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
