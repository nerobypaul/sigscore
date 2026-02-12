import { useState, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import Spinner from '../components/Spinner';

// ---- Step definitions ----

const STEPS = [
  { label: 'Organization' },
  { label: 'Team' },
  { label: 'Signals' },
  { label: 'Done' },
];

// ---- Signal source definitions ----

interface SignalSource {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const SIGNAL_SOURCES: SignalSource[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Track repo stars, clones, issues',
    icon: <GitHubIcon />,
  },
  {
    id: 'npm',
    name: 'npm',
    description: 'Monitor package installs',
    icon: <NpmIcon />,
  },
  {
    id: 'website',
    name: 'Website',
    description: 'Track page views and signups',
    icon: <WebsiteIcon />,
  },
  {
    id: 'product-api',
    name: 'Product API',
    description: 'Ingest custom usage events',
    icon: <ApiIcon />,
  },
  {
    id: 'segment',
    name: 'Segment',
    description: 'Connect your Segment workspace',
    icon: <SegmentIcon />,
  },
  {
    id: 'webhook',
    name: 'Custom Webhook',
    description: 'Send any event via webhook',
    icon: <WebhookIcon />,
  },
];

// ---- Main component ----

export default function Onboarding() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1 state
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgError, setOrgError] = useState('');

  // Step 2 state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteList, setInviteList] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState('');

  // Step 3 state
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');

  // ---- Helpers ----

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!slugTouched) {
      setOrgSlug(slugify(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlugTouched(true);
    setOrgSlug(slugify(value));
  };

  // ---- Step 1: Create Organization ----

  const handleCreateOrg = async (e: FormEvent) => {
    e.preventDefault();
    setOrgError('');
    setOrgLoading(true);

    try {
      const payload: Record<string, string> = {
        name: orgName.trim(),
        slug: orgSlug.trim(),
      };
      if (orgDomain.trim()) {
        payload.domain = orgDomain.trim();
      }

      const { data } = await api.post('/organizations', payload);

      // Set the new organization in localStorage so API interceptor picks it up
      const orgId = data.id || data.organization?.id;
      if (orgId) {
        localStorage.setItem('organizationId', orgId);
      }

      // Refresh the user context so it picks up the new org
      await refreshUser();

      setCurrentStep(1);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      setOrgError(
        axiosErr.response?.data?.error ||
          axiosErr.response?.data?.message ||
          'Failed to create organization. Please try again.'
      );
    } finally {
      setOrgLoading(false);
    }
  };

  // ---- Step 2: Invite Team ----

  const handleAddInvite = () => {
    const email = inviteEmail.trim().toLowerCase();
    setInviteError('');

    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Please enter a valid email address.');
      return;
    }

    if (inviteList.includes(email)) {
      setInviteError('This email is already in the list.');
      return;
    }

    setInviteList((prev) => [...prev, email]);
    setInviteEmail('');
  };

  const handleRemoveInvite = (email: string) => {
    setInviteList((prev) => prev.filter((e) => e !== email));
  };

  // ---- Step 3: Signal Sources ----

  const handleSelectSource = (sourceId: string) => {
    if (selectedSource === sourceId) {
      setSelectedSource(null);
      setSourceName('');
    } else {
      setSelectedSource(sourceId);
      setSourceName('');
    }
  };

  // ---- Navigation ----

  const goToDashboard = useCallback(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  // ---- Render ----

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="py-6 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">DevSignal</h1>
      </div>

      {/* Step indicator */}
      <div className="flex justify-center px-4 mb-8">
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => (
            <div key={step.label} className="flex items-center">
              {/* Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    idx < currentStep
                      ? 'bg-indigo-600 text-white'
                      : idx === currentStep
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {idx < currentStep ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    idx <= currentStep ? 'text-indigo-600' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector line */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`w-16 sm:w-24 h-0.5 mx-2 mb-6 transition-colors ${
                    idx < currentStep ? 'bg-indigo-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-2xl">
          {/* =================== STEP 1: Create Organization =================== */}
          {currentStep === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Create your organization</h2>
              <p className="text-sm text-gray-500 mb-6">
                This is your workspace where your team and data live.
              </p>

              <form onSubmit={handleCreateOrg} className="space-y-5">
                {orgError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {orgError}
                  </div>
                )}

                <div>
                  <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 mb-1">
                    Organization name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="orgName"
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    placeholder="Acme Inc."
                  />
                </div>

                <div>
                  <label htmlFor="orgSlug" className="block text-sm font-medium text-gray-700 mb-1">
                    Slug
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">devsignal.com/</span>
                    <input
                      id="orgSlug"
                      type="text"
                      value={orgSlug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                      placeholder="acme-inc"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="orgDomain" className="block text-sm font-medium text-gray-700 mb-1">
                    Company domain{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id="orgDomain"
                    type="text"
                    value={orgDomain}
                    onChange={(e) => setOrgDomain(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    placeholder="yourcompany.com"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={orgLoading || !orgName.trim()}
                    className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {orgLoading ? (
                      <>
                        <Spinner size="sm" className="border-white border-t-transparent" />
                        Creating...
                      </>
                    ) : (
                      'Create Organization'
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* =================== STEP 2: Invite Team =================== */}
          {currentStep === 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Invite your team</h2>
              <p className="text-sm text-gray-500 mb-6">
                Add team members to collaborate in your workspace.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700 mb-6">
                Coming soon -- invites will be sent when your account is activated.
              </div>

              {/* Email input */}
              <div className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddInvite();
                    }
                  }}
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                  placeholder="colleague@company.com"
                />
                <button
                  type="button"
                  onClick={handleAddInvite}
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Add
                </button>
              </div>

              {inviteError && (
                <p className="text-sm text-red-600 mb-3">{inviteError}</p>
              )}

              {/* Invite list */}
              {inviteList.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-6">
                  {inviteList.map((email) => (
                    <div key={email} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                        </div>
                        <span className="text-sm text-gray-700">{email}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveInvite(email)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {inviteList.length === 0 && (
                <p className="text-sm text-gray-400 mb-6">No team members added yet.</p>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  Skip this step
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="bg-indigo-600 text-white py-2.5 px-6 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* =================== STEP 3: Connect Signal Source =================== */}
          {currentStep === 2 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-1">Connect a signal source</h2>
              <p className="text-sm text-gray-500 mb-6">
                Start ingesting product signals to identify your best leads.
              </p>

              {/* Source grid */}
              {!selectedSource ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {SIGNAL_SOURCES.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => handleSelectSource(source.id)}
                      className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        {source.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{source.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{source.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mb-6">
                  {/* Selected source config */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => setSelectedSource(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      {SIGNAL_SOURCES.find((s) => s.id === selectedSource)?.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {SIGNAL_SOURCES.find((s) => s.id === selectedSource)?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {SIGNAL_SOURCES.find((s) => s.id === selectedSource)?.description}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="sourceName"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Source name
                      </label>
                      <input
                        id="sourceName"
                        type="text"
                        value={sourceName}
                        onChange={(e) => setSourceName(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                        placeholder={`My ${SIGNAL_SOURCES.find((s) => s.id === selectedSource)?.name} source`}
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
                      Full configuration coming soon. After setup, you will receive an API key and
                      webhook URL to start sending events.
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  Skip this step
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="bg-indigo-600 text-white py-2.5 px-6 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
                >
                  {selectedSource ? 'Complete Setup' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* =================== STEP 4: Done =================== */}
          {currentStep === 3 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              {/* Celebration icon */}
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-2">You're all set!</h2>
              <p className="text-sm text-gray-500 mb-8 max-w-md mx-auto">
                Your workspace is ready. Here is a quick checklist to help you get the most out of
                DevSignal.
              </p>

              {/* Getting started checklist */}
              <div className="text-left max-w-lg mx-auto mb-8">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Getting Started</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Create your organization', done: true },
                    { label: 'Add your first contact', done: false },
                    { label: 'Create a company', done: false },
                    { label: 'Set up a signal source', done: false },
                    { label: 'Ingest your first signal', done: false },
                    { label: 'View your first PQA score', done: false },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50"
                    >
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.done
                            ? 'bg-green-500 text-white'
                            : 'border-2 border-gray-300'
                        }`}
                      >
                        {item.done && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </div>
                      <span
                        className={`text-sm ${
                          item.done ? 'text-gray-400 line-through' : 'text-gray-700'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={goToDashboard}
                className="bg-indigo-600 text-white py-2.5 px-8 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Signal Source Icons ----

function GitHubIcon() {
  return (
    <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function NpmIcon() {
  return (
    <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z" />
    </svg>
  );
}

function WebsiteIcon() {
  return (
    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function ApiIcon() {
  return (
    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}

function SegmentIcon() {
  return (
    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function WebhookIcon() {
  return (
    <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}
