import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Contact, Pagination } from '../types';
import { TableSkeleton } from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import CSVImport from '../components/CSVImport';
import SavedViewSelector from '../components/SavedViewSelector';
import BulkActionBar from '../components/BulkActionBar';

export default function Contacts() {
  useEffect(() => { document.title = 'Contacts — DevSignal'; }, []);
  const navigate = useNavigate();
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  // Filter state
  const [companyFilter, setCompanyFilter] = useState('');
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);

  // Load companies for filter dropdown
  useEffect(() => {
    api.get('/companies', { params: { limit: 200 } })
      .then(({ data }) => setCompaniesList(data.companies || []))
      .catch(() => {});
  }, []);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contacts', {
        params: {
          search: search || undefined,
          page,
          limit: 20,
          sortField,
          sortDirection,
          companyId: companyFilter || undefined,
        },
      });
      setContacts(data.contacts || []);
      setPagination(data.pagination || null);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [search, page, sortField, sortDirection, companyFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Clear selection on page/search change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search]);

  // Saved view filter handler
  const handleViewFiltersChange = useCallback((filters: Record<string, unknown>) => {
    const viewSearch = (filters.search as string) || '';
    setSearchInput(viewSearch);
    setSearch(viewSearch);
    setPage(1);
  }, []);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const allOnPageSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      // sortField / sortDirection could be added here if sort state is tracked

      const { data } = await api.get('/contacts/export', {
        params,
        responseType: 'blob',
      });

      // Trigger download
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Contacts exported');
    } catch {
      toast.error('Failed to export contacts');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total} total contacts` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="border border-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export CSV'}</span>
            <span className="sm:hidden">{exporting ? 'Exporting...' : 'Export'}</span>
          </button>
          <Link
            to="/contacts/duplicates"
            className="border border-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span className="hidden sm:inline">Find Duplicates</span>
            <span className="sm:hidden">Dupes</span>
          </Link>
          <button
            onClick={() => setShowImport(true)}
            className="border border-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">Import</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <span className="hidden sm:inline">Add Contact</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Saved Views */}
      <SavedViewSelector
        entityType="contact"
        currentFilters={{ search: search || undefined }}
        onFiltersChange={handleViewFiltersChange}
      />

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px] max-w-md">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>
        <div>
          <select
            value={companyFilter}
            onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
          >
            <option value="">All companies</option>
            {companiesList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {(search || companyFilter) && (
          <button
            onClick={() => { setSearchInput(''); setSearch(''); setCompanyFilter(''); setPage(1); }}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Contact List */}
      {loading ? (
        <>
          {/* Mobile skeleton */}
          <div className="md:hidden space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="h-4 w-4 bg-gray-200 rounded mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-full bg-gray-200" />
                      <div><div className="h-4 w-28 bg-gray-200 rounded mb-1" /><div className="h-3 w-20 bg-gray-200 rounded" /></div>
                    </div>
                    <div className="flex gap-4"><div className="h-3 w-36 bg-gray-200 rounded" /><div className="h-3 w-20 bg-gray-200 rounded" /></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop skeleton */}
          <div className="hidden md:block">
            <TableSkeleton rows={8} columns={6} />
          </div>
        </>
      ) : contacts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {search ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No contacts match your search
            </div>
          ) : (
            <EmptyState
              icon={
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              }
              title="No contacts yet"
              description="Get started by adding your first contact to begin building your network."
              actionLabel="Add Contact"
              onAction={() => setShowCreate(true)}
            />
          )}
        </div>
      ) : (
        <>
          {/* Mobile card view (< md) */}
          <div className="md:hidden space-y-3">
            {/* Select all on mobile */}
            <div className="flex items-center gap-3 px-1">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-gray-500">Select all</span>
            </div>
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 transition-all ${
                  selectedIds.has(contact.id) ? 'ring-2 ring-indigo-500 bg-indigo-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(contact.id)}
                    onChange={() => toggleSelect(contact.id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 mt-1 flex-shrink-0"
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/contacts/${contact.id}`)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {contact.firstName?.[0]}
                        {contact.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {contact.firstName} {contact.lastName}
                        </p>
                        {contact.title && (
                          <p className="text-xs text-gray-500 truncate">{contact.title}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {contact.email && (
                        <span className="truncate max-w-[200px]">{contact.email}</span>
                      )}
                      {contact.company && (
                        <span className="text-indigo-600 font-medium">{contact.company.name}</span>
                      )}
                      <span className="text-gray-400">
                        {new Date(contact.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table view (>= md) */}
          <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <SortableHeader field="firstName" label="Name" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader field="email" label="Email" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                    <SortableHeader field="title" label="Title" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Company</th>
                    <SortableHeader field="createdAt" label="Created" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className={`group hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedIds.has(contact.id) ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(contact.id)}
                          onChange={() => toggleSelect(contact.id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-3 px-4" onClick={() => navigate(`/contacts/${contact.id}`)}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                            {contact.firstName?.[0]}
                            {contact.lastName?.[0]}
                          </div>
                          <span className="font-medium text-gray-900">
                            {contact.firstName} {contact.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600" onClick={() => navigate(`/contacts/${contact.id}`)}>{contact.email || '--'}</td>
                      <td className="py-3 px-4 text-gray-600" onClick={() => navigate(`/contacts/${contact.id}`)}>{contact.title || '--'}</td>
                      <td className="py-3 px-4">
                        {contact.company ? (
                          <Link
                            to={`/companies/${contact.company.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-600 hover:text-indigo-500"
                          >
                            {contact.company.name}
                          </Link>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 relative" onClick={() => navigate(`/contacts/${contact.id}`)}>
                        <span className="group-hover:invisible">
                          {new Date(contact.createdAt).toLocaleDateString()}
                        </span>
                        <div
                          className="absolute inset-0 items-center justify-end gap-1 pr-4 hidden group-hover:flex"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => navigate(`/contacts/${contact.id}`)}
                            className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            title="View details"
                          >
                            View
                          </button>
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition-colors"
                              title="Send email"
                            >
                              Email
                            </a>
                          )}
                          {contact.company && (
                            <button
                              onClick={() => navigate(`/companies/${contact.company!.id}`)}
                              className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors"
                              title="View company"
                            >
                              Company
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 px-1 md:px-4 py-3 md:bg-white md:rounded-xl md:shadow-sm md:border md:border-gray-200">
              <p className="text-sm text-gray-500">
                Showing <span className="font-medium text-gray-700">{(page - 1) * 20 + 1}–{Math.min(page * 20, pagination.total)}</span> of <span className="font-medium text-gray-700">{pagination.total}</span>
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  let pageNum: number;
                  if (pagination.totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= pagination.totalPages - 2) {
                    pageNum = pagination.totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      className={`w-8 h-8 text-sm rounded-lg transition-colors ${
                        page === pageNum
                          ? 'bg-indigo-600 text-white font-semibold'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= (pagination?.totalPages ?? 1)}
                  className="px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds(new Set())}
          onActionComplete={fetchContacts}
        />
      )}

      {/* Create Contact Modal */}
      {showCreate && (
        <CreateContactModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchContacts();
            toast.success('Contact created successfully');
          }}
        />
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <CSVImport
          entityType="contacts"
          onClose={() => setShowImport(false)}
          onImported={() => {
            fetchContacts();
            toast.success('Contacts imported successfully');
          }}
        />
      )}
    </div>
  );
}

function SortableHeader({
  field,
  label,
  sortField: currentSort,
  sortDirection: currentDir,
  onSort,
}: {
  field: string;
  label: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const isActive = currentSort === field;
  return (
    <th
      className="text-left py-3 px-4 font-semibold text-gray-600 cursor-pointer select-none hover:text-gray-900 transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <svg className={`w-3.5 h-3.5 transition-colors ${isActive ? 'text-indigo-600' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {isActive && currentDir === 'asc' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          ) : isActive && currentDir === 'desc' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
          )}
        </svg>
      </span>
    </th>
  );
}

function CreateContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/contacts', {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        title: form.title || undefined,
        notes: form.notes || undefined,
      });
      onCreated();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || 'Failed to create contact';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New Contact</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name *</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name *</label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Progressive disclosure: more details */}
          {!showMore ? (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add more details
            </button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
