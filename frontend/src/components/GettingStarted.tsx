import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';

const DISMISSED_KEY = 'sigscore_onboarding_dismissed';

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  done: boolean;
}

export default function GettingStarted() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  });
  const [contactCount, setContactCount] = useState<number | null>(null);
  const [sourceCount, setSourceCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [workflowCount, setWorkflowCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    let cancelled = false;

    async function fetchCounts() {
      try {
        const [contactsRes, sourcesRes, membersRes, workflowsRes] = await Promise.all([
          api.get('/contacts', { params: { limit: 1 } }).catch(() => null),
          api.get('/sources', { params: { limit: 100 } }).catch(() => null),
          api.get('/members').catch(() => null),
          api.get('/workflows', { params: { limit: 1 } }).catch(() => null),
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

        const workflows = workflowsRes?.data?.workflows || workflowsRes?.data || [];
        setWorkflowCount(
          Array.isArray(workflows) ? workflows.length : workflowsRes?.data?.pagination?.total ?? 0,
        );
      } catch {
        if (!cancelled) {
          setContactCount(0);
          setSourceCount(0);
          setMemberCount(0);
          setWorkflowCount(0);
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

  const hasSource = (sourceCount ?? 0) > 0;
  const hasContact = (contactCount ?? 0) > 0;
  const hasWorkflow = (workflowCount ?? 0) > 0;
  const hasTeam = (memberCount ?? 0) > 1;

  // Ordered by impact: GitHub first, then review accounts, Slack, workflows, team
  const items: ChecklistItem[] = [
    {
      id: 'signal-source',
      label: 'Connect GitHub',
      description: 'Import stargazers, forkers, and contributors as signals',
      href: '/settings',
      ctaLabel: 'Connect',
      done: hasSource,
    },
    {
      id: 'review-accounts',
      label: 'Review your top accounts',
      description: 'See which companies show the strongest buying signals',
      href: '/scores',
      ctaLabel: 'View scores',
      done: hasContact,
    },
    {
      id: 'slack',
      label: 'Set up Slack alerts',
      description: 'Get notified when hot accounts appear in real-time',
      href: '/settings',
      ctaLabel: 'Configure',
      done: false,
    },
    {
      id: 'workflow',
      label: 'Create your first workflow',
      description: 'Automate actions when signals match your criteria',
      href: '/workflows',
      ctaLabel: 'Create workflow',
      done: hasWorkflow,
    },
    {
      id: 'team',
      label: 'Invite your team',
      description: 'Collaborate on accounts with your sales and product teams',
      href: '/team',
      ctaLabel: 'Invite',
      done: hasTeam,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  // Only auto-dismiss when ALL steps are complete
  if (completedCount === totalCount) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  // Unused variable guard
  void user;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Getting Started</h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
              Setup: {progressPct}% complete
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {completedCount} of {totalCount} steps completed
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
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
              item.done
                ? 'border-gray-100 bg-gray-50'
                : 'border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/30'
            }`}
          >
            {/* Checkbox indicator */}
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.done
                  ? 'bg-green-500 text-white'
                  : 'border-2 border-gray-300'
              }`}
            >
              {item.done && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>

            {/* Label and description */}
            <div className="flex-1 min-w-0">
              <span
                className={`text-sm ${
                  item.done
                    ? 'text-gray-400 line-through'
                    : 'text-gray-900 font-medium'
                }`}
              >
                {item.label}
              </span>
              {!item.done && (
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
              )}
            </div>

            {/* CTA button */}
            {!item.done && (
              <Link
                to={item.href}
                className="flex-shrink-0 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                {item.ctaLabel}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
