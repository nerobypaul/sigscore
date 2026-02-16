/**
 * Sidebar trigger button for the Command Palette.
 * The actual modal lives at the App level (rendered once in AppRoutes).
 * This button dispatches a custom DOM event to open it.
 */
export default function CommandPaletteTrigger() {
  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('devsignal:open-command-palette'));
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <span className="flex-1 text-left">Search...</span>
      <kbd className="hidden sm:inline text-[10px] text-gray-500 bg-gray-700/70 border border-gray-600 px-1.5 py-0.5 rounded font-mono">
        {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}K
      </kbd>
    </button>
  );
}
