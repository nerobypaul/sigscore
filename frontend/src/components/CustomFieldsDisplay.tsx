import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomFieldDefinition {
  id: string;
  entityType: string;
  fieldName: string;
  displayName: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
}

interface CustomFieldsDisplayProps {
  entityType: 'contact' | 'company';
  entityId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomFieldsDisplay({ entityType, entityId }: CustomFieldsDisplayProps) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [error, setError] = useState('');
  const saveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [defsRes, valsRes] = await Promise.all([
        api.get('/custom-fields', { params: { entityType } }),
        api.get(`/custom-fields/values/${entityType}/${entityId}`),
      ]);
      setDefinitions(defsRes.data.fields || []);
      setValues(valsRes.data.values || {});
    } catch {
      setError('Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = saveTimeoutRef.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  const saveValue = useCallback(
    async (fieldName: string, value: unknown) => {
      setSavingField(fieldName);
      try {
        const { data } = await api.put(
          `/custom-fields/values/${entityType}/${entityId}`,
          { values: { [fieldName]: value } },
        );
        setValues(data.values || {});
      } catch {
        // Silently fail - the field will retain its local state
      } finally {
        setSavingField(null);
      }
    },
    [entityType, entityId],
  );

  const handleChange = useCallback(
    (fieldName: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [fieldName]: value }));

      // Debounced auto-save for text/number fields
      if (saveTimeoutRef.current[fieldName]) {
        clearTimeout(saveTimeoutRef.current[fieldName]);
      }
      saveTimeoutRef.current[fieldName] = setTimeout(() => {
        saveValue(fieldName, value);
      }, 800);
    },
    [saveValue],
  );

  const handleBlur = useCallback(
    (fieldName: string) => {
      // Save immediately on blur
      if (saveTimeoutRef.current[fieldName]) {
        clearTimeout(saveTimeoutRef.current[fieldName]);
        delete saveTimeoutRef.current[fieldName];
      }
      saveValue(fieldName, values[fieldName] ?? null);
    },
    [saveValue, values],
  );

  const handleImmediateChange = useCallback(
    (fieldName: string, value: unknown) => {
      setValues((prev) => ({ ...prev, [fieldName]: value }));
      saveValue(fieldName, value);
    },
    [saveValue],
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Fields</h2>
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  if (error) {
    return null; // Silently hide if there's an error
  }

  if (definitions.length === 0) {
    return null; // Don't show section if no custom fields defined
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Fields</h2>
      <div className="space-y-4">
        {definitions.map((def) => (
          <FieldRenderer
            key={def.id}
            definition={def}
            value={values[def.fieldName]}
            saving={savingField === def.fieldName}
            onChange={handleChange}
            onBlur={handleBlur}
            onImmediateChange={handleImmediateChange}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field Renderer
// ---------------------------------------------------------------------------

interface FieldRendererProps {
  definition: CustomFieldDefinition;
  value: unknown;
  saving: boolean;
  onChange: (fieldName: string, value: unknown) => void;
  onBlur: (fieldName: string) => void;
  onImmediateChange: (fieldName: string, value: unknown) => void;
}

function FieldRenderer({ definition, value, saving, onChange, onBlur, onImmediateChange }: FieldRendererProps) {
  const { fieldName, displayName, fieldType, options, required } = definition;

  const labelEl = (
    <label className="block text-xs font-medium text-gray-500 mb-1">
      {displayName}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {saving && (
        <span className="ml-2 text-xs text-indigo-500 font-normal">Saving...</span>
      )}
    </label>
  );

  switch (fieldType) {
    case 'text':
      return (
        <div>
          {labelEl}
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(fieldName, e.target.value)}
            onBlur={() => onBlur(fieldName)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            placeholder={`Enter ${displayName.toLowerCase()}`}
          />
        </div>
      );

    case 'number':
      return (
        <div>
          {labelEl}
          <input
            type="number"
            value={value !== null && value !== undefined ? String(value) : ''}
            onChange={(e) =>
              onChange(fieldName, e.target.value === '' ? null : Number(e.target.value))
            }
            onBlur={() => onBlur(fieldName)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            placeholder={`Enter ${displayName.toLowerCase()}`}
          />
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-medium text-gray-500">
            {displayName}
            {required && <span className="text-red-500 ml-0.5">*</span>}
            {saving && (
              <span className="ml-2 text-xs text-indigo-500 font-normal">Saving...</span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(value)}
            onClick={() => onImmediateChange(fieldName, !value)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              value ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                value ? 'translate-x-4.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      );

    case 'date':
      return (
        <div>
          {labelEl}
          <input
            type="date"
            value={typeof value === 'string' ? value.split('T')[0] : ''}
            onChange={(e) => onImmediateChange(fieldName, e.target.value || null)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>
      );

    case 'select':
      return (
        <div>
          {labelEl}
          <select
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onImmediateChange(fieldName, e.target.value || null)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          >
            <option value="">-- Select --</option>
            {Array.isArray(options) &&
              options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
          </select>
        </div>
      );

    default:
      return (
        <div>
          {labelEl}
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(fieldName, e.target.value)}
            onBlur={() => onBlur(fieldName)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
          />
        </div>
      );
  }
}
