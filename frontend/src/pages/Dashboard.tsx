import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import type { Contact, Deal, Activity } from '../types';
import { STAGE_LABELS, STAGE_COLORS } from '../types';
import Spinner from '../components/Spinner';
import GettingStarted from '../components/GettingStarted';

interface DashboardStats {
  contacts: { total: number; recent: Contact[] };
  companies: { total: number };
  deals: { total: number; totalValue: number; byStage: Record<string, number> };
  activities: { total: number; recent: Activity[] };
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [contactsRes, companiesRes, dealsRes, activitiesRes] = await Promise.all([
          api.get('/contacts', { params: { limit: 5 } }),
          api.get('/companies', { params: { limit: 1 } }),
          api.get('/deals', { params: { limit: 100 } }),
          api.get('/activities', { params: { limit: 5 } }),
        ]);

        const deals: Deal[] = dealsRes.data.deals || [];
        const totalValue = deals.reduce((sum: number, d: Deal) => sum + (d.amount || 0), 0);
        const byStage: Record<string, number> = {};
        deals.forEach((d: Deal) => {
          byStage[d.stage] = (byStage[d.stage] || 0) + 1;
        });

        setStats({
          contacts: {
            total: contactsRes.data.pagination?.total ?? 0,
            recent: contactsRes.data.contacts || [],
          },
          companies: {
            total: companiesRes.data.pagination?.total ?? 0,
          },
          deals: {
            total: dealsRes.data.pagination?.total ?? 0,
            totalValue,
            byStage,
          },
          activities: {
            total: activitiesRes.data.pagination?.total ?? 0,
            recent: activitiesRes.data.activities || [],
          },
        });
      } catch {
        // If API fails (e.g. no org), show empty state
        setStats({
          contacts: { total: 0, recent: [] },
          companies: { total: 0 },
          deals: { total: 0, totalValue: 0, byStage: {} },
          activities: { total: 0, recent: [] },
        });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      label: 'Total Contacts',
      value: stats.contacts.total,
      href: '/contacts',
      color: 'bg-blue-500',
    },
    {
      label: 'Companies',
      value: stats.companies.total,
      href: '/companies',
      color: 'bg-emerald-500',
    },
    {
      label: 'Open Deals',
      value: stats.deals.total,
      href: '/deals',
      color: 'bg-purple-500',
    },
    {
      label: 'Pipeline Value',
      value: `$${stats.deals.totalValue.toLocaleString()}`,
      href: '/deals',
      color: 'bg-amber-500',
    },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Getting Started checklist for new users */}
      <GettingStarted />

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your CRM data</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <Link
            key={card.label}
            to={card.href}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}>
                <span className="text-white text-lg font-bold">
                  {typeof card.value === 'number' ? '#' : '$'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deal pipeline summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Deal Pipeline</h2>
            <Link to="/deals" className="text-sm text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {Object.keys(stats.deals.byStage).length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No deals yet</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.deals.byStage).map(([stage, count]) => {
                const stageKey = stage as keyof typeof STAGE_LABELS;
                return (
                  <div key={stage} className="flex items-center justify-between">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        STAGE_COLORS[stageKey] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {STAGE_LABELS[stageKey] || stage}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent contacts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Contacts</h2>
            <Link to="/contacts" className="text-sm text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {stats.contacts.recent.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No contacts yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats.contacts.recent.map((contact) => (
                <Link
                  key={contact.id}
                  to={`/contacts/${contact.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
                    {contact.firstName?.[0]}
                    {contact.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {contact.firstName} {contact.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{contact.email || contact.title || ''}</p>
                  </div>
                  {contact.company && (
                    <span className="text-xs text-gray-400">{contact.company.name}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent activities */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Activities</h2>
            <Link to="/activities" className="text-sm text-indigo-600 hover:text-indigo-500">
              View all
            </Link>
          </div>
          {stats.activities.recent.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No activities yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {stats.activities.recent.map((activity) => (
                <div key={activity.id} className="flex items-center gap-4 py-3">
                  <ActivityTypeBadge type={activity.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{activity.title}</p>
                    <p className="text-xs text-gray-500">
                      {activity.status} &middot; {activity.priority} priority
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(activity.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    TASK: 'bg-blue-100 text-blue-700',
    CALL: 'bg-green-100 text-green-700',
    MEETING: 'bg-purple-100 text-purple-700',
    EMAIL: 'bg-yellow-100 text-yellow-700',
    NOTE: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-md ${colors[type] || colors.NOTE}`}>
      {type}
    </span>
  );
}
