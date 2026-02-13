import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Company, Contact, Deal, Signal, AccountScore } from '../types';
import { STAGE_LABELS, STAGE_COLORS, TIER_COLORS } from '../types';
import Spinner from '../components/Spinner';
import { useToast } from '../components/Toast';

const SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup',
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
  ENTERPRISE: 'Enterprise',
};

interface CompanyWithRelations extends Company {
  contacts?: Contact[];
  deals?: Deal[];
  signals?: Signal[];
  score?: AccountScore | null;
}

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [company, setCompany] = useState<CompanyWithRelations | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [score, setScore] = useState<AccountScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'contacts' | 'deals' | 'signals'>('contacts');

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      api.get(`/companies/${id}`),
      api.get('/contacts', { params: { companyId: id, limit: 50 } }).catch(() => ({ data: { contacts: [] } })),
      api.get('/deals', { params: { companyId: id, limit: 50 } }).catch(() => ({ data: { deals: [] } })),
      api.get('/signals', { params: { accountId: id, limit: 20 } }).catch(() => ({ data: { signals: [] } })),
    ])
      .then(([companyRes, contactsRes, dealsRes, signalsRes]) => {
        setCompany(companyRes.data);
        setContacts(contactsRes.data.contacts || []);
        setDeals(dealsRes.data.deals || []);
        setSignals(signalsRes.data.signals || []);
        // Score may be embedded in company response
        if (companyRes.data.score) setScore(companyRes.data.score);
      })
      .catch(() => setError('Company not found'))
      .finally(() => setLoading(false));
  }, [id]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error || 'Company not found'}</p>
          <Link to="/companies" className="mt-3 inline-block text-sm text-indigo-600 hover:text-indigo-500">
            Back to companies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link to="/companies" className="hover:text-gray-700">Companies</Link>
        <span>/</span>
        <span className="text-gray-900">{company.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl font-bold">
            {company.name[0]?.toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              {company.industry && <span className="text-sm text-gray-500">{company.industry}</span>}
              {company.size && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {SIZE_LABELS[company.size] || company.size}
                </span>
              )}
              {score && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIER_COLORS[score.tier]}`}>
                  PQA: {score.score} ({score.tier})
                </span>
              )}
            </div>
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
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoField label="Domain" value={company.domain} />
              <InfoField label="Website" value={company.website} link />
              <InfoField label="Email" value={company.email} />
              <InfoField label="Phone" value={company.phone} />
              <InfoField label="LinkedIn" value={company.linkedIn} />
              <InfoField label="Twitter" value={company.twitter} />
              <InfoField label="GitHub" value={company.githubOrg} />
            </dl>
          </div>

          {company.address && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
              <p className="text-sm text-gray-700">
                {company.address}
                {company.city && `, ${company.city}`}
                {company.state && `, ${company.state}`}
                {company.postalCode && ` ${company.postalCode}`}
                {company.country && `, ${company.country}`}
              </p>
            </div>
          )}

          {company.description && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.description}</p>
            </div>
          )}

          {/* Tabs: Contacts / Deals / Signals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="flex border-b border-gray-200">
              {(['contacts', 'deals', 'signals'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                    tab === t
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'contacts' ? `Contacts (${contacts.length})` : t === 'deals' ? `Deals (${deals.length})` : `Signals (${signals.length})`}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === 'contacts' && (
                contacts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No contacts linked to this company</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {contacts.map((c) => (
                      <Link
                        key={c.id}
                        to={`/contacts/${c.id}`}
                        className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                          {c.firstName?.[0]}{c.lastName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{c.firstName} {c.lastName}</p>
                          <p className="text-xs text-gray-500 truncate">{c.email || c.title || ''}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              )}

              {tab === 'deals' && (
                deals.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No deals for this company</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {deals.map((d) => {
                      const stageKey = d.stage as keyof typeof STAGE_LABELS;
                      return (
                        <div key={d.id} className="flex items-center justify-between py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{d.title}</p>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STAGE_COLORS[stageKey] || 'bg-gray-100 text-gray-700'}`}>
                              {STAGE_LABELS[stageKey] || d.stage}
                            </span>
                          </div>
                          {d.amount != null && (
                            <span className="text-sm font-semibold text-gray-700">${d.amount.toLocaleString()}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {tab === 'signals' && (
                signals.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No signals recorded</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {signals.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{s.type}</p>
                          <p className="text-xs text-gray-500">{s.source?.name || 'Unknown source'}</p>
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(s.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* PQA Score card */}
          {score && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">PQA Score</h2>
              <div className="text-center mb-4">
                <div className="text-4xl font-bold text-gray-900">{score.score}</div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TIER_COLORS[score.tier]}`}>
                  {score.tier}
                </span>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Signal count</dt>
                  <dd className="font-medium text-gray-900">{score.signalCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Unique users</dt>
                  <dd className="font-medium text-gray-900">{score.userCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Trend</dt>
                  <dd className="font-medium text-gray-900">{score.trend}</dd>
                </div>
                {score.lastSignalAt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Last signal</dt>
                    <dd className="font-medium text-gray-900">{new Date(score.lastSignalAt).toLocaleDateString()}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Details</h2>
            <dl className="space-y-3">
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
