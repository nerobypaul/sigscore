import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Contact, Pagination } from '../types';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import CSVImport from '../components/CSVImport';
import SavedViewSelector from '../components/SavedViewSelector';

export default function Contacts() {
  const navigate = useNavigate();
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'delete' | 'tag' | null>(null);
  const [bulkTagName, setBulkTagName] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contacts', {
        params: { search: search || undefined, page, limit: 20 },
      });
      setContacts(data.contacts || []);
      setPagination(data.pagination || null);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

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

  // --- Bulk actions ---

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const { data } = await api.post('/bulk/contacts/delete', {
        ids: Array.from(selectedIds),
      });
      toast.success(`Deleted ${data.deleted} contact${data.deleted !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setBulkAction(null);
      fetchContacts();
    } catch {
      toast.error('Failed to delete contacts');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkTag = async () => {
    if (selectedIds.size === 0 || !bulkTagName.trim()) return;
    setBulkLoading(true);
    try {
      const { data } = await api.post('/bulk/contacts/tag', {
        ids: Array.from(selectedIds),
        tagName: bulkTagName.trim(),
      });
      toast.success(`Tagged ${data.tagged} contact${data.tagged !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setBulkAction(null);
      setBulkTagName('');
      fetchContacts();
    } catch {
      toast.error('Failed to tag contacts');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExport = async () => {
    setBulkLoading(true);
    try {
      const payload: { ids?: string[]; filters?: { search?: string } } =
        selectedIds.size > 0
          ? { ids: Array.from(selectedIds) }
          : search
            ? { filters: { search } }
            : {};

      const { data } = await api.post('/bulk/contacts/export', payload, {
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

      toast.success(
        selectedIds.size > 0
          ? `Exported ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}`
          : 'Contacts exported'
      );
    } catch {
      toast.error('Failed to export contacts');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total} total contacts` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            disabled={bulkLoading}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Import CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            Add Contact
          </button>
        </div>
      </div>

      {/* Saved Views */}
      <SavedViewSelector
        entityType="contact"
        currentFilters={{ search: search || undefined }}
        onFiltersChange={handleViewFiltersChange}
      />

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search contacts by name or email..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full max-w-md px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
          <span className="text-sm font-medium text-indigo-900">
            {selectedIds.size} selected
          </span>
          <div className="h-4 w-px bg-indigo-300" />
          <button
            onClick={() => setBulkAction('delete')}
            disabled={bulkLoading}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            onClick={() => setBulkAction('tag')}
            disabled={bulkLoading}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          >
            Add Tag
          </button>
          <button
            onClick={handleExport}
            disabled={bulkLoading}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          >
            Export Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : contacts.length === 0 ? (
          search ? (
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
          )
        ) : (
          <>
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
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Title</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Company</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${
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
                            to={`/companies`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-indigo-600 hover:text-indigo-500"
                          >
                            {contact.company.name}
                          </Link>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500" onClick={() => navigate(`/contacts/${contact.id}`)}>
                        {new Date(contact.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= (pagination?.totalPages ?? 1)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {bulkAction === 'delete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete contacts?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''}. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setBulkAction(null)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkLoading}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {bulkLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      {bulkAction === 'tag' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Add tag</h3>
            <p className="text-sm text-gray-600 mb-4">
              Apply a tag to {selectedIds.size} selected contact{selectedIds.size !== 1 ? 's' : ''}.
            </p>
            <input
              type="text"
              placeholder="Tag name..."
              value={bulkTagName}
              onChange={(e) => setBulkTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && bulkTagName.trim()) handleBulkTag();
              }}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none mb-6"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setBulkAction(null);
                  setBulkTagName('');
                }}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkTag}
                disabled={bulkLoading || !bulkTagName.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkLoading ? 'Tagging...' : 'Apply Tag'}
              </button>
            </div>
          </div>
        </div>
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
