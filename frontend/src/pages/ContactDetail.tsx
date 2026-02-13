import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Contact, Signal } from '../types';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';

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

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/contacts/${id}`)
      .then(({ data }) => setContact(data))
      .catch(() => setError('Contact not found'))
      .finally(() => setLoading(false));

    // Fetch signals for this contact
    api
      .get('/signals', { params: { actorId: id, limit: 50 } })
      .then(({ data }) => setSignals(data.signals || []))
      .catch(() => {});
  }, [id]);

  const timelineItems = useMemo(() => {
    const items = [
      ...signals.map((s) => ({
        id: s.id,
        kind: 'signal' as const,
        title: s.type.replace(/_/g, ' '),
        subtitle: s.account?.name || s.source?.name || '',
        date: s.timestamp,
        color: 'bg-amber-100 text-amber-700',
        icon: 'S',
      })),
      ...(contact?.activities || []).map((a) => ({
        id: a.id,
        kind: 'activity' as const,
        title: a.title,
        subtitle: `${a.type} - ${a.status}`,
        date: a.createdAt,
        color: 'bg-blue-100 text-blue-700',
        icon: a.type[0],
      })),
      ...(contact?.deals || []).map((d) => ({
        id: d.id,
        kind: 'deal' as const,
        title: `Deal: ${d.title}`,
        subtitle: `${d.stage}${d.amount ? ` - $${d.amount.toLocaleString()}` : ''}`,
        date: d.createdAt,
        color: 'bg-purple-100 text-purple-700',
        icon: '$',
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [signals, contact]);

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
              <p className="text-sm text-indigo-600">{contact.company.name}</p>
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

          {/* AI Enrichment */}
          <AIEnrichment contactId={id!} />

          {/* Timeline */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
            {timelineItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No timeline events yet</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                {timelineItems.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="relative flex gap-4 pb-6 last:pb-0">
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full ${item.color} flex items-center justify-center z-10 text-xs font-bold`}
                    >
                      {item.icon}
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm font-medium text-gray-900">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-gray-500">{item.subtitle}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(item.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                    to="/deals"
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
    } catch {
      setError('Enrichment failed. AI service may be unavailable.');
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
