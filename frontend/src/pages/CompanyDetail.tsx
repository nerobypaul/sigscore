import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Company, Contact, Deal, Signal, AccountScore, Activity } from '../types';
import { STAGE_LABELS, STAGE_COLORS } from '../types';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import AccountScoreCard, { AccountScoreBadge } from '../components/AccountScoreCard';
import AccountTimeline from '../components/AccountTimeline';
import AIBriefPanel from '../components/AIBriefPanel';
import ScoreTrendChart from '../components/ScoreTrendChart';
import CustomFieldsDisplay from '../components/CustomFieldsDisplay';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup',
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
  ENTERPRISE: 'Enterprise',
};

type TabId = 'overview' | 'timeline' | 'contacts' | 'deals' | 'ai';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'deals', label: 'Deals' },
  { id: 'ai', label: 'AI Intelligence' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Extended types
// ---------------------------------------------------------------------------

interface CompanyWithRelations extends Company {
  contacts?: Contact[];
  deals?: Deal[];
  signals?: Signal[];
  score?: AccountScore | null;
}

// AI action from the suggest endpoint
interface AIAction {
  action: string;
  reasoning: string;
  priority: 'high' | 'medium' | 'low';
  contact: string | null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [company, setCompany] = useState<CompanyWithRelations | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [score, setScore] = useState<AccountScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const loadedTabsRef = useRef<Set<TabId>>(new Set(['overview']));

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      api.get(`/companies/${id}`),
      api.get('/contacts', { params: { companyId: id, limit: 100 } }).catch(() => ({ data: { contacts: [] } })),
      api.get('/deals', { params: { companyId: id, limit: 50 } }).catch(() => ({ data: { deals: [] } })),
      api.get('/signals', { params: { accountId: id, limit: 50 } }).catch(() => ({ data: { signals: [] } })),
      api.get('/activities', { params: { companyId: id, limit: 50 } }).catch(() => ({ data: { activities: [] } })),
    ])
      .then(([companyRes, contactsRes, dealsRes, signalsRes, activitiesRes]) => {
        setCompany(companyRes.data);
        setContacts(contactsRes.data.contacts || []);
        setDeals(dealsRes.data.deals || []);
        setSignals(signalsRes.data.signals || []);
        setActivities(activitiesRes.data.activities || []);
        if (companyRes.data.score) setScore(companyRes.data.score);
      })
      .catch(() => setError('Company not found'))
      .finally(() => setLoading(false));
  }, [id]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this company?')) return;
    try {
      await api.delete(`/companies/${id}`);
      toast.success('Company deleted successfully');
      navigate('/companies');
    } catch {
      toast.error('Failed to delete company');
    }
  };

  const handleTabChange = useCallback((tabId: TabId) => {
    loadedTabsRef.current.add(tabId);
    setActiveTab(tabId);
  }, []);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="px-4 py-6 md:px-6 lg:px-8 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error || 'Company not found'}</p>
          <Link to="/companies" className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500">
            Back to companies
          </Link>
        </div>
      </div>
    );
  }

  const totalDealValue = deals.reduce((sum, d) => sum + (d.amount || 0), 0);
  const recentSignals = signals.slice(0, 5);
  const recentActivities = activities.slice(0, 5);
  const tags = company.tags || [];

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/companies" className="hover:text-gray-700">Companies</Link>
        <span>/</span>
        <span className="text-gray-900">{company.name}</span>
      </div>

      {/* ================================================================= */}
      {/* HEADER                                                            */}
      {/* ================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {company.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              {company.domain && (
                <span className="text-sm text-gray-500">{company.domain}</span>
              )}
              {company.industry && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {company.industry}
                </span>
              )}
              {company.size && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {SIZE_LABELS[company.size] || company.size}
                </span>
              )}
              {(company.city || company.country) && (
                <span className="text-xs text-gray-400">
                  {[company.city, company.state, company.country].filter(Boolean).join(', ')}
                </span>
              )}
              {company.website && (
                <a
                  href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Website
                </a>
              )}
            </div>
            {/* PQA Score badge */}
            {score && (
              <div className="mt-2">
                <AccountScoreBadge score={score} />
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={() => handleTabChange('ai')}
            className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI Brief
          </button>
          <button
            onClick={() => handleTabChange('deals')}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Deals
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TAB NAVIGATION                                                    */}
      {/* ================================================================= */}
      <div className="border-b border-gray-200 mb-6 -mx-4 px-4 md:mx-0 md:px-0">
        <nav className="-mb-px flex gap-4 sm:gap-6 overflow-x-auto scrollbar-hide" aria-label="Account tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.id === 'contacts' && ` (${contacts.length})`}
              {tab.id === 'deals' && ` (${deals.length})`}
            </button>
          ))}
        </nav>
      </div>

      {/* ================================================================= */}
      {/* TAB CONTENT                                                       */}
      {/* ================================================================= */}

      {/* OVERVIEW TAB */}
      {loadedTabsRef.current.has('overview') && (
        <div className={activeTab === 'overview' ? '' : 'hidden'}>
          <OverviewTab
            companyId={id!}
            company={company}
            score={score}
            signals={recentSignals}
            activities={recentActivities}
            contacts={contacts}
            deals={deals}
            tags={tags}
            totalDealValue={totalDealValue}
          />
        </div>
      )}

      {/* TIMELINE TAB */}
      {loadedTabsRef.current.has('timeline') && (
        <div className={activeTab === 'timeline' ? '' : 'hidden'}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h2>
            <AccountTimeline
              companyId={id!}
              signals={signals}
              activities={activities}
              deals={deals}
            />
          </div>
        </div>
      )}

      {/* CONTACTS TAB */}
      {loadedTabsRef.current.has('contacts') && (
        <div className={activeTab === 'contacts' ? '' : 'hidden'}>
          <ContactsTab contacts={contacts} />
        </div>
      )}

      {/* DEALS TAB */}
      {loadedTabsRef.current.has('deals') && (
        <div className={activeTab === 'deals' ? '' : 'hidden'}>
          <DealsTab deals={deals} />
        </div>
      )}

      {/* AI INTELLIGENCE TAB */}
      {loadedTabsRef.current.has('ai') && (
        <div className={activeTab === 'ai' ? '' : 'hidden'}>
          <AIIntelligenceTab accountId={id!} score={score} />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// OVERVIEW TAB
// ===========================================================================

interface OverviewTabProps {
  companyId: string;
  company: CompanyWithRelations;
  score: AccountScore | null;
  signals: Signal[];
  activities: Activity[];
  contacts: Contact[];
  deals: Deal[];
  tags: Company['tags'];
  totalDealValue: number;
}

function OverviewTab({ companyId, company, score, signals, activities, contacts, deals, tags, totalDealValue }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* LEFT COLUMN (2/3) */}
      <div className="lg:col-span-2 space-y-4 sm:space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Signals (30d)" value={String(signals.length)} icon="bolt" color="amber" />
          <StatCard label="Contacts" value={String(contacts.length)} icon="users" color="blue" />
          <StatCard label="Deals" value={String(deals.length)} icon="dollar" color="purple" />
          <StatCard label="Total Value" value={totalDealValue > 0 ? formatCurrency(totalDealValue) : '$0'} icon="chart" color="green" />
        </div>

        {/* Company Information */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Company Information</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoField label="Domain" value={company.domain} />
            <InfoField label="Website" value={company.website} link />
            <InfoField label="Email" value={company.email} />
            <InfoField label="Phone" value={company.phone} />
            <InfoField label="LinkedIn" value={company.linkedIn} />
            <InfoField label="Twitter" value={company.twitter} />
            <InfoField label="GitHub" value={company.githubOrg} />
          </dl>
          {company.description && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.description}</p>
            </div>
          )}
        </div>

        {/* Recent Signals */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Recent Signals</h2>
          {signals.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No signals recorded</p>
          ) : (
            <div className="space-y-2">
              {signals.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.type.replace(/_/g, ' ').replace(/\./g, ' ')}</p>
                    <p className="text-xs text-gray-500">{s.source?.name || 'Unknown source'}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(s.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Recent Activity</h2>
          {activities.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No activities yet</p>
          ) : (
            <div className="space-y-2">
              {activities.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{a.title}</p>
                    <p className="text-xs text-gray-500">{a.type} - {a.status}</p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(a.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {tags.map((tr) => (
                <span
                  key={tr.tag.id}
                  className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border"
                  style={{
                    backgroundColor: tr.tag.color ? `${tr.tag.color}20` : undefined,
                    borderColor: tr.tag.color || '#d1d5db',
                    color: tr.tag.color || '#374151',
                  }}
                >
                  {tr.tag.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Custom Fields */}
        <CustomFieldsDisplay entityType="company" entityId={companyId} />
      </div>

      {/* RIGHT COLUMN (1/3) */}
      <div className="space-y-4 sm:space-y-6">
        {/* PQA Score Card */}
        {score ? (
          <AccountScoreCard score={score} />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">PQA Score</h3>
            <p className="text-sm text-gray-400 text-center py-4">No score computed yet</p>
          </div>
        )}

        {/* PQA Score Trend Chart */}
        <ScoreTrendChart companyId={companyId} days={30} />

        {/* Metadata */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Details</h3>
          <dl className="space-y-3">
            {company.address && (
              <div>
                <dt className="text-xs text-gray-500">Address</dt>
                <dd className="text-sm text-gray-700">
                  {company.address}
                  {company.city && `, ${company.city}`}
                  {company.state && `, ${company.state}`}
                  {company.postalCode && ` ${company.postalCode}`}
                  {company.country && `, ${company.country}`}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-500">Created</dt>
              <dd className="text-sm text-gray-700">{new Date(company.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Updated</dt>
              <dd className="text-sm text-gray-700">{new Date(company.updatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">ID</dt>
              <dd className="text-sm text-gray-700 font-mono truncate">{company.id}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// CONTACTS TAB
// ===========================================================================

function ContactsTab({ contacts }: { contacts: Contact[] }) {
  const toast = useToast();
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const handleEnrich = async (contactId: string) => {
    setEnrichingId(contactId);
    try {
      await api.post(`/ai/enrich/${contactId}`);
      toast.success('Contact enriched successfully');
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      if (statusCode === 402) {
        toast.error('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else {
        toast.error('Enrichment failed. AI service may be unavailable.');
      }
    } finally {
      setEnrichingId(null);
    }
  };

  if (contacts.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
        </div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">No contacts</h4>
        <p className="text-sm text-gray-500">No contacts linked to this company yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {contacts.map((c) => (
        <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-gray-300 transition-colors">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {c.firstName?.[0]}{c.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <Link
                to={`/contacts/${c.id}`}
                className="text-sm font-semibold text-gray-900 hover:text-indigo-600 transition-colors truncate block"
              >
                {c.firstName} {c.lastName}
              </Link>
              {c.title && <p className="text-xs text-gray-500 truncate">{c.title}</p>}
              {c.email && <p className="text-xs text-gray-400 truncate mt-0.5">{c.email}</p>}
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <Link
              to={`/contacts/${c.id}`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              View profile
            </Link>
            <button
              onClick={() => handleEnrich(c.id)}
              disabled={enrichingId === c.id}
              className="text-xs font-medium text-gray-500 hover:text-indigo-600 disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              {enrichingId === c.id ? (
                <Spinner size="sm" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              )}
              Enrich
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// DEALS TAB
// ===========================================================================

function DealsTab({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">No deals</h4>
        <p className="text-sm text-gray-500">No deals associated with this company yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deals.map((d) => {
        const stageKey = d.stage as keyof typeof STAGE_LABELS;
        return (
          <Link
            key={d.id}
            to={`/deals/${d.id}`}
            className="block bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">{d.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STAGE_COLORS[stageKey] || 'bg-gray-100 text-gray-700'}`}>
                    {STAGE_LABELS[stageKey] || d.stage}
                  </span>
                  {d.probability != null && (
                    <span className="text-xs text-gray-500">{d.probability}% probability</span>
                  )}
                  {d.expectedCloseDate && (
                    <span className="text-xs text-gray-400">
                      Close: {new Date(d.expectedCloseDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              {d.amount != null && (
                <span className="text-lg font-bold text-gray-700 flex-shrink-0 ml-4">
                  {formatCurrency(d.amount, d.currency)}
                </span>
              )}
            </div>
          </Link>
        );
      })}

      {/* Summary row */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 rounded-xl border border-gray-200">
        <span className="text-sm font-medium text-gray-600">
          {deals.length} deal{deals.length !== 1 ? 's' : ''} total
        </span>
        <span className="text-sm font-bold text-gray-900">
          {formatCurrency(deals.reduce((sum, d) => sum + (d.amount || 0), 0))}
        </span>
      </div>
    </div>
  );
}

// ===========================================================================
// AI INTELLIGENCE TAB
// ===========================================================================

function AIIntelligenceTab({ accountId, score }: { accountId: string; score: AccountScore | null }) {
  return (
    <div className="space-y-6">
      {/* AI Brief */}
      <AIBriefPanel accountId={accountId} />

      {/* Next Best Actions */}
      <NextBestActions accountId={accountId} />

      {/* Scoring Factors */}
      {score && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Scoring Factors</h3>
          <ScoringFactors score={score} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next Best Actions sub-component
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-green-50 text-green-700 border-green-200',
};

function NextBestActions({ accountId }: { accountId: string }) {
  const toast = useToast();
  const [actions, setActions] = useState<AIAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [error, setError] = useState('');

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/ai/suggest/${accountId}`);
      const parsed = Array.isArray(data.actions) ? data.actions : [];
      setActions(parsed as AIAction[]);
      setFetched(true);
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (statusCode === 402) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else if (msg?.includes('ANTHROPIC_API_KEY') || msg?.includes('API key not configured')) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else {
        setError(msg || 'Failed to generate suggestions.');
      }
      setFetched(true);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">Next-Best-Actions</h3>
        </div>
        <button
          onClick={fetchActions}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
        >
          {loading ? <Spinner size="sm" /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          )}
          {fetched ? 'Refresh' : 'Generate'}
        </button>
      </div>

      <div className="px-6 py-5">
        {loading && actions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Spinner size="md" />
            <p className="text-sm text-gray-500">Analyzing account data...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {actions.length > 0 && !loading && (
          <div className="space-y-3">
            {actions.map((action, i) => (
              <div key={i} className="p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-gray-900">{action.action}</h4>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.medium}`}>
                        {action.priority}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{action.reasoning}</p>
                    {action.contact && (
                      <p className="text-xs text-gray-400 mt-1">Contact: {action.contact}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toast.info(`Action "${action.action}" noted`)}
                    className="flex-shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-500 px-3 py-1.5 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Take Action
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && actions.length === 0 && !fetched && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <p className="text-sm text-gray-500 mb-3">Click "Generate" to get AI-powered action suggestions.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoring Factors sub-component
// ---------------------------------------------------------------------------

const FACTOR_TIER_BG: Record<string, string> = {
  HOT: 'bg-red-500',
  WARM: 'bg-amber-500',
  COLD: 'bg-blue-500',
  INACTIVE: 'bg-gray-400',
};

function ScoringFactors({ score }: { score: AccountScore }) {
  const factors = score.factors || [];
  if (factors.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-4">No scoring factors available</p>;
  }

  const tierBg = FACTOR_TIER_BG[score.tier] || 'bg-gray-400';

  return (
    <div className="space-y-4">
      {factors.map((factor) => {
        const percentage = Math.min(100, Math.max(0, factor.value));
        return (
          <div key={factor.name}>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="font-medium text-gray-700">{factor.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">weight: {factor.weight}</span>
                <span className="text-sm font-semibold text-gray-900">{factor.value}</span>
              </div>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${tierBg} transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            {factor.description && (
              <p className="text-xs text-gray-500 mt-1">{factor.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// SHARED COMPONENTS
// ===========================================================================

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
    green: { bg: 'bg-green-50', text: 'text-green-600' },
  };
  const colors = colorMap[color] || colorMap.blue;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${colors.bg} ${colors.text} flex items-center justify-center flex-shrink-0`}>
          {icon === 'bolt' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          )}
          {icon === 'users' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          )}
          {icon === 'dollar' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {icon === 'chart' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-base sm:text-lg font-bold text-gray-900 truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value, link }: { label: string; value?: string | null; link?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      {link ? (
        <dd className="text-sm text-indigo-600 mt-0.5 truncate">
          <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener noreferrer">
            {value}
          </a>
        </dd>
      ) : (
        <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
      )}
    </div>
  );
}
