import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Contact } from '../types';
import Spinner, { DetailSkeleton } from '../components/Spinner';
import { useToast } from '../components/Toast';
import ActivityTimeline from '../components/ActivityTimeline';
import CustomFieldsDisplay from '../components/CustomFieldsDisplay';
import { CompanyHoverCard } from '../components/HoverCard';

export default function ContactDetail() {
  useEffect(() => { document.title = 'Contact Detail — Sigscore'; }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const enrichRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/contacts/${id}`)
      .then(({ data }) => setContact(data))
      .catch(() => setError('Contact not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      await api.delete(`/contacts/${id}`);
      toast.success('Contact deleted successfully');
      navigate('/contacts');
    } catch {
      toast.error('Failed to delete contact');
      setError('Failed to delete contact');
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error || 'Contact not found'}</p>
          <Link to="/contacts" className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500">
            Back to contacts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/contacts" className="hover:text-gray-700">
          Contacts
        </Link>
        <span>/</span>
        <span className="text-gray-900">
          {contact.firstName} {contact.lastName}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold">
            {contact.firstName?.[0]}
            {contact.lastName?.[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {contact.firstName} {contact.lastName}
            </h1>
            {contact.title && <p className="text-gray-500">{contact.title}</p>}
            {contact.company && (
              <CompanyHoverCard companyId={contact.company.id}>
                <Link to={`/companies/${contact.company.id}`} className="text-sm text-indigo-600 hover:text-indigo-500 transition-colors">
                  {contact.company.name}
                </Link>
              </CompanyHoverCard>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => enrichRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            AI Enrich
          </button>
          <button
            onClick={handleDelete}
            className="text-sm text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoField label="Email" value={contact.email} />
              <InfoField label="Phone" value={contact.phone} />
              <InfoField label="Mobile" value={contact.mobile} />
              <InfoField label="Title" value={contact.title} />
              <InfoField label="LinkedIn" value={contact.linkedIn} />
              <InfoField label="Twitter" value={contact.twitter} />
              <InfoField label="GitHub" value={contact.github} />
            </dl>
          </div>

          {contact.address && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
              <p className="text-sm text-gray-700">
                {contact.address}
                {contact.city && `, ${contact.city}`}
                {contact.state && `, ${contact.state}`}
                {contact.postalCode && ` ${contact.postalCode}`}
                {contact.country && `, ${contact.country}`}
              </p>
            </div>
          )}

          {contact.notes && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
            </div>
          )}

          {/* Custom Fields */}
          <CustomFieldsDisplay entityType="contact" entityId={id!} />

          {/* Identity Resolution */}
          <IdentitySection contactId={id!} />

          {/* AI Enrichment */}
          <div ref={enrichRef}>
            <AIEnrichment contactId={id!} />
          </div>

          {/* Timeline */}
          <ActivityTimeline contactId={id!} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Deals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Deals</h2>
            {!contact.deals || contact.deals.length === 0 ? (
              <p className="text-sm text-gray-400">No deals associated</p>
            ) : (
              <div className="space-y-2">
                {contact.deals.map((deal) => (
                  <Link
                    key={deal.id}
                    to={`/deals/${deal.id}`}
                    className="block p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">{deal.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {deal.stage} {deal.amount ? `- $${deal.amount.toLocaleString()}` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activities */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activities</h2>
              <Link
                to={`/activities?contactId=${id}`}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </Link>
            </div>
            {!contact.activities || contact.activities.length === 0 ? (
              <p className="text-sm text-gray-400">No activities yet</p>
            ) : (
              <div className="space-y-2">
                {contact.activities.map((activity) => (
                  <div key={activity.id} className="p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {activity.type} - {activity.status}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="text-sm text-gray-700">{new Date(contact.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Updated</dt>
                <dd className="text-sm text-gray-700">{new Date(contact.updatedAt).toLocaleString()}</dd>
              </div>
              <CopyableId value={contact.id} />
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value, copyable = true }: { label: string; value?: string | null; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5 flex items-center gap-1.5">
        <span className="truncate">{value}</span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 flex-shrink-0"
            title="Copy to clipboard"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
            )}
          </button>
        )}
      </dd>
    </div>
  );
}

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group">
      <dt className="text-xs text-gray-500">ID</dt>
      <dd className="text-sm text-gray-700 font-mono truncate flex items-center gap-1.5">
        <span className="truncate">{value}</span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600 flex-shrink-0"
          title="Copy ID"
        >
          {copied ? (
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          )}
        </button>
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity Resolution Section
// ---------------------------------------------------------------------------

interface IdentityNode {
  type: string;
  value: string;
  verified: boolean;
  confidence: number;
  createdAt: string;
}

interface IdentityGraphData {
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  company: { id: string; name: string; domain: string | null } | null;
  identities: IdentityNode[];
}

interface DuplicateEntry {
  contactId: string;
  name: string;
  email: string | null;
  sharedIdentities: Array<{ type: string; value: string; confidence: number }>;
  overallConfidence: number;
}

interface DuplicateGroup {
  primaryContactId: string;
  primaryName: string;
  primaryEmail: string | null;
  duplicates: DuplicateEntry[];
}

const IDENTITY_ICONS: Record<string, { label: string; color: string }> = {
  EMAIL: { label: 'Email', color: 'bg-blue-100 text-blue-700' },
  GITHUB: { label: 'GitHub', color: 'bg-gray-800 text-white' },
  NPM: { label: 'npm', color: 'bg-red-100 text-red-700' },
  TWITTER: { label: 'Twitter', color: 'bg-sky-100 text-sky-700' },
  LINKEDIN: { label: 'LinkedIn', color: 'bg-blue-600 text-white' },
  IP: { label: 'IP', color: 'bg-gray-100 text-gray-700' },
  DOMAIN: { label: 'Domain', color: 'bg-green-100 text-green-700' },
};

function confidenceLabel(score: number): string {
  if (score >= 0.9) return 'Very high';
  if (score >= 0.8) return 'High';
  if (score >= 0.6) return 'Medium';
  if (score >= 0.4) return 'Low';
  return 'Very low';
}

function confidenceColor(score: number): string {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

function IdentitySection({ contactId }: { contactId: string }) {
  const toast = useToast();
  const [graph, setGraph] = useState<IdentityGraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loadingDupes, setLoadingDupes] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string[] | null>(null);
  const [merging, setMerging] = useState(false);

  // Load identity graph on mount
  useEffect(() => {
    setLoadingGraph(true);
    api
      .get(`/identity/graph/${contactId}`)
      .then(({ data }) => setGraph(data))
      .catch(() => {
        setGraph(null);
        toast.error('Failed to load identity graph');
      })
      .finally(() => setLoadingGraph(false));
  }, [contactId]);

  const handleFindDuplicates = async () => {
    setLoadingDupes(true);
    try {
      const { data } = await api.get('/identity/duplicates');
      // Filter to show only groups relevant to this contact
      const relevant = (data.duplicates || []).filter(
        (g: DuplicateGroup) =>
          g.primaryContactId === contactId ||
          g.duplicates.some((d: DuplicateEntry) => d.contactId === contactId),
      );
      setDuplicates(relevant);
      if (relevant.length === 0) {
        toast.success('No duplicates found for this contact');
      }
    } catch {
      toast.error('Failed to find duplicates');
    } finally {
      setLoadingDupes(false);
    }
  };

  const handleMerge = async (primaryId: string, duplicateIds: string[]) => {
    if (!confirm(`Merge ${duplicateIds.length} duplicate(s) into the primary contact? This cannot be undone.`)) return;
    setMerging(true);
    try {
      await api.post('/identity/merge', { primaryId, duplicateIds });
      toast.success('Contacts merged successfully');
      setDuplicates([]);
      // Refresh graph
      const { data } = await api.get(`/identity/graph/${contactId}`);
      setGraph(data);
    } catch {
      toast.error('Failed to merge contacts');
    } finally {
      setMerging(false);
    }
  };

  const handleEnrich = async () => {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const { data } = await api.post(`/identity/enrich/${contactId}`);
      setEnrichResult(data.enrichments || []);
      if (data.identitiesAdded > 0 || data.companyResolved) {
        toast.success(`Enriched: ${data.identitiesAdded} identities added`);
        // Refresh graph
        const graphRes = await api.get(`/identity/graph/${contactId}`);
        setGraph(graphRes.data);
      } else {
        toast.success('No new identities found');
      }
    } catch {
      toast.error('Enrichment failed');
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Identity Graph</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnrich}
            disabled={enriching}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 border border-indigo-200 px-2.5 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
          >
            {enriching ? 'Enriching...' : 'Enrich'}
          </button>
          <button
            onClick={handleFindDuplicates}
            disabled={loadingDupes}
            className="text-xs font-medium text-amber-600 hover:text-amber-500 disabled:opacity-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-50 transition-colors"
          >
            {loadingDupes ? 'Scanning...' : 'Find Duplicates'}
          </button>
        </div>
      </div>

      {/* Identity list */}
      {loadingGraph ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : graph && graph.identities.length > 0 ? (
        <div className="space-y-2">
          {graph.identities.map((identity, idx) => {
            const meta = IDENTITY_ICONS[identity.type] || {
              label: identity.type,
              color: 'bg-gray-100 text-gray-700',
            };
            return (
              <div
                key={`${identity.type}-${identity.value}-${idx}`}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <span
                  className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold ${meta.color}`}
                >
                  {meta.label}
                </span>
                <span className="text-sm text-gray-900 font-mono truncate flex-1">
                  {identity.value}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {identity.verified && (
                    <span className="text-xs text-green-600 font-medium">Verified</span>
                  )}
                  <span
                    className={`text-xs font-medium ${confidenceColor(identity.confidence)}`}
                    title={`Confidence: ${(identity.confidence * 100).toFixed(0)}%`}
                  >
                    {confidenceLabel(identity.confidence)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-400 py-2">
          No linked identities yet. Click "Enrich" to discover identities from connected sources.
        </p>
      )}

      {/* Enrichment results */}
      {enrichResult && enrichResult.length > 0 && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs font-medium text-green-800 mb-1.5">Enrichment results:</p>
          <ul className="space-y-0.5">
            {enrichResult.map((r, i) => (
              <li key={i} className="text-xs text-green-700">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Duplicate detection results */}
      {duplicates.length > 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-800 mb-2">Potential duplicates found:</p>
          {duplicates.map((group) => (
            <div key={group.primaryContactId} className="space-y-2">
              {group.duplicates.map((dupe) => (
                <div
                  key={dupe.contactId}
                  className="flex items-center justify-between gap-2 p-2 rounded border border-amber-100 bg-white"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{dupe.name}</p>
                    {dupe.email && (
                      <p className="text-xs text-gray-500 truncate">{dupe.email}</p>
                    )}
                    <div className="flex gap-1 mt-1">
                      {dupe.sharedIdentities.map((si, i) => (
                        <span
                          key={i}
                          className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded"
                        >
                          {si.type}: {si.value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleMerge(group.primaryContactId, [dupe.contactId])}
                    disabled={merging}
                    className="text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-2.5 py-1 rounded transition-colors flex-shrink-0"
                  >
                    {merging ? 'Merging...' : 'Merge'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Enrichment types
// ---------------------------------------------------------------------------

interface AIEnrichmentData {
  inferredRole?: string;
  inferredSeniority?: string;
  interests?: string[];
  engagementLevel?: string;
  summary?: string;
}

interface AIEnrichmentResponse {
  contactId: string;
  contact: { name: string; email: string | null; title: string | null };
  enrichment: AIEnrichmentData | string;
  signalCount: number;
  usage?: { promptTokens: number; outputTokens: number };
}

const SENIORITY_STYLES: Record<string, string> = {
  junior: 'bg-blue-50 text-blue-700 border-blue-200',
  mid: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  senior: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  lead: 'bg-violet-50 text-violet-700 border-violet-200',
  director: 'bg-purple-50 text-purple-700 border-purple-200',
  executive: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

const ENGAGEMENT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-green-50', text: 'text-green-700', label: 'High Engagement' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Medium Engagement' },
  low: { bg: 'bg-gray-50', text: 'text-gray-500', label: 'Low Engagement' },
};

function formatEnrichTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const days = Math.floor(diffHours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function AIEnrichment({ contactId }: { contactId: string }) {
  const [enrichment, setEnrichment] = useState<AIEnrichmentData | null>(null);
  const [rawFallback, setRawFallback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enrichedAt, setEnrichedAt] = useState<string | null>(null);
  const [signalCount, setSignalCount] = useState<number | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ promptTokens: number; outputTokens: number } | null>(null);

  const handleEnrich = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post<AIEnrichmentResponse>(`/ai/enrich/${contactId}`);

      if (data.enrichment && typeof data.enrichment === 'object') {
        setEnrichment(data.enrichment as AIEnrichmentData);
        setRawFallback(null);
      } else {
        // Fallback: raw text if AI returned unparseable JSON
        setEnrichment(null);
        setRawFallback(typeof data.enrichment === 'string' ? data.enrichment : JSON.stringify(data.enrichment, null, 2));
      }

      setEnrichedAt(new Date().toISOString());
      setSignalCount(data.signalCount ?? null);
      if (data.usage) {
        setTokenUsage(data.usage);
      }
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (statusCode === 402) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else if (msg?.includes('API key not configured')) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else {
        setError(msg || 'Enrichment failed. AI service may be unavailable.');
      }
    } finally {
      setLoading(false);
    }
  };

  const hasResults = enrichment || rawFallback;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-900">AI Enrichment</h3>
          {enrichedAt && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
              Enriched {formatEnrichTime(enrichedAt)}
            </span>
          )}
        </div>
        <button
          onClick={handleEnrich}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
        >
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          )}
          {hasResults ? 'Re-enrich' : 'Enrich with AI'}
        </button>
      </div>

      <div className="px-6 py-5">
        {/* Loading state */}
        {loading && !hasResults && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Spinner size="md" />
            <p className="text-sm text-gray-500">Analyzing contact signals...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-3">
            {error}
            {error.includes('Settings') && (
              <Link
                to="/settings"
                className="ml-2 text-red-800 underline hover:text-red-900 font-medium"
              >
                Go to Settings
              </Link>
            )}
          </div>
        )}

        {/* Structured enrichment display */}
        {enrichment && !loading && (
          <div className="space-y-4">
            {/* Role + Seniority + Engagement row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Inferred Role */}
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <dt className="text-xs text-gray-500 mb-1">Inferred Role</dt>
                <dd className="text-sm font-medium text-gray-900">{enrichment.inferredRole || 'Unknown'}</dd>
              </div>

              {/* Seniority */}
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <dt className="text-xs text-gray-500 mb-1">Seniority</dt>
                <dd>
                  {enrichment.inferredSeniority ? (
                    <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full border ${SENIORITY_STYLES[enrichment.inferredSeniority] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {enrichment.inferredSeniority.charAt(0).toUpperCase() + enrichment.inferredSeniority.slice(1)}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">Unknown</span>
                  )}
                </dd>
              </div>

              {/* Engagement Level */}
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <dt className="text-xs text-gray-500 mb-1">Engagement</dt>
                <dd>
                  {enrichment.engagementLevel ? (() => {
                    const style = ENGAGEMENT_STYLES[enrichment.engagementLevel] || ENGAGEMENT_STYLES.low;
                    return (
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                    );
                  })() : (
                    <span className="text-sm text-gray-400">Unknown</span>
                  )}
                </dd>
              </div>
            </div>

            {/* Interests */}
            {enrichment.interests && enrichment.interests.length > 0 && (
              <div>
                <dt className="text-xs text-gray-500 mb-2">Interests & Technologies</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {enrichment.interests.map((interest, i) => (
                    <span
                      key={i}
                      className="inline-flex text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100"
                    >
                      {interest}
                    </span>
                  ))}
                </dd>
              </div>
            )}

            {/* AI Summary */}
            {enrichment.summary && (
              <div className="p-4 rounded-lg bg-indigo-50/50 border border-indigo-100">
                <dt className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  AI Summary
                </dt>
                <dd className="text-sm text-gray-700 leading-relaxed">{enrichment.summary}</dd>
              </div>
            )}

            {/* Footer: signal count + token usage */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs text-gray-400">
              <div className="flex items-center gap-3">
                {signalCount !== null && (
                  <span>Based on {signalCount} signal{signalCount !== 1 ? 's' : ''}</span>
                )}
              </div>
              {tokenUsage && (
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
                  </svg>
                  <span>{tokenUsage.promptTokens.toLocaleString()} + {tokenUsage.outputTokens.toLocaleString()} tokens</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raw text fallback */}
        {rawFallback && !enrichment && !loading && (
          <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-100">
            {rawFallback}
          </div>
        )}

        {/* Empty state */}
        {!hasResults && !loading && !error && (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            <p className="text-sm text-gray-500 mb-3">Click "Enrich with AI" to infer role, seniority, interests, and engagement level from signal data.</p>
            <button
              onClick={handleEnrich}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Enrich with AI
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
