import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Contact } from '../types';

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      navigate('/contacts');
    } catch {
      setError('Failed to delete contact');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
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
