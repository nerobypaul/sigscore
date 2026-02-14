import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

const DISMISSED_KEY = 'devsignal_onboarding_dismissed';

interface ChecklistItem {
  id: string;
  label: string;
  href?: string;
  done: boolean;
  detail?: React.ReactNode;
}

export default function GettingStarted() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  });
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    let cancelled = false;

    async function fetchCounts() {
      try {
        const [contactsRes, sourcesRes, membersRes] = await Promise.all([
          api.get('/contacts', { params: { limit: 1 } }).catch(() => null),
          api.get('/sources', { params: { limit: 100 } }).catch(() => null),
          api.get('/members').catch(() => null),
        ]);

        if (cancelled) return;

        setContactCount(contactsRes?.data?.pagination?.total ?? 0);

        // Count signal sources, excluding demo sources
        const sources = sourcesRes?.data?.sources || sourcesRes?.data || [];
        const realSources = Array.isArray(sources)
          ? sources.filter((s: { name?: string }) => s.name !== 'Demo Signal Source')
          : [];
        setSourceCount(realSources.length);

        const members = membersRes?.data?.members || membersRes?.data || [];
        setMemberCount(Array.isArray(members) ? members.length : 0);
      } catch {
        if (!cancelled) {
          setContactCount(0);
          setSourceCount(0);
          setMemberCount(0);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    fetchCounts();
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  if (dismissed) return null;
  if (!loaded) return null;

  const hasOrg = (user?.organizations?.length ?? 0) > 0;
  const hasContact = (contactCount ?? 0) > 0;
  const hasSource = (sourceCount ?? 0) > 0;
  const hasTeam = (memberCount ?? 0) > 1;

  const items: ChecklistItem[] = [
    {
      id: 'org',
      label: 'Create your organization',
      done: hasOrg,
    },
    {
      id: 'signal-source',
      label: 'Connect a signal source',
      href: '/settings',
      done: hasSource,
      detail: (
        <span className="text-xs text-gray-400">GitHub, npm, Segment, or a custom webhook</span>
      ),
    },
    {
      id: 'contact',
      label: 'Add your first contact',
      href: '/contacts',
      done: hasContact,
    },
    {
      id: 'sdk',
      label: 'Install the SDK',
      href: '/docs',
      done: false,
      detail: (
        <code className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono block mt-1">
          npm install @devsignal/node
        </code>
      ),
    },
    {
      id: 'team',
      label: 'Invite your team',
      href: '/team',
      done: hasTeam,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  // If all steps are complete, auto-dismiss
  if (completedCount === totalCount) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {completedCount} of {totalCount} completed -- {progressPct}%
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          aria-label="Dismiss getting started checklist"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-100 rounded-full h-2 mb-5">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Checklist */}
      <div className="space-y-1">
        {items.map((item) => {
          const content = (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group">
              {/* Checkbox */}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.done
                    ? 'bg-green-500 text-white'
                    : 'border-2 border-gray-300 group-hover:border-indigo-400'
                }`}
              >
                {item.done && (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm ${
                    item.done
                      ? 'text-gray-400 line-through'
                      : 'text-gray-700 font-medium'
                  }`}
                >
                  {item.label}
                </span>
                {!item.done && item.detail && <div className="mt-0.5">{item.detail}</div>}
              </div>

              {/* Arrow for linked items */}
              {item.href && !item.done && (
                <svg
                  className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </div>
          );

          if (item.href && !item.done) {
            return (
              <Link key={item.id} to={item.href} className="block">
                {content}
              </Link>
            );
          }

          return <div key={item.id}>{content}</div>;
        })}
      </div>
    </div>
  );
}
