import { useState, useCallback, useEffect, useRef, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import api from '../lib/api';
import Spinner from '../components/Spinner';

// ---- Step definitions ----

const STEPS = [
  { label: 'Organization' },
  { label: 'Connect GitHub' },
  { label: 'Your Signals' },
];

// ---- Types ----

interface RepoInfo {
  fullName: string;
  name: string;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
}

interface TopCompany {
  name: string;
  domain: string | null;
  developerCount: number;
  signals: number;
}

interface OnboardingSummary {
  companiesFound: number;
  developersFound: number;
  signalsCreated: number;
  topCompanies: TopCompany[];
}

interface CrawlProgress {
  status: string;
  phase: string;
  phaseCurrent: number;
  phaseTotal: number;
  developersFound: number;
  companiesFound: number;
  error?: string;
}

// ---- Main component ----

export default function Onboarding() {
  useEffect(() => { document.title = 'Get Started — Sigscore'; }, []);
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
  const [ghToken, setGhToken] = useState('');
  const [tokenValidating, setTokenValidating] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [reposLoaded, setReposLoaded] = useState(false);

  // Crawl state
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [crawlError, setCrawlError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 3 state
  const [summary, setSummary] = useState<OnboardingSummary | null>(null);

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

      const orgId = data.id || data.organization?.id;
      if (orgId) {
        localStorage.setItem('organizationId', orgId);
      }

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

  // ---- Step 2: Connect GitHub ----

  const handleValidateToken = async () => {
    setTokenError('');
    setTokenValidating(true);
    setRepos([]);
    setReposLoaded(false);

    try {
      const { data } = await api.post('/onboarding/github/repos', { token: ghToken });
      setRepos(data.repos || []);
      setReposLoaded(true);

      // Auto-select repos with > 0 stars (up to 5)
      const autoSelected = new Set<string>();
      const sorted = [...(data.repos || [])].sort(
        (a: RepoInfo, b: RepoInfo) => b.stars - a.stars,
      );
      for (const repo of sorted.slice(0, 5)) {
        if (repo.stars > 0) {
          autoSelected.add(repo.fullName);
        }
      }
      setSelectedRepos(autoSelected);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setTokenError(
        axiosErr.response?.data?.error ||
          'Could not connect to GitHub. Check your token and try again.'
      );
    } finally {
      setTokenValidating(false);
    }
  };

  const toggleRepo = (fullName: string) => {
    setSelectedRepos((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) {
        next.delete(fullName);
      } else if (next.size < 10) {
        next.add(fullName);
      }
      return next;
    });
  };

  // Poll crawl progress
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startCrawl = async () => {
    setCrawling(true);
    setCrawlError('');
    setCrawlProgress(null);

    // Start polling progress
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/onboarding/github/status');
        setCrawlProgress(data);

        if (data.status === 'complete' || data.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Ignore polling errors
      }
    }, 1500);

    try {
      const { data } = await api.post('/onboarding/github/connect', {
        token: ghToken,
        repos: selectedRepos.size > 0 ? Array.from(selectedRepos) : undefined,
      });

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;

      setSummary(data);
      setCrawling(false);
      setCurrentStep(2);
    } catch (err: unknown) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;

      const axiosErr = err as { response?: { data?: { error?: string } } };
      setCrawlError(
        axiosErr.response?.data?.error ||
          'Something went wrong during the scan. Please try again.'
      );
      setCrawling(false);
    }
  };

  // ---- Navigation ----

  const goToCompanies = useCallback(() => {
    navigate('/companies', { replace: true });
  }, [navigate]);

  // ---- Render ----

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="py-6 px-4 text-center">
        <h1 className="text-xl font-bold text-gray-900">Sigscore</h1>
      </div>

      {/* Step indicator */}
      <div className="flex justify-center px-4 mb-8">
        <div className="flex items-center gap-0">
          {STEPS.map((step, idx) => (
            <div key={step.label} className="flex items-center">
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
              {idx < STEPS.length - 1 && (
                <div
                  className={`w-12 sm:w-20 h-0.5 mx-1.5 mb-6 transition-colors ${
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
              <p className="text-xs font-medium text-indigo-600 mb-3">Step 1 of 3 -- Create your workspace</p>
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
                    <span className="text-sm text-gray-400">sigscore.dev/</span>
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
                  <p className="mt-1.5 text-xs text-gray-400">
                    Your company's domain (e.g., acme.dev). Helps match signals to your team.
                  </p>
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

          {/* =================== STEP 2: Connect GitHub =================== */}
          {currentStep === 1 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <p className="text-xs font-medium text-indigo-600 mb-3">Step 2 of 3 -- Connect your signals</p>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <GitHubIcon />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Connect GitHub</h2>
                  <p className="text-sm text-gray-500">
                    See which companies are engaging with your repos -- in under 60 seconds.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-5">
                {/* Token input */}
                {!reposLoaded && (
                  <>
                    <div>
                      <label htmlFor="ghToken" className="block text-sm font-medium text-gray-700 mb-1">
                        GitHub Personal Access Token
                      </label>
                      <input
                        id="ghToken"
                        type="password"
                        value={ghToken}
                        onChange={(e) => {
                          setGhToken(e.target.value);
                          setTokenError('');
                        }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow font-mono"
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      />
                      <p className="mt-1.5 text-xs text-gray-400">
                        Needs <code className="bg-gray-100 px-1 rounded">read:user</code> and{' '}
                        <code className="bg-gray-100 px-1 rounded">repo</code> scopes.{' '}
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Sigscore%20Onboarding"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:text-indigo-700 underline"
                        >
                          Create one here
                        </a>
                      </p>
                    </div>

                    {tokenError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                        {tokenError}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleValidateToken}
                      disabled={tokenValidating || !ghToken.trim()}
                      className="w-full bg-gray-900 text-white py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {tokenValidating ? (
                        <>
                          <Spinner size="sm" className="border-white border-t-transparent" />
                          Validating token...
                        </>
                      ) : (
                        <>
                          <GitHubIcon />
                          Connect to GitHub
                        </>
                      )}
                    </button>

                    <p className="text-xs text-gray-400 text-center">
                      We'll scan your top repos for stargazers, forkers, and issue authors to find companies evaluating your tool.
                    </p>
                  </>
                )}

                {/* Repo picker */}
                {reposLoaded && !crawling && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Select repos to scan
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          We will analyze stargazers, forkers, and contributors to find companies.
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">{selectedRepos.size}/10 selected</span>
                    </div>

                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                      {repos.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-gray-400">
                          No repositories found. Make sure your token has repo access.
                        </div>
                      )}
                      {repos.map((repo) => (
                        <label
                          key={repo.fullName}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedRepos.has(repo.fullName)}
                            onChange={() => toggleRepo(repo.fullName)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {repo.name}
                              </span>
                              {repo.language && (
                                <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                  {repo.language}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{repo.fullName}</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400 flex-shrink-0">
                            <span className="flex items-center gap-1">
                              <StarIcon /> {formatNumber(repo.stars)}
                            </span>
                            <span className="flex items-center gap-1">
                              <ForkIcon /> {formatNumber(repo.forks)}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>

                    {crawlError && (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                        {crawlError}
                      </div>
                    )}

                    <div className="flex justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setReposLoaded(false);
                          setGhToken('');
                          setRepos([]);
                          setSelectedRepos(new Set());
                        }}
                        className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                      >
                        Use a different token
                      </button>
                      <button
                        type="button"
                        onClick={startCrawl}
                        disabled={selectedRepos.size === 0}
                        className="bg-indigo-600 text-white py-2.5 px-6 rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Scan {selectedRepos.size} {selectedRepos.size === 1 ? 'repo' : 'repos'}
                      </button>
                    </div>
                  </>
                )}

                {/* Crawl progress */}
                {crawling && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Spinner size="md" />
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      Scanning your repos...
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      {crawlProgress?.phase || 'Starting...'}
                    </p>

                    {/* Progress bar */}
                    {crawlProgress && crawlProgress.phaseTotal > 0 && (
                      <div className="max-w-sm mx-auto mb-4">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(
                                (crawlProgress.phaseCurrent / crawlProgress.phaseTotal) * 100,
                                100,
                              )}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-gray-400">
                          <span>
                            {crawlProgress.phaseCurrent} / {crawlProgress.phaseTotal}
                          </span>
                          <span>
                            {crawlProgress.developersFound > 0 &&
                              `${crawlProgress.developersFound} developers`}
                            {crawlProgress.companiesFound > 0 &&
                              ` | ${crawlProgress.companiesFound} companies`}
                          </span>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-gray-400">
                      This usually takes 30-60 seconds
                    </p>
                  </div>
                )}
              </div>

              {/* Skip option (only when not crawling) */}
              {!crawling && !reposLoaded && (
                <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                  <button
                    type="button"
                    onClick={goToCompanies}
                    className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors"
                  >
                    Skip for now -- I will set up later
                  </button>
                </div>
              )}
            </div>
          )}

          {/* =================== STEP 3: See Results =================== */}
          {currentStep === 2 && summary && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              {/* Celebration banner */}
              <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-4 mb-8 flex items-start gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    You're all set! Sigscore found {summary.companiesFound} {summary.companiesFound === 1 ? 'company' : 'companies'} and {summary.developersFound} developers.
                  </p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Your signal intelligence is ready to use.
                  </p>
                </div>
              </div>

              {/* Success header */}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  We found {summary.companiesFound} {summary.companiesFound === 1 ? 'company' : 'companies'}!
                </h2>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  {summary.developersFound} developers across {summary.signalsCreated} signals
                  are already engaging with your repos. Here are the top accounts.
                </p>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-indigo-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-indigo-600">{summary.companiesFound}</p>
                  <p className="text-xs text-indigo-600/70 font-medium mt-0.5">Companies</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{summary.developersFound}</p>
                  <p className="text-xs text-emerald-600/70 font-medium mt-0.5">Developers</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-600">{summary.signalsCreated}</p>
                  <p className="text-xs text-amber-600/70 font-medium mt-0.5">Signals</p>
                </div>
              </div>

              {/* Top companies table */}
              {summary.topCompanies.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-8">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Company
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                          Developers
                        </th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center">
                          Signals
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {summary.topCompanies.map((company, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-indigo-600">
                                  {company.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {company.name}
                                </p>
                                {company.domain && (
                                  <p className="text-xs text-gray-400">{company.domain}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-semibold text-gray-700">
                              {company.developerCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                              {company.signals}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* What's Next action cards */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">What's Next</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Link
                    to="/companies"
                    className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                  >
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center mb-2">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">View your companies</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      See the {summary.companiesFound} {summary.companiesFound === 1 ? 'company' : 'companies'} we found in your CRM
                    </p>
                  </Link>

                  <Link
                    to="/settings"
                    className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                  >
                    <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center mb-2">
                      <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">Set up Slack alerts</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Get notified when hot accounts appear
                    </p>
                  </Link>

                  <Link
                    to="/scores"
                    className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors group"
                  >
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mb-2">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-700">Explore PQA scores</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      See which accounts are hottest
                    </p>
                  </Link>
                </div>
              </div>

              <button
                type="button"
                onClick={goToCompanies}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                Go to your Companies
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Helper functions ----

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ---- Icons ----

function GitHubIcon() {
  return (
    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
    </svg>
  );
}
