import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Contact } from '../types';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';
import ActivityTimeline from '../components/ActivityTimeline';
import CustomFieldsDisplay from '../components/CustomFieldsDisplay';

export default function ContactDetail() {
  useEffect(() => { document.title = 'Contact Detail — DevSignal'; }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
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
              <Link to={`/companies/${contact.company.id}`} className="text-sm text-indigo-600 hover:text-indigo-500 transition-colors">
                {contact.company.name}
              </Link>
            )}
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="text-sm text-red-600 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
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
          <AIEnrichment contactId={id!} />

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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activities</h2>
            {!contact.activities || contact.activities.length === 0 ? (
              <p className="text-sm text-gray-400">No activities yet</p>
            ) : (
              <div className="space-y-2">
                {contact.activities.map((activity) => (
                  <div key={activity.id} className="p-3 rounded-lg border border-gray-100">
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
              <div>
                <dt className="text-xs text-gray-500">ID</dt>
                <dd className="text-sm text-gray-700 font-mono truncate">{contact.id}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
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
      .catch(() => {})
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

function AIEnrichment({ contactId }: { contactId: string }) {
  const [enrichment, setEnrichment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEnrich = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post(`/ai/enrich/${contactId}`);
      setEnrichment(data.enrichment || data.content || JSON.stringify(data, null, 2));
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response?.status;
      if (statusCode === 402) {
        setError('AI features require an Anthropic API key. Configure it in Settings > AI Configuration.');
      } else {
        setError('Enrichment failed. AI service may be unavailable.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">AI Enrichment</h2>
        <button
          onClick={handleEnrich}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Enriching...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              Enrich with AI
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">
          {error}
        </div>
      )}

      {enrichment ? (
        <div className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-4 border border-gray-100">
          {enrichment}
        </div>
      ) : (
        <p className="text-sm text-gray-400">
          Click "Enrich with AI" to gather additional intelligence about this contact from public sources.
        </p>
      )}
    </div>
  );
}
