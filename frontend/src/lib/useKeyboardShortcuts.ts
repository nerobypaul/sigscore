import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Keyboard shortcuts hook for global navigation.
 *
 * Supports "g then X" two-key navigation combos:
 *   g d → Dashboard
 *   g c → Contacts
 *   g o → Companies (Organizations)
 *   g e → Deals
 *   g a → Activities
 *   g s → Signals
 *   g p → PQA Scores
 *   g w → Workflows
 *   g b → Billing
 *   g t → Settings
 *
 * Single-key shortcuts:
 *   ? → Show/hide keyboard shortcuts help
 */
export function useKeyboardShortcuts(onToggleHelp: () => void) {
  const navigate = useNavigate();
  const pendingG = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPending = useCallback(() => {
    pendingG.current = false;
    if (gTimer.current) {
      clearTimeout(gTimer.current);
      gTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input, textarea, select, or contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Skip if any modifier keys are held (Cmd, Ctrl, Alt)
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();

      // Handle second key after "g"
      if (pendingG.current) {
        clearPending();
        const routes: Record<string, string> = {
          d: '/',
          c: '/contacts',
          o: '/companies',
          e: '/deals',
          a: '/activities',
          s: '/signals',
          p: '/scores',
          w: '/workflows',
          b: '/billing',
          t: '/settings',
        };
        if (routes[key]) {
          e.preventDefault();
          navigate(routes[key]);
        }
        return;
      }

      // "g" starts a two-key sequence
      if (key === 'g') {
        pendingG.current = true;
        // Auto-cancel after 1 second
        gTimer.current = setTimeout(clearPending, 1000);
        return;
      }

      // "?" toggles help
      if (e.key === '?') {
        e.preventDefault();
        onToggleHelp();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearPending();
    };
  }, [navigate, onToggleHelp, clearPending]);
}
