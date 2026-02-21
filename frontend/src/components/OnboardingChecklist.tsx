import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const DISMISSED_KEY = 'sigscore_onboarding_checklist_dismissed';

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  done: boolean;
  icon: JSX.Element;
}

interface StepDetectionState {
  hasSignalSource: boolean;
  hasContacts: boolean;
  hasScoringRules: boolean;
  hasWorkflow: boolean;
  hasTeamMembers: boolean;
  hasCrmConnected: boolean;
}

export default function OnboardingChecklist() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  });
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [detection, setDetection] = useState<StepDetectionState>({
    hasSignalSource: false,
    hasContacts: false,
    hasScoringRules: false,
    hasWorkflow: false,
    hasTeamMembers: false,
    hasCrmConnected: false,
  });

  const detectCompletedSteps = useCallback(async () => {
    try {
      const [
        sourcesRes,
        contactsRes,
        scoringRes,
        workflowsRes,
        membersRes,
        hubspotRes,
        salesforceRes,
      ] = await Promise.all([
        api.get('/sources', { params: { limit: 100 } }).catch(() => null),
        api.get('/contacts', { params: { limit: 1 } }).catch(() => null),
        api.get('/scoring/config').catch(() => null),
        api.get('/workflows', { params: { limit: 1 } }).catch(() => null),
        api.get('/members').catch(() => null),
        api.get('/integrations/hubspot/status').catch(() => null),
        api.get('/integrations/salesforce/status').catch(() => null),
      ]);

      // Signal sources: count non-demo sources
      const sources = sourcesRes?.data?.sources || sourcesRes?.data || [];
      const realSources = Array.isArray(sources)
        ? sources.filter((s: { name?: string }) => s.name !== 'Demo Signal Source')
        : [];

      // Contacts: check total count
      const contactTotal = contactsRes?.data?.pagination?.total ?? 0;

      // Scoring rules: check if custom config exists (not just defaults)
      const scoringConfig = scoringRes?.data;
      const hasScoringCustom = scoringConfig
        && (scoringConfig.rules?.length > 0 || scoringConfig.weights || scoringConfig.signals);

      // Workflows: check count
      const workflows = workflowsRes?.data?.workflows || workflowsRes?.data || [];
      const workflowCount = Array.isArray(workflows)
        ? workflows.length
        : workflowsRes?.data?.pagination?.total ?? 0;

      // Team members: more than 1 means someone was invited
      const members = membersRes?.data?.members || membersRes?.data || [];
      const memberCount = Array.isArray(members) ? members.length : 0;

      // CRM connected: HubSpot or Salesforce
      const hubspotConnected = hubspotRes?.data?.connected === true;
      const salesforceConnected = salesforceRes?.data?.connected === true;

      setDetection({
        hasSignalSource: realSources.length > 0,
        hasContacts: contactTotal > 0,
        hasScoringRules: !!hasScoringCustom,
        hasWorkflow: workflowCount > 0,
        hasTeamMembers: memberCount > 1,
        hasCrmConnected: hubspotConnected || salesforceConnected,
      });
    } catch {
      // If detection fails, leave all as incomplete -- no harm done
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    detectCompletedSteps();
  }, [dismissed, detectCompletedSteps]);

  if (dismissed) return null;
  if (!loaded) return null;

  const steps: OnboardingStep[] = [
    {
      id: 'signal-source',
      label: 'Connect your first signal source',
      description: 'GitHub is recommended -- import stargazers, forkers, and contributors as signals.',
      href: '/settings',
      ctaLabel: 'Connect GitHub',
      done: detection.hasSignalSource,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5" />
        </svg>
      ),
    },
    {
      id: 'import-contacts',
      label: 'Import your first contacts',
      description: 'Upload a CSV or use the API to bring in your existing contact data.',
      href: '/contacts',
      ctaLabel: 'Import contacts',
      done: detection.hasContacts,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      ),
    },
    {
      id: 'scoring-rules',
      label: 'Set up PQA scoring rules',
      description: 'Configure how accounts are scored so you can identify product-qualified accounts.',
      href: '/scoring',
      ctaLabel: 'Configure scoring',
      done: detection.hasScoringRules,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      ),
    },
    {
      id: 'workflow',
      label: 'Create your first workflow',
      description: 'Automate actions when signals match your criteria -- route hot leads, send alerts.',
      href: '/workflows',
      ctaLabel: 'Create workflow',
      done: detection.hasWorkflow,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
    },
    {
      id: 'team',
      label: 'Invite a team member',
      description: 'Collaborate on accounts with your sales and product teams.',
      href: '/team',
      ctaLabel: 'Invite teammate',
      done: detection.hasTeamMembers,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
        </svg>
      ),
    },
    {
      id: 'crm',
      label: 'Connect a CRM',
      description: 'Sync accounts and deals with HubSpot or Salesforce for a unified pipeline view.',
      href: '/settings',
      ctaLabel: 'Connect CRM',
      done: detection.hasCrmConnected,
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
      ),
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  // Auto-hide when all steps are complete
  if (completedCount === totalCount) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  // Find the first incomplete step to highlight
  const nextStepId = steps.find((s) => !s.done)?.id;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
      {/* Header with gradient accent */}
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4.5 h-4.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold text-gray-900">Setup Checklist</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
                  {completedCount} of {totalCount}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Complete these steps to get the most out of Sigscore
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-md hover:bg-gray-100"
              aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-md hover:bg-gray-100"
              aria-label="Dismiss setup checklist"
              title="Dismiss checklist"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-500 tabular-nums flex-shrink-0">
            {progressPct}%
          </span>
        </div>
      </div>

      {/* Steps list (collapsible) */}
      {!collapsed && (
        <div className="divide-y divide-gray-50">
          {steps.map((step, index) => {
            const isNext = step.id === nextStepId;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 px-6 py-3.5 transition-colors ${
                  step.done
                    ? 'bg-gray-50/50'
                    : isNext
                      ? 'bg-indigo-50/30'
                      : 'hover:bg-gray-50/50'
                }`}
              >
                {/* Step number / check indicator */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    step.done
                      ? 'bg-green-500 text-white'
                      : isNext
                        ? 'bg-indigo-600 text-white'
                        : 'border-2 border-gray-300 text-gray-400'
                  }`}
                >
                  {step.done ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span className="text-xs font-semibold">{index + 1}</span>
                  )}
                </div>

                {/* Step icon */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    step.done
                      ? 'bg-gray-100 text-gray-400'
                      : isNext
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {step.icon}
                </div>

                {/* Label and description */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-sm leading-tight block ${
                      step.done
                        ? 'text-gray-400 line-through'
                        : isNext
                          ? 'text-gray-900 font-semibold'
                          : 'text-gray-700 font-medium'
                    }`}
                  >
                    {step.label}
                  </span>
                  {!step.done && (
                    <p className={`text-xs mt-0.5 ${isNext ? 'text-gray-600' : 'text-gray-400'}`}>
                      {step.description}
                    </p>
                  )}
                </div>

                {/* CTA or completed badge */}
                {step.done ? (
                  <span className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-600">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    Done
                  </span>
                ) : (
                  <Link
                    to={step.href}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      isNext
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {step.ctaLabel}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Collapsed summary */}
      {collapsed && (
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  step.done ? 'bg-green-500' : 'bg-gray-200'
                }`}
              >
                {step.done && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </div>
            ))}
          </div>
          <span className="text-xs text-gray-500">
            {completedCount} of {totalCount} complete -- {totalCount - completedCount} remaining
          </span>
        </div>
      )}
    </div>
  );
}
