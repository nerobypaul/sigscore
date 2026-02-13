import { useEffect } from 'react';

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      { keys: ['g', 'd'], description: 'Go to Dashboard' },
      { keys: ['g', 'c'], description: 'Go to Contacts' },
      { keys: ['g', 'o'], description: 'Go to Companies' },
      { keys: ['g', 'e'], description: 'Go to Deals' },
      { keys: ['g', 'a'], description: 'Go to Activities' },
      { keys: ['g', 's'], description: 'Go to Signals' },
      { keys: ['g', 'p'], description: 'Go to PQA Scores' },
      { keys: ['g', 'w'], description: 'Go to Workflows' },
      { keys: ['g', 'b'], description: 'Go to Billing' },
      { keys: ['g', 't'], description: 'Go to Settings' },
    ],
  },
  {
    category: 'General',
    items: [
      { keys: ['\u2318', 'K'], description: 'Open search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close dialog / dropdown' },
    ],
  },
];

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono font-medium text-gray-700 shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {group.category}
              </h3>
              <div className="space-y-2">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-xs text-gray-400">then</span>
                          )}
                          <Key>{key}</Key>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
