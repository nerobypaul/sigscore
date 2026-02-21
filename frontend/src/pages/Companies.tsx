import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import type { Company, Pagination } from '../types';
import { CardGridSkeleton } from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import CSVImport from '../components/CSVImport';
import SavedViewSelector from '../components/SavedViewSelector';
import ScoreTrendSparkline from '../components/ScoreTrendSparkline';

const SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup',
  SMALL: 'Small',
  MEDIUM: 'Medium',
  LARGE: 'Large',
  ENTERPRISE: 'Enterprise',
};

export default function Companies() {
  useEffect(() => { document.title = 'Companies — DevSignal'; }, []);
  const toast = useToast();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Bulk selection state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'delete' | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Filter state
  const [sizeFilter, setSizeFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');

  // Compare selection state (independent from bulk selection)
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 4) {
        next.add(id);
      } else {
        toast.info('You can compare up to 4 companies at a time');
      }
      return next;
    });
  };

  const handleCompare = () => {
    if (compareIds.size < 2) {
      toast.info('Select at least 2 companies to compare');
      return;
    }
    navigate(`/companies/compare?ids=${Array.from(compareIds).join(',')}`);
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/companies', {
        params: {
          search: search || undefined,
          size: sizeFilter || undefined,
          industry: industryFilter || undefined,
          page,
          limit: 20,
        },
      });
      setCompanies(data.companies || []);
      setPagination(data.pagination || null);
    } catch {
      setCompanies([]);
      toast.error('Failed to load companies.');
    } finally {
      setLoading(false);
    }
  }, [search, sizeFilter, industryFilter, page]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(companies.map((c) => c.id)));
    }
  };

  const allOnPageSelected =
    companies.length > 0 && companies.every((c) => selectedIds.has(c.id));

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // --- Export ---
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;

      const { data } = await api.get('/companies/export', {
        params,
        responseType: 'blob',
      });

      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `companies-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Companies exported');
    } catch {
      toast.error('Failed to export companies');
    } finally {
      setExporting(false);
    }
  };

  // --- Bulk actions ---

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const { data } = await api.post('/bulk/companies/delete', {
        ids: Array.from(selectedIds),
      });
      toast.success(
        `Deleted ${data.deleted} company${data.deleted !== 1 ? 'ies' : 'y'}`
      );
      setSelectedIds(new Set());
      setBulkAction(null);
      setSelectMode(false);
      fetchCompanies();
    } catch {
      toast.error('Failed to delete companies');
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 md:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total} total companies` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => {
              if (selectMode) {
                exitSelectMode();
              } else {
                setSelectMode(true);
              }
            }}
            className={`border px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 ${
              selectMode
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="hidden sm:inline">{selectMode ? 'Exit Select' : 'Select'}</span>
            <span className="sm:hidden">{selectMode ? 'Exit' : 'Select'}</span>
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="border border-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export CSV'}</span>
            <span className="sm:hidden">{exporting ? 'Exporting...' : 'Export'}</span>
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="border border-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <span className="hidden sm:inline">Import CSV</span>
            <span className="sm:hidden">Import</span>
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
          >
            <span className="hidden sm:inline">Add Company</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Saved Views */}
      <SavedViewSelector
        entityType="company"
        currentFilters={{ search: search || undefined }}
        onFiltersChange={handleViewFiltersChange}
      />

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search companies..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full sm:max-w-md px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>

      {/* Active filter pills */}
      {(sizeFilter || industryFilter) && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Filters:</span>
          {sizeFilter && (
            <button
              onClick={() => { setSizeFilter(''); setPage(1); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
            >
              Size: {SIZE_LABELS[sizeFilter] || sizeFilter}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {industryFilter && (
            <button
              onClick={() => { setIndustryFilter(''); setPage(1); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
            >
              Industry: {industryFilter}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => { setSizeFilter(''); setIndustryFilter(''); setPage(1); }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk action toolbar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-3 sm:px-4 py-3">
          <span className="text-sm font-medium text-indigo-900">
            {selectedIds.size} selected
          </span>
          <div className="hidden sm:block h-4 w-px bg-indigo-300" />
          <button
            onClick={toggleSelectAll}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            {allOnPageSelected ? 'Deselect all' : 'Select all'}
          </button>
          <div className="hidden sm:block h-4 w-px bg-indigo-300" />
          <button
            onClick={() => setBulkAction('delete')}
            disabled={bulkLoading}
            className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      )}

      {/* Select mode hint (when in select mode but nothing selected) */}
      {selectMode && selectedIds.size === 0 && !loading && companies.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-600">
            Click on cards to select companies for bulk actions.
          </span>
          <button
            onClick={toggleSelectAll}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Select all on page
          </button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <CardGridSkeleton count={6} />
      ) : companies.length === 0 ? (
        search ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <svg className="w-10 h-10 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <p className="text-gray-400 text-sm">
              No companies match your search
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <EmptyState
              icon={
                <svg
                  className="w-7 h-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 21h19.5M3.75 3v18m16.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                  />
                </svg>
              }
              title="No companies yet"
              description="Start tracking the organizations you work with by adding your first company."
              actionLabel="Add Company"
              onAction={() => setShowCreate(true)}
            />
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              selectMode={selectMode}
              selected={selectedIds.has(company.id)}
              onToggleSelect={() => toggleSelect(company.id)}
              compareSelected={compareIds.has(company.id)}
              onToggleCompare={() => toggleCompare(company.id)}
              onFilterSize={(s) => { setSizeFilter(s); setPage(1); }}
              onFilterIndustry={(i) => { setIndustryFilter(i); setPage(1); }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (() => {
        const start = (page - 1) * 20 + 1;
        const end = Math.min(page * 20, pagination.total);
        const maxVisible = 5;
        let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
        const endPage = Math.min(pagination.totalPages, startPage + maxVisible - 1);
        if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
        const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

        return (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6">
            <p className="text-sm text-gray-600">
              Showing {start}-{end} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Previous page"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              {pages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 text-sm rounded-lg font-medium transition-colors ${
                    p === page
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= (pagination?.totalPages ?? 1)}
                className="p-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Next page"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        );
      })()}

      {/* Bulk Delete Confirmation Modal */}
      {bulkAction === 'delete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete companies?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete {selectedIds.size} company
              {selectedIds.size !== 1 ? 'ies' : 'y'}. This action cannot be
              undone.
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

      {/* Create Modal */}
      {showCreate && (
        <CreateCompanyModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchCompanies();
            toast.success('Company created successfully');
          }}
        />
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <CSVImport
          entityType="companies"
          onClose={() => setShowImport(false)}
          onImported={() => {
            fetchCompanies();
            toast.success('Companies imported successfully');
          }}
        />
      )}

      {/* Floating Compare Bar */}
      {compareIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-3 bg-white border border-gray-200 shadow-xl rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              <span className="text-sm font-medium text-gray-700">
                {compareIds.size} of 4 selected
              </span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <button
              onClick={handleCompare}
              disabled={compareIds.size < 2}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Compare
            </button>
            <button
              onClick={() => setCompareIds(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyCard({
  company,
  selectMode,
  selected,
  onToggleSelect,
  compareSelected,
  onToggleCompare,
  onFilterSize,
  onFilterIndustry,
}: {
  company: Company;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  compareSelected: boolean;
  onToggleCompare: () => void;
  onFilterSize: (size: string) => void;
  onFilterIndustry: (industry: string) => void;
}) {
  const cardContent = (
    <>
      {/* Checkbox overlay in select mode */}
      {selectMode && (
        <div className="absolute top-3 left-3 z-10">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Compare checkbox (visible when not in bulk select mode) */}
      {!selectMode && (
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleCompare();
            }}
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
              compareSelected
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'border-gray-300 bg-white text-transparent hover:border-indigo-400'
            }`}
            title={compareSelected ? 'Remove from comparison' : 'Add to comparison'}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex items-start justify-between mb-3">
        <div
          className={`w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            selectMode ? 'ml-6' : ''
          }`}
        >
          {company.name[0]?.toUpperCase()}
        </div>
        {company.size && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFilterSize(company.size!); }}
            className={`text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-700 transition-colors cursor-pointer ${!selectMode ? 'mr-8' : ''}`}
            title={`Filter by ${SIZE_LABELS[company.size] || company.size}`}
          >
            {SIZE_LABELS[company.size] || company.size}
          </button>
        )}
      </div>

      <h3 className="text-base font-semibold text-gray-900">{company.name}</h3>
      {company.industry && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFilterIndustry(company.industry!); }}
          className="text-sm text-gray-500 mt-0.5 hover:text-emerald-700 transition-colors cursor-pointer text-left"
          title={`Filter by ${company.industry}`}
        >
          {company.industry}
        </button>
      )}
      {company.domain && (
        <p className="text-sm text-indigo-600 mt-1">{company.domain}</p>
      )}

      {company.description && (
        <p className="text-sm text-gray-500 mt-2 line-clamp-2">
          {company.description}
        </p>
      )}

      {/* Counts */}
      {company._count && (
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
            </svg>
            {company._count.contacts} contact{company._count.contacts !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75" />
            </svg>
            {company._count.deals} deal{company._count.deals !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 text-xs text-gray-400">
        {company.website && (
          <span className="truncate">{company.website}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <ScoreTrendSparkline companyId={company.id} width={64} height={20} days={7} />
          {new Date(company.createdAt).toLocaleDateString()}
        </span>
      </div>
    </>
  );

  const baseClasses =
    'relative block bg-white rounded-xl shadow-sm border border-gray-200 p-5 transition-all';
  const selectedClasses = selected ? ' ring-2 ring-indigo-500' : '';
  const compareClasses = compareSelected && !selectMode ? ' ring-2 ring-indigo-400 bg-indigo-50/20' : '';

  if (selectMode) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleSelect();
          }
        }}
        className={`${baseClasses}${selectedClasses} cursor-pointer hover:shadow-md ${
          selected ? 'bg-indigo-50/30' : ''
        }`}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <Link
      to={`/companies/${company.id}`}
      className={`${baseClasses}${compareClasses} hover:shadow-md`}
    >
      {cardContent}
    </Link>
  );
}

function CreateCompanyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    domain: '',
    industry: '',
    size: '',
    website: '',
    description: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/companies', {
        name: form.name,
        domain: form.domain || undefined,
        industry: form.industry || undefined,
        size: form.size || undefined,
        website: form.website || undefined,
        description: form.description || undefined,
      });
      onCreated();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || 'Failed to create company';
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
          <h2 className="text-lg font-semibold text-gray-900">New Company</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Acme Corp"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <input
              type="text"
              value={form.domain}
              onChange={(e) => setForm({ ...form, domain: e.target.value })}
              placeholder="example.com"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry</label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    placeholder="e.g. Developer Tools"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                  <select
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  >
                    <option value="">Select size</option>
                    <option value="STARTUP">Startup</option>
                    <option value="SMALL">Small</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LARGE">Large</option>
                    <option value="ENTERPRISE">Enterprise</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
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
              {saving ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
