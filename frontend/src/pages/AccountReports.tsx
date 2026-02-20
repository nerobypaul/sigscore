import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportCompany {
  id: string;
  name: string;
  domain: string | null;
  logo: string | null;
}

interface ReportCreator {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface AccountReport {
  id: string;
  organizationId: string;
  companyId: string;
  company: ReportCompany;
  createdBy: ReportCreator;
  shareToken: string;
  title: string;
  isPublic: boolean;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CompanyOption {
  id: string;
  name: string;
  domain: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AccountReports() {
  useEffect(() => { document.title = 'Account Reports — DevSignal'; }, []);
  const toast = useToast();

  const [reports, setReports] = useState<AccountReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [generating, setGenerating] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/account-reports');
      setReports(data.reports);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load reports';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      setCompaniesLoading(true);
      const { data } = await api.get('/companies?limit=200');
      const list = data.companies ?? [];
      setCompanies(
        list.map((c: { id: string; name: string; domain?: string | null }) => ({
          id: c.id,
          name: c.name,
          domain: c.domain ?? null,
        }))
      );
    } catch {
      // silent
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const openGenerateModal = () => {
    setSelectedCompanyId('');
    setReportTitle('');
    setShowGenerateModal(true);
    fetchCompanies();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    setGenerating(true);
    try {
      await api.post('/account-reports', {
        companyId: selectedCompanyId,
        title: reportTitle || undefined,
      });
      toast.success('Report generated successfully');
      setShowGenerateModal(false);
      fetchReports();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate report';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/account-reports/${id}`);
      toast.success('Report deleted');
      setDeleteId(null);
      fetchReports();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete report';
      toast.error(msg);
    }
  };

  const handleTogglePublic = async (report: AccountReport) => {
    try {
      await api.put(`/account-reports/${report.id}`, { isPublic: !report.isPublic });
      setReports((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, isPublic: !r.isPublic } : r))
      );
      toast.success(report.isPublic ? 'Report set to private' : 'Report set to public');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update report';
      toast.error(msg);
    }
  };

  const copyShareUrl = (shareToken: string) => {
    const url = `${window.location.origin}/shared/${shareToken}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Share URL copied to clipboard'),
      () => toast.error('Failed to copy URL')
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate shareable account intelligence reports for sales handoffs and prospect meetings
          </p>
        </div>
        <button
          onClick={openGenerateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Generate Report
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading reports...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">{error}</div>
      ) : reports.length === 0 ? (
        <EmptyState onGenerate={openGenerateModal} />
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Report
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Views
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Public
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                      {report.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      by {report.createdBy.firstName} {report.createdBy.lastName}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {report.company.logo ? (
                        <img
                          src={report.company.logo}
                          alt=""
                          className="w-6 h-6 rounded"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                          {report.company.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {report.company.name}
                        </div>
                        {report.company.domain && (
                          <div className="text-xs text-gray-400">{report.company.domain}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(report.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {report.viewCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleTogglePublic(report)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        report.isPublic ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                      title={report.isPublic ? 'Click to make private' : 'Click to make public'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          report.isPublic ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => copyShareUrl(report.shareToken)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 transition-colors"
                        title="Copy share URL"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.06a4.5 4.5 0 00-6.364-6.364L4.5 8.25l4.5 4.5" />
                        </svg>
                        Copy Link
                      </button>
                      <button
                        onClick={() => setDeleteId(report.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Generate Report Modal */}
      {showGenerateModal && (
        <Modal onClose={() => setShowGenerateModal(false)}>
          <form onSubmit={handleGenerate}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Generate Account Report</h2>
              <p className="text-sm text-gray-500 mt-1">
                Select a company to generate a shareable intelligence snapshot
              </p>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Company selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                {companiesLoading ? (
                  <div className="text-sm text-gray-400 py-2">Loading companies...</div>
                ) : (
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Select a company...</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.domain ? ` (${c.domain})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Auto-generated if left blank"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={generating || !selectedCompanyId}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? 'Generating...' : 'Generate Report'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <Modal onClose={() => setDeleteId(null)}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Report</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to delete this report? The shared link will stop working.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="text-center py-16">
      <svg
        className="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">No reports yet</h3>
      <p className="mt-1 text-sm text-gray-500">
        Generate your first account report to share with your team or prospects.
      </p>
      <button
        onClick={onGenerate}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Generate Report
      </button>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {children}
      </div>
    </div>
  );
}
