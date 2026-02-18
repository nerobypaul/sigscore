import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// --- Types ---

type CrmSource = 'hubspot' | 'salesforce';
type EntityKey = 'contacts' | 'companies' | 'deals';

interface DetectionResult {
  format: string;
  entityType: string;
  sampleRows: Record<string, string>[];
  fieldMapping: Record<string, string>;
  totalRows: number;
}

interface FileState {
  file: File;
  detection: DetectionResult | null;
  detecting: boolean;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

const ENTITY_LABELS: Record<EntityKey, string> = {
  contacts: 'Contacts',
  companies: 'Companies',
  deals: 'Deals',
};

export default function CrmImport() {
  useEffect(() => { document.title = 'CRM Import — DevSignal'; }, []);
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<CrmSource | null>(null);
  const [files, setFiles] = useState<Partial<Record<EntityKey, FileState>>>({});
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Partial<Record<EntityKey, ImportResult>>>({});

  // --- Step 1: Choose Source ---

  const selectSource = (s: CrmSource) => {
    setSource(s);
    setStep(2);
  };

  // --- Step 2: Upload Files ---

  const handleFilePick = async (entity: EntityKey, file: File) => {
    setFiles((prev) => ({ ...prev, [entity]: { file, detection: null, detecting: true } }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/import/crm/detect', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFiles((prev) => ({
        ...prev,
        [entity]: { file, detection: data, detecting: false },
      }));
    } catch {
      setFiles((prev) => ({
        ...prev,
        [entity]: { file, detection: null, detecting: false },
      }));
      toast.error(`Failed to detect format for ${entity} file.`);
    }
  };

  const removeFile = (entity: EntityKey) => {
    setFiles((prev) => {
      const next = { ...prev };
      delete next[entity];
      return next;
    });
  };

  const hasAtLeastOneFile = Object.keys(files).length > 0;

  // --- Step 3: Preview & Confirm ---

  const entityEntries = (Object.entries(files) as [EntityKey, FileState][]).filter(
    ([, fs]) => fs.file
  );

  // --- Step 4: Import ---

  const runImport = async () => {
    if (!source) return;
    setImporting(true);
    const importResults: Partial<Record<EntityKey, ImportResult>> = {};

    for (const [entity, fs] of entityEntries) {
      try {
        const formData = new FormData();
        formData.append('file', fs.file);
        const { data } = await api.post(`/import/crm/${entity}?format=${source}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        importResults[entity] = data.result || data;
      } catch {
        importResults[entity] = { created: 0, updated: 0, skipped: 0, errors: ['Import failed'] };
      }
    }

    setResults(importResults);
    setImporting(false);
    setStep(4);
    toast.success('Import complete.');
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">CRM Import</h1>
        <p className="mt-1 text-sm text-gray-500">Migrate data from HubSpot or Salesforce into DevSignal</p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
              step >= s ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {step > s ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : s}
            </div>
            {s < 4 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-indigo-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Choose Source */}
      {step === 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => selectSource('hubspot')}
            className="border-2 border-gray-200 rounded-xl p-6 text-left hover:border-orange-400 hover:bg-orange-50/30 transition-colors group"
          >
            <div className="w-12 h-12 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center mb-4 font-bold text-xl">H</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">HubSpot</h3>
            <p className="text-sm text-gray-500">
              Export from HubSpot: Contacts &gt; Actions &gt; Export, or use Settings &gt; Import & Export.
            </p>
          </button>
          <button
            onClick={() => selectSource('salesforce')}
            className="border-2 border-gray-200 rounded-xl p-6 text-left hover:border-blue-400 hover:bg-blue-50/30 transition-colors group"
          >
            <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-4 font-bold text-xl">S</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Salesforce</h3>
            <p className="text-sm text-gray-500">
              Export from Salesforce: Reports &gt; New Report, or use Data Export service in Setup.
            </p>
          </button>
        </div>
      )}

      {/* Step 2: Upload Files */}
      {step === 2 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload CSV Files</h2>
          <p className="text-sm text-gray-500 mb-6">Upload at least one file. All are optional.</p>

          <div className="space-y-4">
            {(['contacts', 'companies', 'deals'] as EntityKey[]).map((entity) => (
              <FileDropZone
                key={entity}
                label={ENTITY_LABELS[entity]}
                fileState={files[entity] || null}
                onPick={(f) => handleFilePick(entity, f)}
                onRemove={() => removeFile(entity)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => { setStep(1); setSource(null); setFiles({}); }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!hasAtLeastOneFile}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Confirm */}
      {step === 3 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Preview & Confirm</h2>
          <p className="text-sm text-gray-500 mb-6">
            Ready to import:{' '}
            {entityEntries
              .map(([entity, fs]) => `${fs.detection?.totalRows ?? '?'} ${ENTITY_LABELS[entity].toLowerCase()}`)
              .join(', ')}
          </p>

          <div className="space-y-6">
            {entityEntries.map(([entity, fs]) => (
              <div key={entity} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{ENTITY_LABELS[entity]}</h3>
                  <span className="text-xs text-gray-500">{fs.detection?.totalRows ?? '?'} rows</span>
                </div>
                {fs.detection?.sampleRows && fs.detection.sampleRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {Object.keys(fs.detection.sampleRows[0]).map((col) => (
                            <th key={col} className="text-left py-2 px-3 font-semibold text-gray-600">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {fs.detection.sampleRows.slice(0, 3).map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val, j) => (
                              <td key={j} className="py-2 px-3 text-gray-700 truncate max-w-[200px]">{String(val)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-4 px-4">No preview available</p>
                )}

                {/* Field mapping */}
                {fs.detection?.fieldMapping && Object.keys(fs.detection.fieldMapping).length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Field Mapping</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(fs.detection.fieldMapping).map(([src, dest]) => (
                        <span key={src} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {src} &rarr; {dest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={runImport}
              disabled={importing}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {importing && <Spinner size="sm" />}
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === 4 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Import Complete</h2>
          <p className="text-sm text-gray-500 mb-6">Here are the results of your import.</p>

          <div className="space-y-4">
            {(Object.entries(results) as [EntityKey, ImportResult][]).map(([entity, result]) => (
              <div key={entity} className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">{ENTITY_LABELS[entity]}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <ResultStat label="Created" value={result.created} color="text-green-600" />
                  <ResultStat label="Updated" value={result.updated} color="text-blue-600" />
                  <ResultStat label="Skipped" value={result.skipped} color="text-gray-500" />
                  <ResultStat label="Errors" value={result.errors.length} color="text-red-600" />
                </div>
                {result.errors.length > 0 && (
                  <ErrorDetails errors={result.errors} />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-6">
            <Link to="/contacts" className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50">
              View Contacts
            </Link>
            <Link to="/companies" className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50">
              View Companies
            </Link>
            <Link to="/deals" className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50">
              View Deals
            </Link>
            <button
              onClick={() => { setStep(1); setSource(null); setFiles({}); setResults({}); }}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 ml-auto"
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- File Drop Zone ---

function FileDropZone({
  label,
  fileState,
  onPick,
  onRemove,
}: {
  label: string;
  fileState: FileState | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.csv')) onPick(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
  };

  if (fileState) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{label}: {fileState.file.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {fileState.detecting ? (
                <span className="text-xs text-gray-400">Analyzing...</span>
              ) : fileState.detection ? (
                <>
                  <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Auto-detected</span>
                  <span className="text-xs text-gray-500">{fileState.detection.totalRows} rows</span>
                </>
              ) : (
                <span className="text-xs text-yellow-600">Format not detected</span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onRemove} className="text-sm text-red-500 hover:text-red-600 flex-shrink-0 ml-3">Remove</button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
      }`}
    >
      <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={handleChange} />
      <p className="text-sm font-medium text-gray-700">{label} CSV</p>
      <p className="text-xs text-gray-400 mt-1">Drop a file or click to browse</p>
    </div>
  );
}

// --- Result stat ---

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// --- Error details ---

function ErrorDetails({ errors }: { errors: string[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {errors.length} error{errors.length !== 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-2 bg-red-50 border border-red-100 rounded-lg p-3 max-h-40 overflow-y-auto">
          {errors.map((err, i) => (
            <p key={i} className="text-xs text-red-700 py-0.5">{err}</p>
          ))}
        </div>
      )}
    </div>
  );
}
