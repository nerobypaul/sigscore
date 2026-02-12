import { useState, useRef, useCallback } from 'react';
import api from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

interface CSVImportProps {
  /** "contacts" or "companies" — determines which endpoint to call */
  entityType: 'contacts' | 'companies';
  /** Called when the modal should close */
  onClose: () => void;
  /** Called after a successful import so the parent can refresh its data */
  onImported: () => void;
}

// ---------------------------------------------------------------------------
// Minimal client-side CSV parser for preview purposes only.
// The real parsing happens server-side.
// ---------------------------------------------------------------------------

function previewParseCSV(content: string): { headers: string[]; rows: string[][] } {
  const stripped = content.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < stripped.length && stripped[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(field);
        field = '';
      } else if (ch === '\r') {
        currentRow.push(field);
        field = '';
        rows.push(currentRow);
        currentRow = [];
        if (i + 1 < stripped.length && stripped[i + 1] === '\n') i++;
      } else if (ch === '\n') {
        currentRow.push(field);
        field = '';
        rows.push(currentRow);
        currentRow = [];
      } else {
        field += ch;
      }
    }
  }

  if (field || currentRow.length > 0) {
    currentRow.push(field);
    rows.push(currentRow);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ''));
  return { headers, rows: dataRows };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CSVImport({ entityType, onClose, onImported }: CSVImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);

  // Import state
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Drag state
  const [dragActive, setDragActive] = useState(false);

  const label = entityType === 'contacts' ? 'Contacts' : 'Companies';

  // -----------------------------------------------------------------------
  // File handling
  // -----------------------------------------------------------------------

  const processFile = useCallback((file: File) => {
    setError(null);
    setResult(null);

    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please select a CSV file.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text || text.trim().length === 0) {
        setError('The selected file is empty.');
        return;
      }

      const { headers, rows } = previewParseCSV(text);
      if (headers.length === 0) {
        setError('Could not parse CSV headers. Make sure the file has a header row.');
        return;
      }

      setFileName(file.name);
      setCsvContent(text);
      setPreviewHeaders(headers);
      setPreviewRows(rows.slice(0, 5));
      setTotalRows(rows.length);
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // -----------------------------------------------------------------------
  // Drag and drop
  // -----------------------------------------------------------------------

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // -----------------------------------------------------------------------
  // Import
  // -----------------------------------------------------------------------

  const handleImport = async () => {
    if (!csvContent) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await api.post<ImportResult>(`/import/${entityType}`, { csv: csvContent });
      setResult(data);
      if (data.imported > 0) {
        onImported();
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  const handleReset = () => {
    setFileName(null);
    setCsvContent(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setTotalRows(0);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Import {label} from CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{result.imported}</div>
                  <div className="text-xs text-green-600 mt-1">Imported</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-yellow-700">{result.skipped}</div>
                  <div className="text-xs text-yellow-600 mt-1">Skipped</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-gray-700">{result.total}</div>
                  <div className="text-xs text-gray-500 mt-1">Total rows</div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-red-800 mb-2">
                    Errors ({result.errors.length})
                  </h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {result.errors.map((err, idx) => (
                      <div key={idx} className="text-xs text-red-700">
                        <span className="font-medium">Row {err.row}:</span> {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Drop zone — shown when no file selected yet or after reset */}
          {!csvContent && !result && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
              }`}
            >
              <svg
                className="w-10 h-10 mx-auto text-gray-400 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              <p className="text-sm text-gray-600 font-medium">
                Drag and drop a CSV file here, or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Supports exports from HubSpot, Salesforce, Attio, and spreadsheets. Max 10,000 rows.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Preview */}
          {csvContent && !result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{fileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {totalRows.toLocaleString()} row{totalRows !== 1 ? 's' : ''} detected
                    {totalRows > 10000 && (
                      <span className="text-red-600 font-medium"> (exceeds 10,000 row limit)</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="text-sm text-gray-500 hover:text-gray-700 underline"
                >
                  Choose different file
                </button>
              </div>

              {/* Preview table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {previewHeaders.map((h, idx) => (
                          <th key={idx} className="text-left py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewRows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          {previewHeaders.map((_, cIdx) => (
                            <td key={cIdx} className="py-2 px-3 text-gray-700 whitespace-nowrap max-w-[200px] truncate">
                              {row[cIdx] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalRows > 5 && (
                  <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 text-xs text-gray-500 text-center">
                    Showing first 5 of {totalRows.toLocaleString()} rows
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {result ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csvContent || importing || totalRows > 10000}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing...' : `Import ${label}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
