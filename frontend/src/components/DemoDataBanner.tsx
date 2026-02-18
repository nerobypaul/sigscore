import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from './Toast';

export default function DemoDataBanner() {
  const toast = useToast();
  const [hasDemoData, setHasDemoData] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/demo/org-status')
      .then(({ data }) => {
        if (!cancelled) {
          setHasDemoData(data.hasDemoData === true);
        }
      })
      .catch(() => {
        // If the endpoint fails (e.g. no org, no auth), just hide the banner
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleClear = async () => {
    setClearing(true);
    try {
      await api.delete('/demo/org-seed');
      setHasDemoData(false);
      // Reload the page so dashboard reflects the cleared data
      window.location.reload();
    } catch {
      toast.error('Failed to clear demo data');
      setClearing(false);
    }
  };

  if (!loaded || !hasDemoData) return null;

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <svg
          className="w-5 h-5 text-indigo-500 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
          />
        </svg>
        <p className="text-sm text-indigo-700">
          You're viewing demo data. Connect your real signals to see your actual accounts.
        </p>
      </div>
      <button
        type="button"
        onClick={handleClear}
        disabled={clearing}
        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors whitespace-nowrap disabled:opacity-50"
      >
        {clearing ? 'Clearing...' : 'Clear demo data'}
      </button>
    </div>
  );
}
