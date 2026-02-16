import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  title: string | null;
  linkedIn: string | null;
  github: string | null;
}

interface ReportSignal {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

interface ReportTag {
  id: string;
  name: string;
  color: string | null;
}

interface ReportScore {
  score: number;
  tier: string;
  factors: Array<{
    name: string;
    weight: number;
    value: number;
    description?: string;
  }>;
  signalCount: number;
  userCount: number;
  trend: string;
  lastSignalAt: string | null;
}

interface ReportCompanyData {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  logo: string | null;
  website: string | null;
  description: string | null;
  linkedIn: string | null;
  twitter: string | null;
  githubOrg: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

interface ReportContent {
  company: ReportCompanyData;
  score: ReportScore | null;
  contacts: ReportContact[];
  signals: ReportSignal[];
  tags: ReportTag[];
  generatedAt: string;
}

interface SharedReportData {
  id: string;
  title: string;
  content: ReportContent;
  viewCount: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helper: format signal type for display
// ---------------------------------------------------------------------------

function formatSignalType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Helper: tier badge color
// ---------------------------------------------------------------------------

function tierColor(tier: string): string {
  switch (tier) {
    case 'HOT':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'WARM':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'COLD':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'INACTIVE':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

// ---------------------------------------------------------------------------
// Helper: trend icon
// ---------------------------------------------------------------------------

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'RISING') {
    return (
      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    );
  }
  if (trend === 'FALLING') {
    return (
      <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helper: company size label
// ---------------------------------------------------------------------------

function sizeLabel(size: string | null): string {
  if (!size) return 'Unknown';
  const map: Record<string, string> = {
    STARTUP: '1-10 employees',
    SMALL: '11-50 employees',
    MEDIUM: '51-200 employees',
    LARGE: '201-1000 employees',
    ENTERPRISE: '1000+ employees',
  };
  return map[size] ?? size;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export default function SharedReport() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [report, setReport] = useState<SharedReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) return;

    const fetchReport = async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(
          `${API_BASE_URL}/api/v1/account-reports/shared/${shareToken}`
        );
        setReport(data.report);
        setError(null);
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response) {
          const status = err.response.status;
          if (status === 404) {
            setError('not_found');
          } else if (status === 403 || status === 410) {
            setError('unavailable');
          } else {
            setError('error');
          }
        } else {
          setError('error');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [shareToken]);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Loading report...</p>
        </div>
      </div>
    );
  }

  // Error / unavailable
  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <svg
            className="mx-auto h-16 w-16 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            This report is no longer available
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {error === 'not_found'
              ? 'The report you are looking for does not exist or has been deleted.'
              : 'This report may have expired or been made private by the owner.'}
          </p>
          <Link
            to="/landing"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Learn about DevSignal
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  const { content } = report;
  const { company, score, contacts, signals, tags } = content;

  // Group signals by type for summary
  const signalSummary: Record<string, number> = {};
  signals.forEach((s) => {
    signalSummary[s.type] = (signalSummary[s.type] || 0) + 1;
  });
  const signalTypes = Object.entries(signalSummary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header / Branding */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900 tracking-tight">DevSignal</span>
          </div>
          <span className="text-xs text-gray-400">
            {report.viewCount} view{report.viewCount !== 1 ? 's' : ''}
          </span>
        </div>
      </header>

      {/* Report Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{report.title}</h1>
        <p className="text-sm text-gray-400 mb-8">
          Generated {new Date(content.generatedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>

        {/* Company Overview Card */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            {company.logo ? (
              <img src={company.logo} alt="" className="w-14 h-14 rounded-xl object-contain bg-gray-50 p-1 border border-gray-100" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-600">
                {company.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-gray-500">
                {company.domain && (
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline"
                  >
                    {company.domain}
                  </a>
                )}
                {company.industry && <span>{company.industry}</span>}
                {company.size && <span>{sizeLabel(company.size)}</span>}
                {company.city && (
                  <span>
                    {company.city}
                    {company.state ? `, ${company.state}` : ''}
                    {company.country ? `, ${company.country}` : ''}
                  </span>
                )}
              </div>
              {company.description && (
                <p className="mt-3 text-sm text-gray-600 leading-relaxed">{company.description}</p>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                      style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : undefined}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Social Links */}
              <div className="flex items-center gap-4 mt-3">
                {company.linkedIn && (
                  <a
                    href={company.linkedIn}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-700"
                    title="LinkedIn"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </a>
                )}
                {company.twitter && (
                  <a
                    href={`https://twitter.com/${company.twitter.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-sky-500"
                    title="Twitter/X"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {company.githubOrg && (
                  <a
                    href={`https://github.com/${company.githubOrg}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-gray-900"
                    title="GitHub"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                    </svg>
                  </a>
                )}
                {company.website && (
                  <a
                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-indigo-600"
                    title="Website"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* PQA Score Section */}
        {score && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Product-Qualified Account Score
            </h3>
            <div className="flex items-center gap-6 mb-5">
              {/* Score circle */}
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" stroke="#e5e7eb" strokeWidth="8" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke={score.tier === 'HOT' ? '#ef4444' : score.tier === 'WARM' ? '#f59e0b' : score.tier === 'COLD' ? '#3b82f6' : '#9ca3af'}
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${(score.score / 100) * 264} 264`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{score.score}</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${tierColor(score.tier)}`}>
                    {score.tier}
                  </span>
                  <div className="flex items-center gap-1">
                    <TrendIcon trend={score.trend} />
                    <span className="text-xs text-gray-500 capitalize">{score.trend.toLowerCase()}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Signals:</span>{' '}
                    <span className="font-medium text-gray-900">{score.signalCount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Active users:</span>{' '}
                    <span className="font-medium text-gray-900">{score.userCount}</span>
                  </div>
                  {score.lastSignalAt && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Last signal:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {new Date(score.lastSignalAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Score Breakdown */}
            {Array.isArray(score.factors) && score.factors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Score Breakdown
                </h4>
                <div className="space-y-2.5">
                  {score.factors.map((factor, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600">{factor.name}</span>
                        <span className="font-medium text-gray-900">{factor.value}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(factor.value, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Key Contacts */}
        {contacts.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Key Contacts ({contacts.length})
            </h3>
            <div className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-500 flex-shrink-0">
                    {contact.firstName.charAt(0)}
                    {contact.lastName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {contact.firstName} {contact.lastName}
                    </div>
                    {contact.title && (
                      <div className="text-xs text-gray-500">{contact.title}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-gray-400 hover:text-indigo-600"
                        title={contact.email}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </a>
                    )}
                    {contact.linkedIn && (
                      <a
                        href={contact.linkedIn}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-blue-700"
                        title="LinkedIn"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                        </svg>
                      </a>
                    )}
                    {contact.github && (
                      <a
                        href={`https://github.com/${contact.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-900"
                        title="GitHub"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Signal Activity Summary */}
        {signals.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Recent Signal Activity ({signals.length} signals)
            </h3>

            {/* Signal type breakdown */}
            {signalTypes.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {signalTypes.map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700"
                  >
                    {formatSignalType(type)}
                    <span className="bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                      {count}
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Recent signals timeline */}
            <div className="space-y-3">
              {signals.slice(0, 10).map((signal) => (
                <div key={signal.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">
                      {formatSignalType(signal.type)}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(signal.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {signals.length > 10 && (
                <p className="text-xs text-gray-400 pl-5">
                  + {signals.length - 10} more signals
                </p>
              )}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            Powered by DevSignal
          </div>
          <Link
            to="/landing"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Try DevSignal free
          </Link>
        </div>
      </footer>
    </div>
  );
}
