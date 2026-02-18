import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Types for the duplicate detection API response
// ---------------------------------------------------------------------------

interface SharedIdentity {
  type: string;
  value: string;
  confidence: number;
}

interface DuplicateContact {
  contactId: string;
  name: string;
  email: string | null;
  sharedIdentities: SharedIdentity[];
  overallConfidence: number;
}

interface DuplicateGroup {
  primaryContactId: string;
  primaryName: string;
  primaryEmail: string | null;
  duplicates: DuplicateContact[];
}

// ---------------------------------------------------------------------------
// Enriched contact data fetched separately for the side-by-side view
// ---------------------------------------------------------------------------

interface ContactDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  title: string | null;
  phone: string | null;
  github: string | null;
  linkedIn: string | null;
  twitter: string | null;
  company: { id: string; name: string } | null;
  createdAt: string;
  _signalCount?: number;
  _identityCount?: number;
}

// ---------------------------------------------------------------------------
// Confidence label/color helpers
// ---------------------------------------------------------------------------

function confidenceLabel(score: number): string {
  if (score >= 0.95) return 'Very High';
  if (score >= 0.8) return 'High';
  if (score >= 0.6) return 'Medium';
  return 'Low';
}

function confidenceColor(score: number): string {
  if (score >= 0.95) return 'bg-green-100 text-green-700';
  if (score >= 0.8) return 'bg-emerald-100 text-emerald-700';
  if (score >= 0.6) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}

function identityTypeLabel(type: string): string {
  const map: Record<string, string> = {
    EMAIL: 'Email',
    GITHUB: 'GitHub',
    NPM: 'npm',
    TWITTER: 'Twitter',
    LINKEDIN: 'LinkedIn',
    DISCORD: 'Discord',
    STACKOVERFLOW: 'Stack Overflow',
    REDDIT: 'Reddit',
    POSTHOG: 'PostHog',
    DOMAIN: 'Domain',
    IP: 'IP',
  };
  return map[type] || type;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ContactDuplicates() {
  useEffect(() => { document.title = 'Duplicate Contacts — DevSignal'; }, []);
  const toast = useToast();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState<string | null>(null);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contacts/duplicates');
      setGroups(data.groups || []);
    } catch {
      toast.error('Failed to load duplicate contacts');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchDuplicates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMerge = async (primaryId: string, duplicateIds: string[]) => {
    const groupKey = [primaryId, ...duplicateIds].sort().join(':');
    setMerging(groupKey);
    try {
      const { data } = await api.post(`/contacts/${primaryId}/merge`, {
        duplicateIds,
      });
      if (data.merged > 0) {
        toast.success(
          `Merged ${data.merged} duplicate${data.merged !== 1 ? 's' : ''} successfully`
        );
        // Remove the merged group from the list
        setGroups((prev) =>
          prev.filter((g) => {
            const gKey = [g.primaryContactId, ...g.duplicates.map((d) => d.contactId)]
              .sort()
              .join(':');
            return gKey !== groupKey;
          })
        );
      }
      if (data.errors && data.errors.length > 0) {
        toast.error(`Some merges failed: ${data.errors.join(', ')}`);
      }
    } catch {
      toast.error('Failed to merge contacts');
    } finally {
      setMerging(null);
    }
  };

  const handleDismiss = (primaryId: string, duplicateIds: string[]) => {
    const groupKey = [primaryId, ...duplicateIds].sort().join(':');
    setDismissed((prev) => new Set(prev).add(groupKey));
  };

  const visibleGroups = groups.filter((g) => {
    const groupKey = [g.primaryContactId, ...g.duplicates.map((d) => d.contactId)]
      .sort()
      .join(':');
    return !dismissed.has(groupKey);
  });

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/contacts"
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Duplicate Contacts</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 ml-8">
            {loading
              ? 'Scanning for duplicates...'
              : visibleGroups.length > 0
                ? `${visibleGroups.length} potential duplicate group${visibleGroups.length !== 1 ? 's' : ''} found`
                : 'No duplicates detected'}
          </p>
        </div>
        <button
          onClick={fetchDuplicates}
          disabled={loading}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          Re-scan
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <EmptyState
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="No duplicates found"
            description="All your contacts appear to be unique. We check for matching emails and shared identities across your contact database."
          />
        </div>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((group) => {
            const groupKey = [
              group.primaryContactId,
              ...group.duplicates.map((d) => d.contactId),
            ]
              .sort()
              .join(':');
            const isMerging = merging === groupKey;
            const allDuplicateIds = group.duplicates.map((d) => d.contactId);
            const bestConfidence = Math.max(
              ...group.duplicates.map((d) => d.overallConfidence)
            );

            return (
              <DuplicateGroupCard
                key={groupKey}
                group={group}
                isMerging={isMerging}
                bestConfidence={bestConfidence}
                onMerge={(primaryId) => handleMerge(primaryId, allDuplicateIds)}
                onDismiss={() =>
                  handleDismiss(group.primaryContactId, allDuplicateIds)
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate group card component
// ---------------------------------------------------------------------------

function DuplicateGroupCard({
  group,
  isMerging,
  bestConfidence,
  onMerge,
  onDismiss,
}: {
  group: DuplicateGroup;
  isMerging: boolean;
  bestConfidence: number;
  onMerge: (primaryId: string) => void;
  onDismiss: () => void;
}) {
  const [selectedPrimary, setSelectedPrimary] = useState(group.primaryContactId);

  // All contact IDs in this group
  const allContacts = [
    { id: group.primaryContactId, name: group.primaryName, email: group.primaryEmail },
    ...group.duplicates.map((d) => ({ id: d.contactId, name: d.name, email: d.email })),
  ];

  // Shared identities from the duplicates
  const sharedIdentities = group.duplicates.flatMap((d) => d.sharedIdentities);
  // Deduplicate
  const uniqueIdentities = sharedIdentities.filter(
    (id, idx, arr) =>
      arr.findIndex((x) => x.type === id.type && x.value === id.value) === idx
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Group header */}
      <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700">
              {allContacts.length} contacts
            </span>
          </div>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${confidenceColor(bestConfidence)}`}
          >
            {confidenceLabel(bestConfidence)} confidence ({Math.round(bestConfidence * 100)}%)
          </span>
          {uniqueIdentities.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500">Matched by:</span>
              {uniqueIdentities.map((id, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium"
                >
                  {identityTypeLabel(id.type)}: {id.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Contact cards side by side */}
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contactId={contact.id}
              name={contact.name}
              email={contact.email}
              isSelected={selectedPrimary === contact.id}
              onSelect={() => setSelectedPrimary(contact.id)}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-5 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 flex-shrink-0">
            Selected contact will be kept as primary. Others will be merged into it.
          </p>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onDismiss}
              disabled={isMerging}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Not a duplicate
            </button>
            <button
              onClick={() => onMerge(selectedPrimary)}
              disabled={isMerging}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isMerging ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Merging...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  Merge contacts
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual contact card within a duplicate group
// ---------------------------------------------------------------------------

function ContactCard({
  contactId,
  name,
  email,
  isSelected,
  onSelect,
}: {
  contactId: string;
  name: string;
  email: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchDetail = async () => {
      try {
        const { data } = await api.get(`/contacts/${contactId}`);
        if (!cancelled) {
          setDetail({
            id: data.id,
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email ?? null,
            title: data.title ?? null,
            phone: data.phone ?? null,
            github: data.github ?? null,
            linkedIn: data.linkedIn ?? null,
            twitter: data.twitter ?? null,
            company: data.company ?? null,
            createdAt: data.createdAt,
            _signalCount: data.signals?.length ?? data._signalCount ?? undefined,
            _identityCount: data.identities?.length ?? data._identityCount ?? undefined,
          });
        }
      } catch {
        // Fall back to basic info from the group
        if (!cancelled) {
          setDetail({
            id: contactId,
            firstName: name.split(' ')[0] || name,
            lastName: name.split(' ').slice(1).join(' ') || '',
            email,
            title: null,
            phone: null,
            github: null,
            linkedIn: null,
            twitter: null,
            company: null,
            createdAt: '',
          });
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [contactId, name, email]);

  const initials = detail
    ? `${detail.firstName?.[0] || ''}${detail.lastName?.[0] || ''}`
    : name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2);

  return (
    <div
      onClick={onSelect}
      className={`rounded-lg border-2 p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50/30 shadow-sm'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      {/* Selection indicator */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
              isSelected
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {initials.toUpperCase()}
          </div>
          <div className="min-w-0">
            <Link
              to={`/contacts/${contactId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-gray-900 hover:text-indigo-600 truncate block"
            >
              {detail ? `${detail.firstName} ${detail.lastName}`.trim() : name}
            </Link>
            {detail?.title && (
              <p className="text-xs text-gray-500 truncate">{detail.title}</p>
            )}
          </div>
        </div>
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>

      {loadingDetail ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : detail ? (
        <div className="space-y-2 text-xs">
          {detail.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
              <span className="truncate">{detail.email}</span>
            </div>
          )}
          {detail.company && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
              <span className="truncate text-indigo-600 font-medium">{detail.company.name}</span>
            </div>
          )}
          {detail.phone && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              <span className="truncate">{detail.phone}</span>
            </div>
          )}
          {detail.github && (
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="truncate">{detail.github}</span>
            </div>
          )}
          {detail.createdAt && (
            <div className="flex items-center gap-2 text-gray-400 pt-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Created {new Date(detail.createdAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      ) : null}

      {isSelected && (
        <div className="mt-3 pt-2 border-t border-indigo-100">
          <span className="text-xs font-medium text-indigo-600">
            Primary (will be kept)
          </span>
        </div>
      )}
    </div>
  );
}
