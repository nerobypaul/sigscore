import { useEffect, useState, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useToast } from '../components/Toast';
import Spinner from '../components/Spinner';

// --- Types ---

type WidgetType =
  | 'total_contacts' | 'total_companies' | 'total_deals' | 'total_signals_today'
  | 'hot_accounts' | 'recent_signals' | 'top_companies_by_signals'
  | 'signal_trend' | 'deal_pipeline' | 'signals_by_source';

interface Widget {
  id: string;
  type: WidgetType;
}

interface DashboardData {
  id: string;
  name: string;
  layout: Widget[];
  createdAt: string;
  updatedAt: string;
}

interface WidgetData {
  value?: number;
  label?: string;
  trend?: number;
  rows?: Array<Record<string, unknown>>;
  points?: Array<{ date: string; value: number }>;
  bars?: Array<{ label: string; value: number }>;
}

const WIDGET_CATALOG: { type: WidgetType; label: string; description: string; category: 'stat' | 'list' | 'chart' }[] = [
  { type: 'total_contacts', label: 'Total Contacts', description: 'Count of all contacts', category: 'stat' },
  { type: 'total_companies', label: 'Total Companies', description: 'Count of all companies', category: 'stat' },
  { type: 'total_deals', label: 'Total Deals', description: 'Count of open deals', category: 'stat' },
  { type: 'total_signals_today', label: 'Signals Today', description: 'Signals received today', category: 'stat' },
  { type: 'hot_accounts', label: 'Hot Accounts', description: 'Top accounts by PQA score', category: 'list' },
  { type: 'recent_signals', label: 'Recent Signals', description: 'Latest signal activity', category: 'list' },
  { type: 'top_companies_by_signals', label: 'Top Companies', description: 'Companies ranked by signal count', category: 'list' },
  { type: 'signal_trend', label: 'Signal Trend', description: 'Signal volume over last 30 days', category: 'chart' },
  { type: 'deal_pipeline', label: 'Deal Pipeline', description: 'Deals by stage', category: 'chart' },
  { type: 'signals_by_source', label: 'Signals by Source', description: 'Signal count per source type', category: 'chart' },
];

const DEFAULT_LAYOUT: Widget[] = [
  { id: 'w1', type: 'total_contacts' },
  { id: 'w2', type: 'total_companies' },
  { id: 'w3', type: 'total_deals' },
  { id: 'w4', type: 'signal_trend' },
  { id: 'w5', type: 'hot_accounts' },
  { id: 'w6', type: 'deal_pipeline' },
];

let widgetIdCounter = 100;
function nextWidgetId(): string {
  widgetIdCounter += 1;
  return `w_${Date.now()}_${widgetIdCounter}`;
}

export default function DashboardBuilder() {
  useEffect(() => { document.title = 'Dashboard Builder — DevSignal'; }, []);
  const toast = useToast();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgetDataMap, setWidgetDataMap] = useState<Record<string, WidgetData>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load or create dashboard
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/dashboards');
        const dashboards = data.dashboards || data || [];
        if (dashboards.length > 0) {
          setDashboard(dashboards[0]);
        } else {
          const { data: created } = await api.post('/dashboards', {
            name: 'My Dashboard',
            layout: DEFAULT_LAYOUT,
          });
          setDashboard(created.dashboard || created);
        }
      } catch {
        setDashboard({ id: 'local', name: 'My Dashboard', layout: DEFAULT_LAYOUT, createdAt: '', updatedAt: '' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch widget data when layout changes
  useEffect(() => {
    if (!dashboard) return;
    const types = new Set(dashboard.layout.map((w) => w.type));
    types.forEach(async (type) => {
      if (widgetDataMap[type]) return;
      try {
        const { data } = await api.get(`/dashboards/widgets/${type}`);
        setWidgetDataMap((prev) => ({ ...prev, [type]: data.data || data }));
      } catch {
        setWidgetDataMap((prev) => ({ ...prev, [type]: {} }));
      }
    });
  }, [dashboard, widgetDataMap]);

  // Debounced auto-save
  const autoSave = useCallback((updated: DashboardData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (updated.id === 'local') return;
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.put(`/dashboards/${updated.id}`, { layout: updated.layout });
      } catch {
        // Silent fail on autosave
      }
    }, 2000);
  }, []);

  const addWidget = (type: WidgetType) => {
    if (!dashboard) return;
    const widget: Widget = { id: nextWidgetId(), type };
    const updated = { ...dashboard, layout: [...dashboard.layout, widget] };
    setDashboard(updated);
    autoSave(updated);
    setShowAddModal(false);
    toast.success('Widget added.');
  };

  const removeWidget = (widgetId: string) => {
    if (!dashboard) return;
    const updated = { ...dashboard, layout: dashboard.layout.filter((w) => w.id !== widgetId) };
    setDashboard(updated);
    autoSave(updated);
  };

  const saveName = async () => {
    if (!dashboard || !nameValue.trim()) return;
    try {
      if (dashboard.id !== 'local') {
        await api.put(`/dashboards/${dashboard.id}`, { name: nameValue.trim() });
      }
      setDashboard({ ...dashboard, name: nameValue.trim() });
      setEditingName(false);
      toast.success('Dashboard renamed.');
    } catch {
      toast.error('Failed to rename.');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;
  }

  if (!dashboard) return null;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                className="text-2xl font-bold text-gray-900 border-b-2 border-indigo-500 outline-none bg-transparent"
              />
              <button onClick={saveName} className="text-sm text-indigo-600 hover:text-indigo-700">Save</button>
            </div>
          ) : (
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
              onClick={() => { setEditingName(true); setNameValue(dashboard.name); }}
              title="Click to rename"
            >
              {dashboard.name}
            </h1>
          )}
          <p className="mt-1 text-sm text-gray-500">Drag, add, or remove widgets to customize</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Widget
        </button>
      </div>

      {/* Widget grid */}
      {dashboard.layout.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          No widgets. Click "Add Widget" to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboard.layout.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              data={widgetDataMap[widget.type]}
              onRemove={() => removeWidget(widget.id)}
            />
          ))}
        </div>
      )}

      {/* Add Widget Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Widget</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {WIDGET_CATALOG.map((item) => (
                <button
                  key={item.type}
                  onClick={() => addWidget(item.type)}
                  className="text-left border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                      item.category === 'stat' ? 'bg-blue-500' : item.category === 'list' ? 'bg-purple-500' : 'bg-emerald-500'
                    }`}>
                      {item.category === 'stat' ? '#' : item.category === 'list' ? 'L' : 'C'}
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-11">{item.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Widget renderer ---

function WidgetCard({ widget, data, onRemove }: { widget: Widget; data?: WidgetData; onRemove: () => void }) {
  const meta = WIDGET_CATALOG.find((c) => c.type === widget.type);
  const label = meta?.label || widget.type;
  const category = meta?.category || 'stat';

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 relative group ${
      category === 'chart' || category === 'list' ? 'md:col-span-1 lg:col-span-1' : ''
    }`}>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove widget"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{label}</h3>

      {!data ? (
        <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
      ) : category === 'stat' ? (
        <StatContent data={data} />
      ) : category === 'list' ? (
        <ListContent data={data} />
      ) : (
        <ChartContent type={widget.type} data={data} />
      )}
    </div>
  );
}

function StatContent({ data }: { data: WidgetData }) {
  return (
    <div>
      <p className="text-3xl font-bold text-gray-900">{typeof data.value === 'number' ? data.value.toLocaleString() : '--'}</p>
      {data.trend !== undefined && data.trend !== 0 && (
        <p className={`text-sm mt-1 font-medium ${data.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {data.trend > 0 ? '+' : ''}{data.trend}%
        </p>
      )}
    </div>
  );
}

function ListContent({ data }: { data: WidgetData }) {
  const rows = data.rows || [];
  if (rows.length === 0) return <p className="text-sm text-gray-400">No data</p>;

  return (
    <div className="divide-y divide-gray-100 -mx-1">
      {rows.slice(0, 5).map((row, i) => {
        const cols = Object.values(row).map(String);
        return (
          <div key={i} className="flex items-center justify-between py-2 px-1">
            <span className="text-sm text-gray-900 truncate">{cols[0] || '--'}</span>
            <span className="text-sm text-gray-500 flex-shrink-0 ml-3">{cols[1] || ''}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChartContent({ type, data }: { type: WidgetType; data: WidgetData }) {
  if (type === 'signal_trend') {
    return <LineChart points={data.points || []} />;
  }
  return <BarChart bars={data.bars || []} />;
}

// --- Simple SVG line chart ---

function LineChart({ points }: { points: Array<{ date: string; value: number }> }) {
  if (points.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">No data</p>;

  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const w = 280;
  const h = 120;
  const padX = 0;
  const padY = 4;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * innerW;
    const y = padY + innerH - (p.value / maxVal) * innerH;
    return `${x},${y}`;
  });

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padY + innerH * (1 - frac);
        return <line key={frac} x1={padX} y1={y} x2={w - padX} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />;
      })}
      {/* Line */}
      <polyline fill="none" stroke="#6366f1" strokeWidth={2} points={coords.join(' ')} strokeLinejoin="round" strokeLinecap="round" />
      {/* Area fill */}
      <polygon
        fill="url(#grad)"
        opacity={0.15}
        points={`${padX},${padY + innerH} ${coords.join(' ')} ${padX + innerW},${padY + innerH}`}
      />
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  );
}

// --- Simple horizontal bar chart ---

function BarChart({ bars }: { bars: Array<{ label: string; value: number }> }) {
  if (bars.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">No data</p>;

  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-red-400', 'bg-teal-500'];

  return (
    <div className="space-y-2">
      {bars.slice(0, 8).map((bar, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-24 truncate flex-shrink-0">{bar.label}</span>
          <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${colors[i % colors.length]}`} style={{ width: `${(bar.value / maxVal) * 100}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-600 w-8 text-right">{bar.value}</span>
        </div>
      ))}
    </div>
  );
}
