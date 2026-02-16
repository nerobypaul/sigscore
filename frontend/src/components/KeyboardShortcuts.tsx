import { useEffect, useRef } from 'react';

interface ShortcutItem {
  keys: string[];
  separator?: string;
  description: string;
}

interface ShortcutGroup {
  category: string;
  items: ShortcutItem[];
}

const shortcuts: ShortcutGroup[] = [
  {
    category: 'Navigation',
    items: [
      { keys: ['g', 'd'], separator: 'then', description: 'Go to Dashboard' },
      { keys: ['g', 'c'], separator: 'then', description: 'Go to Contacts' },
      { keys: ['g', 'o'], separator: 'then', description: 'Go to Companies' },
      { keys: ['g', 'e'], separator: 'then', description: 'Go to Deals' },
      { keys: ['g', 'a'], separator: 'then', description: 'Go to Activities' },
      { keys: ['g', 's'], separator: 'then', description: 'Go to Signals' },
      { keys: ['g', 'p'], separator: 'then', description: 'Go to PQA Scores' },
      { keys: ['g', 'w'], separator: 'then', description: 'Go to Workflows' },
      { keys: ['g', 'b'], separator: 'then', description: 'Go to Billing' },
      { keys: ['g', 't'], separator: 'then', description: 'Go to Settings' },
    ],
  },
  {
    category: 'Search',
    items: [
      {
        keys: [isMac() ? '\u2318' : 'Ctrl', 'K'],
        separator: '+',
        description: 'Open search',
      },
      { keys: ['Esc'], description: 'Close search / dialogs' },
    ],
  },
  {
    category: 'General',
    items: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
];

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac');
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-[26px] px-1.5 bg-gray-700 border border-gray-600 rounded-md text-xs font-mono font-medium text-gray-200 shadow-[0_1px_0_1px_rgba(0,0,0,0.3)]">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcuts({ onClose }: { onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  // Trap focus inside the modal for accessibility
  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previousActive?.focus();
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-100">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors rounded-lg p-1 hover:bg-gray-800"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcut list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-3">
                {group.category}
              </h3>
              <div className="space-y-1">
                {group.items.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-gray-800/50 transition-colors"
                  >
                    <span className="text-sm text-gray-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && (
                            <span className="text-[10px] text-gray-600 mx-0.5">
                              {shortcut.separator ?? 'then'}
                            </span>
                          )}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700/50 flex-shrink-0">
          <p className="text-xs text-gray-600 text-center">
            Press <Kbd>?</Kbd> to toggle this dialog
          </p>
        </div>
      </div>
    </div>
  );
}
