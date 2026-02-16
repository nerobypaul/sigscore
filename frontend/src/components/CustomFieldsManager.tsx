import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from './Toast';
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
  createdAt: string;
  updatedAt: string;
}

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'select';

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  boolean: 'Toggle (Yes/No)',
  date: 'Date',
  select: 'Dropdown',
};

const ENTITY_TYPES = ['contact', 'company'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomFieldsManager() {
  const toast = useToast();
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState<'contact' | 'company'>('contact');

  // Add form state
  const [showForm, setShowForm] = useState(false);
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formFieldName, setFormFieldName] = useState('');
  const [formFieldType, setFormFieldType] = useState<FieldType>('text');
  const [formOptions, setFormOptions] = useState('');
  const [formRequired, setFormRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editFieldType, setEditFieldType] = useState<FieldType>('text');
  const [editOptions, setEditOptions] = useState('');
  const [editRequired, setEditRequired] = useState(false);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/custom-fields', {
        params: { entityType: entityFilter },
      });
      setFields(data.fields || []);
    } catch {
      toast.error('Failed to load custom fields');
    } finally {
      setLoading(false);
    }
  }, [entityFilter, toast]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  // Auto-generate fieldName from displayName
  useEffect(() => {
    if (!editingId) {
      setFormFieldName(slugify(formDisplayName));
    }
  }, [formDisplayName, editingId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFieldName || !formDisplayName) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        entityType: entityFilter,
        fieldName: formFieldName,
        displayName: formDisplayName,
        fieldType: formFieldType,
        required: formRequired,
        sortOrder: fields.length,
      };

      if (formFieldType === 'select') {
        const opts = formOptions
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        if (opts.length === 0) {
          toast.error('Select fields require at least one option');
          setSaving(false);
          return;
        }
        payload.options = opts;
      }

      await api.post('/custom-fields', payload);
      toast.success('Custom field created');
      resetForm();
      fetchFields();
    } catch (err) {
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(typeof message === 'string' ? message : 'Failed to create custom field');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        displayName: editDisplayName,
        fieldType: editFieldType,
        required: editRequired,
      };

      if (editFieldType === 'select') {
        const opts = editOptions
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
        if (opts.length === 0) {
          toast.error('Select fields require at least one option');
          setSaving(false);
          return;
        }
        payload.options = opts;
      } else {
        payload.options = null;
      }

      await api.put(`/custom-fields/${id}`, payload);
      toast.success('Custom field updated');
      setEditingId(null);
      fetchFields();
    } catch {
      toast.error('Failed to update custom field');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete custom field "${name}"? This will not remove stored values from entities.`)) return;
    try {
      await api.delete(`/custom-fields/${id}`);
      toast.success('Custom field deleted');
      fetchFields();
    } catch {
      toast.error('Failed to delete custom field');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const field = fields[index];
    const prev = fields[index - 1];
    try {
      await Promise.all([
        api.put(`/custom-fields/${field.id}`, { sortOrder: prev.sortOrder }),
        api.put(`/custom-fields/${prev.id}`, { sortOrder: field.sortOrder }),
      ]);
      fetchFields();
    } catch {
      toast.error('Failed to reorder fields');
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index >= fields.length - 1) return;
    const field = fields[index];
    const next = fields[index + 1];
    try {
      await Promise.all([
        api.put(`/custom-fields/${field.id}`, { sortOrder: next.sortOrder }),
        api.put(`/custom-fields/${next.id}`, { sortOrder: field.sortOrder }),
      ]);
      fetchFields();
    } catch {
      toast.error('Failed to reorder fields');
    }
  };

  const startEdit = (field: CustomFieldDefinition) => {
    setEditingId(field.id);
    setEditDisplayName(field.displayName);
    setEditFieldType(field.fieldType as FieldType);
    setEditOptions(Array.isArray(field.options) ? field.options.join(', ') : '');
    setEditRequired(field.required);
  };

  const resetForm = () => {
    setShowForm(false);
    setFormDisplayName('');
    setFormFieldName('');
    setFormFieldType('text');
    setFormOptions('');
    setFormRequired(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Custom Fields</h2>
        <p className="text-sm text-gray-500 mt-1">
          Define custom fields that appear on contacts and companies across your organization.
        </p>
      </div>

      {/* Entity type toggle */}
      <div className="flex items-center gap-2">
        {ENTITY_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setEntityFilter(type)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              entityFilter === type
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {type === 'contact' ? 'Contacts' : 'Companies'}
          </button>
        ))}
      </div>

      {/* Field list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : fields.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-500">
            No custom fields defined for {entityFilter === 'contact' ? 'contacts' : 'companies'} yet.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {fields.map((field, index) =>
            editingId === field.id ? (
              <div key={field.id} className="p-4 bg-indigo-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Field Type
                    </label>
                    <select
                      value={editFieldType}
                      onChange={(e) => setEditFieldType(e.target.value as FieldType)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editFieldType === 'select' && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Options (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={editOptions}
                        onChange={(e) => setEditOptions(e.target.value)}
                        placeholder="Option 1, Option 2, Option 3"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  )}
                  <div className="sm:col-span-2 flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={editRequired}
                        onChange={(e) => setEditRequired(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Required
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => handleUpdate(field.id)}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={field.id} className="p-4 flex items-center gap-4">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move up"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleMoveDown(index)}
                    disabled={index >= fields.length - 1}
                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    title="Move down"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>

                {/* Field info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{field.displayName}</span>
                    {field.required && (
                      <span className="text-xs font-medium text-red-600">Required</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 font-mono">{field.fieldName}</span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {FIELD_TYPE_LABELS[field.fieldType as FieldType] || field.fieldType}
                    </span>
                    {field.fieldType === 'select' && field.options && (
                      <>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-gray-500">
                          {(field.options as string[]).length} options
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(field)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(field.id, field.displayName)}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Add field button / form */}
      {showForm ? (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Add Custom Field</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
              <input
                type="text"
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder="e.g. Favorite Color"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Internal Key
              </label>
              <input
                type="text"
                value={formFieldName}
                onChange={(e) => setFormFieldName(e.target.value)}
                placeholder="e.g. favorite_color"
                required
                pattern="^[a-z][a-z0-9_]*$"
                title="Lowercase letters, numbers, and underscores only. Must start with a letter."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-400 mt-1">Auto-generated from display name</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Field Type</label>
              <select
                value={formFieldType}
                onChange={(e) => setFormFieldType(e.target.value as FieldType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {formFieldType === 'select' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Options (comma-separated)
                </label>
                <input
                  type="text"
                  value={formOptions}
                  onChange={(e) => setFormOptions(e.target.value)}
                  placeholder="Option 1, Option 2, Option 3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={formRequired}
                  onChange={(e) => setFormRequired(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Required field
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !formFieldName || !formDisplayName}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating...' : 'Create Field'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Custom Field
        </button>
      )}
    </div>
  );
}
