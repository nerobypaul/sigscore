import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { Activity, ActivityType, ActivityStatus, ActivityPriority, Pagination } from '../types';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';

const TYPE_COLORS: Record<string, string> = {
  TASK: 'bg-blue-100 text-blue-700',
  CALL: 'bg-green-100 text-green-700',
  MEETING: 'bg-purple-100 text-purple-700',
  EMAIL: 'bg-yellow-100 text-yellow-700',
  NOTE: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-gray-50 text-gray-500 border-gray-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-400',
  MEDIUM: 'text-yellow-500',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-500',
};

export default function Activities() {
  const toast = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/activities', {
        params: {
          type: filterType || undefined,
          status: filterStatus || undefined,
          page,
          limit: 20,
        },
      });
      setActivities(data.activities || []);
      setPagination(data.pagination || null);
    } catch {
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterStatus]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
          <p className="mt-1 text-sm text-gray-500">
            {pagination ? `${pagination.total} total activities` : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          Add Activity
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          <option value="">All types</option>
          <option value="TASK">Task</option>
          <option value="CALL">Call</option>
          <option value="MEETING">Meeting</option>
          <option value="EMAIL">Email</option>
          <option value="NOTE">Note</option>
        </select>

        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Activities list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : activities.length === 0 ? (
          (filterType || filterStatus) ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No activities match your filters
            </div>
          ) : (
            <EmptyState
              icon={
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
              }
              title="No activities yet"
              description="Keep track of tasks, calls, meetings, and notes by creating your first activity."
              actionLabel="Add Activity"
              onAction={() => setShowCreate(true)}
            />
          )
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} onUpdate={fetchActivities} />
            ))}
          </div>
        )}

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
      </div>

      {showCreate && (
        <CreateActivityModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchActivities();
            toast.success('Activity created successfully');
          }}
        />
      )}
    </div>
  );
}

function ActivityRow({
  activity,
  onUpdate,
}: {
  activity: Activity;
  onUpdate: () => void;
}) {
  const toast = useToast();

  const handleToggleComplete = async () => {
    const newStatus = activity.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      await api.put(`/activities/${activity.id}`, {
        status: newStatus,
        completedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : undefined,
      });
      onUpdate();
      toast.success(
        newStatus === 'COMPLETED' ? 'Activity marked as completed' : 'Activity reopened'
      );
    } catch {
      toast.error('Failed to update activity');
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors">
      {/* Complete toggle */}
      <button
        onClick={handleToggleComplete}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          activity.status === 'COMPLETED'
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-indigo-400'
        }`}
      >
        {activity.status === 'COMPLETED' && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Type badge */}
      <span
        className={`text-xs font-medium px-2 py-1 rounded-md flex-shrink-0 ${
          TYPE_COLORS[activity.type] || TYPE_COLORS.NOTE
        }`}
      >
        {activity.type}
      </span>

      {/* Title and description */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${
            activity.status === 'COMPLETED' ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
        >
          {activity.title}
        </p>
        {activity.description && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{activity.description}</p>
        )}
      </div>

      {/* Priority */}
      <span className={`text-xs font-medium flex-shrink-0 ${PRIORITY_COLORS[activity.priority]}`}>
        {activity.priority}
      </span>

      {/* Status */}
      <span
        className={`text-xs font-medium px-2 py-1 rounded-md border flex-shrink-0 ${
          STATUS_COLORS[activity.status] || STATUS_COLORS.PENDING
        }`}
      >
        {activity.status.replace('_', ' ')}
      </span>

      {/* Date */}
      <span className="text-xs text-gray-400 flex-shrink-0 w-20 text-right">
        {activity.dueDate
          ? new Date(activity.dueDate).toLocaleDateString()
          : new Date(activity.createdAt).toLocaleDateString()}
      </span>
    </div>
  );
}

function CreateActivityModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    type: 'TASK' as ActivityType,
    title: '',
    description: '',
    status: 'PENDING' as ActivityStatus,
    priority: 'MEDIUM' as ActivityPriority,
    dueDate: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.post('/activities', {
        type: form.type,
        title: form.title,
        description: form.description || undefined,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      });
      onCreated();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const msg = axiosErr.response?.data?.error || 'Failed to create activity';
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
          <h2 className="text-lg font-semibold text-gray-900">New Activity</h2>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ActivityType })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="TASK">Task</option>
                <option value="CALL">Call</option>
                <option value="MEETING">Meeting</option>
                <option value="EMAIL">Email</option>
                <option value="NOTE">Note</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as ActivityPriority })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ActivityStatus })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
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
              {saving ? 'Creating...' : 'Create Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
