import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpgradeModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Called when the user dismisses the modal */
  onClose: () => void;
  /** The specific error message from the 402 response */
  error?: string;
  /** Current usage count that triggered the limit */
  current?: number;
  /** The plan limit that was hit */
  limit?: number;
  /** The user's current tier (e.g. "FREE", "PRO") */
  tier?: string;
}

// ---------------------------------------------------------------------------
// Plan data for tier comparison
// ---------------------------------------------------------------------------

interface TierInfo {
  name: string;
  price: string;
  contacts: string;
  signals: string;
  users: string;
}

const TIER_INFO: Record<string, TierInfo> = {
  FREE: {
    name: 'Free',
    price: '$0/mo',
    contacts: '1,000',
    signals: '5,000/mo',
    users: '1',
  },
  PRO: {
    name: 'Pro',
    price: '$79/mo',
    contacts: '25,000',
    signals: '100,000/mo',
    users: '10',
  },
  GROWTH: {
    name: 'Growth',
    price: '$199/mo',
    contacts: '100,000',
    signals: '500,000/mo',
    users: '25',
  },
  SCALE: {
    name: 'Scale',
    price: '$299/mo',
    contacts: 'Unlimited',
    signals: 'Unlimited',
    users: 'Unlimited',
  },
};

const TIER_ORDER = ['FREE', 'PRO', 'GROWTH', 'SCALE'];

function getNextTier(currentTier: string): string | null {
  const idx = TIER_ORDER.indexOf(currentTier.toUpperCase());
  if (idx === -1 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function UpgradeModal({
  open,
  onClose,
  error,
  current,
  limit,
  tier,
}: UpgradeModalProps) {
  const navigate = useNavigate();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  const currentTierKey = (tier || 'FREE').toUpperCase();
  const nextTierKey = getNextTier(currentTierKey);
  const currentTierInfo = TIER_INFO[currentTierKey] || TIER_INFO.FREE;
  const nextTierInfo = nextTierKey ? TIER_INFO[nextTierKey] : null;

  const handleUpgrade = () => {
    onClose();
    navigate('/billing');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold">Plan Limit Reached</h2>
                <p className="text-sm text-white/80 mt-0.5">
                  {error || 'You have reached a limit on your current plan.'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Usage info */}
        {current !== undefined && limit !== undefined && (
          <div className="px-6 pt-5">
            <div className="bg-red-50 border border-red-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-red-800">Current usage</span>
                <span className="text-sm font-bold text-red-800">
                  {current.toLocaleString()} / {limit.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-2 bg-red-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Tier comparison */}
        {nextTierInfo && (
          <div className="px-6 pt-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Tier Comparison
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Current tier */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-400 uppercase mb-1">Current</div>
                <div className="text-lg font-bold text-gray-900">{currentTierInfo.name}</div>
                <div className="text-sm text-gray-500 mb-3">{currentTierInfo.price}</div>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <div>{currentTierInfo.contacts} contacts</div>
                  <div>{currentTierInfo.signals} signals</div>
                  <div>{currentTierInfo.users} user{currentTierInfo.users !== '1' ? 's' : ''}</div>
                </div>
              </div>

              {/* Next tier */}
              <div className="border-2 border-indigo-500 rounded-lg p-4 bg-indigo-50/50">
                <div className="text-xs font-medium text-indigo-500 uppercase mb-1">Recommended</div>
                <div className="text-lg font-bold text-gray-900">{nextTierInfo.name}</div>
                <div className="text-sm text-indigo-600 font-semibold mb-3">{nextTierInfo.price}</div>
                <div className="space-y-1.5 text-xs text-gray-700">
                  <div className="font-medium">{nextTierInfo.contacts} contacts</div>
                  <div className="font-medium">{nextTierInfo.signals} signals</div>
                  <div className="font-medium">{nextTierInfo.users} user{nextTierInfo.users !== '1' ? 's' : ''}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Maybe Later
          </button>
          <button
            onClick={handleUpgrade}
            className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
}
