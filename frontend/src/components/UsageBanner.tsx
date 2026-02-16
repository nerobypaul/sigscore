import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UsageDimension {
  current: number;
  limit: number | null;
  percentage: number;
}

interface UsageData {
  plan: string;
  contacts: UsageDimension;
  signals: UsageDimension;
  users: UsageDimension;
}

interface AlertInfo {
  label: string;
  current: number;
  limit: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WARNING_THRESHOLD = 80;
const CRITICAL_THRESHOLD = 100;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // re-check every 5 minutes
const DISMISS_KEY = 'devsignal_usage_banner_dismissed';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Global banner that warns users when any usage metric is at 80%+ of plan limits.
 *
 * - 80-99%: yellow "Approaching limit" banner
 * - 100%:   red "Limit reached" banner with upgrade CTA
 * - Dismissible per session (comes back on next session / page reload)
 */
export default function UsageBanner() {
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem(DISMISS_KEY) === 'true';
  });

  const fetchUsage = useCallback(async () => {
    try {
      const { data } = await api.get('/usage');
      setUsageData(data);
    } catch {
      // Silently fail -- the banner is non-critical
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    const interval = setInterval(fetchUsage, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  if (dismissed || !usageData) return null;

  // Find the most critical metric that is at or above the warning threshold
  const dimensions: { key: string; label: string; dim: UsageDimension }[] = [
    { key: 'contacts', label: 'contacts', dim: usageData.contacts },
    { key: 'signals', label: 'signals this month', dim: usageData.signals },
    { key: 'users', label: 'users', dim: usageData.users },
  ];

  const alerts: AlertInfo[] = dimensions
    .filter((d) => d.dim.limit !== null && d.dim.percentage >= WARNING_THRESHOLD)
    .map((d) => ({
      label: d.label,
      current: d.dim.current,
      limit: d.dim.limit!,
      percentage: d.dim.percentage,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  if (alerts.length === 0) return null;

  const worstAlert = alerts[0];
  const isCritical = worstAlert.percentage >= CRITICAL_THRESHOLD;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, 'true');
  };

  return (
    <div
      className={`${
        isCritical
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      } border-b`}
      role="alert"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {isCritical ? (
            <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
          ) : (
            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          )}
          <p className="text-sm font-medium truncate">
            {isCritical ? (
              <>
                <span className="font-semibold">Limit reached:</span>{' '}
                {worstAlert.current.toLocaleString()} of {worstAlert.limit.toLocaleString()} {worstAlert.label} used.
                {alerts.length > 1 && ` (+${alerts.length - 1} more)`}
              </>
            ) : (
              <>
                <span className="font-semibold">Approaching limit:</span>{' '}
                {worstAlert.current.toLocaleString()} of {worstAlert.limit.toLocaleString()} {worstAlert.label} used ({worstAlert.percentage}%).
                {alerts.length > 1 && ` (+${alerts.length - 1} more)`}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Link
            to="/billing"
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
              isCritical
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-yellow-600 text-white hover:bg-yellow-700'
            }`}
          >
            Upgrade
          </Link>
          <button
            onClick={handleDismiss}
            className={`p-1 rounded-md transition-colors ${
              isCritical
                ? 'text-red-400 hover:text-red-600 hover:bg-red-100'
                : 'text-yellow-400 hover:text-yellow-600 hover:bg-yellow-100'
            }`}
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ExclamationTriangleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}

function ExclamationCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );
}
