import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import Spinner from '../components/Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScoringCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  value: string;
}

interface ScoringRule {
  id: string;
  name: string;
  description: string;
  signalType: string;
  weight: number;
  decay: 'none' | '7d' | '14d' | '30d' | '90d';
  conditions: ScoringCondition[];
  enabled: boolean;
}

interface TierThresholds {
  HOT: number;
  WARM: number;
  COLD: number;
}

interface ScoringConfig {
  rules: ScoringRule[];
  tierThresholds: TierThresholds;
  maxScore: number;
}

interface ScorePreviewEntry {
  accountId: string;
  accountName: string;
  domain: string | null;
  currentScore: number;
  currentTier: string;
  projectedScore: number;
  projectedTier: string;
  delta: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNAL_TYPES = [
  { value: '*', label: 'Any Signal' },
  { value: 'npm_download', label: 'npm Download' },
  { value: 'github_star', label: 'GitHub Star' },
  { value: 'github_fork', label: 'GitHub Fork' },
  { value: 'github_issue', label: 'GitHub Issue' },
  { value: 'github_pr', label: 'GitHub PR' },
  { value: 'api_call', label: 'API Call' },
  { value: 'page_view', label: 'Page View' },
  { value: 'signup', label: 'Signup' },
  { value: 'feature_usage', label: 'Feature Usage' },
  { value: 'pypi_download', label: 'PyPI Download' },
  { value: 'docs_view', label: 'Docs View' },
];

const DECAY_OPTIONS = [
  { value: 'none', label: 'No decay' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

const TIER_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-700',
  WARM: 'bg-orange-100 text-orange-700',
  COLD: 'bg-blue-100 text-blue-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ScoringBuilder() {
  useEffect(() => { document.title = 'Scoring Rules — DevSignal'; }, []);
  const [config, setConfig] = useState<ScoringConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previews, setPreviews] = useState<ScorePreviewEntry[] | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch current config
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/scoring/config');
      setConfig(data);
      setDirty(false);
    } catch {
      showToast('Failed to load scoring config', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { data } = await api.put('/scoring/config', config);
      setConfig(data);
      setDirty(false);
      showToast('Scoring config saved', 'success');
    } catch {
      showToast('Failed to save scoring config', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!config) return;
    setPreviewing(true);
    setPreviews(null);
    try {
      const { data } = await api.post('/scoring/preview', config);
      setPreviews(data.previews || []);
    } catch {
      showToast('Failed to generate preview', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const handleRecompute = async () => {
    if (!config) return;
    setRecomputing(true);
    try {
      const { data } = await api.post('/scoring/recompute', config);
      showToast(`Recomputed scores for ${data.updated} accounts`, 'success');
      setDirty(false);
    } catch {
      showToast('Failed to recompute scores', 'error');
    } finally {
      setRecomputing(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset scoring rules to defaults? This will overwrite your custom configuration.')) {
      return;
    }
    setResetting(true);
    try {
      const { data } = await api.post('/scoring/reset');
      setConfig(data);
      setDirty(false);
      setPreviews(null);
      showToast('Reset to default scoring rules', 'success');
    } catch {
      showToast('Failed to reset scoring config', 'error');
    } finally {
      setResetting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Rule manipulation
  // ---------------------------------------------------------------------------

  const updateConfig = (updater: (prev: ScoringConfig) => ScoringConfig) => {
    if (!config) return;
    setConfig(updater(config));
    setDirty(true);
  };

  const updateRule = (ruleId: string, updates: Partial<ScoringRule>) => {
    updateConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)),
    }));
  };

  const removeRule = (ruleId: string) => {
    updateConfig((prev) => ({
      ...prev,
      rules: prev.rules.filter((r) => r.id !== ruleId),
    }));
    if (expandedRuleId === ruleId) setExpandedRuleId(null);
  };

  const addRule = () => {
    const newRule: ScoringRule = {
      id: `custom_${Date.now()}`,
      name: 'New Rule',
      description: '',
      signalType: '*',
      weight: 10,
      decay: '30d',
      conditions: [],
      enabled: true,
    };
    updateConfig((prev) => ({
      ...prev,
      rules: [...prev.rules, newRule],
    }));
    setExpandedRuleId(newRule.id);
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (!config || newIndex < 0 || newIndex >= config.rules.length) return;
    updateConfig((prev) => {
      const rules = [...prev.rules];
      [rules[index], rules[newIndex]] = [rules[newIndex], rules[index]];
      return { ...prev, rules };
    });
  };

  const addCondition = (ruleId: string) => {
    updateConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              conditions: [...r.conditions, { field: 'signal_count', operator: 'gt' as const, value: '0' }],
            }
          : r,
      ),
    }));
  };

  const updateCondition = (ruleId: string, condIndex: number, updates: Partial<ScoringCondition>) => {
    updateConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((r) =>
        r.id === ruleId
          ? {
              ...r,
              conditions: r.conditions.map((c, i) => (i === condIndex ? { ...c, ...updates } : c)),
            }
          : r,
      ),
    }));
  };

  const removeCondition = (ruleId: string, condIndex: number) => {
    updateConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((r) =>
        r.id === ruleId
          ? { ...r, conditions: r.conditions.filter((_, i) => i !== condIndex) }
          : r,
      ),
    }));
  };

  const updateThreshold = (tier: keyof TierThresholds, value: number) => {
    updateConfig((prev) => ({
      ...prev,
      tierThresholds: { ...prev.tierThresholds, [tier]: value },
    }));
  };

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const totalWeight = config?.rules.filter((r) => r.enabled).reduce((sum, r) => sum + r.weight, 0) ?? 0;
  const enabledCount = config?.rules.filter((r) => r.enabled).length ?? 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Lead Scoring Builder</h1>
          <p className="mt-1 text-sm text-gray-500">Customize your PQA scoring rules</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Lead Scoring Builder</h1>
          <p className="mt-1 text-sm text-gray-500">Failed to load scoring configuration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Scoring Builder</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customize your PQA scoring model with no-code rules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            onClick={handlePreview}
            disabled={previewing || config.rules.length === 0}
            className="px-3 py-2 text-sm border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {previewing ? 'Previewing...' : 'Preview Changes'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Config'}
          </button>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {recomputing ? 'Recomputing...' : 'Apply & Recompute'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Rules" value={enabledCount} accent="text-indigo-600" />
        <StatCard label="Total Weight" value={totalWeight} accent={totalWeight === 0 ? 'text-red-600' : 'text-gray-900'} />
        <StatCard label="Max Score" value={config.maxScore} accent="text-gray-900" />
        <StatCard
          label="Dirty"
          value={dirty ? 'Unsaved' : 'Saved'}
          accent={dirty ? 'text-amber-600' : 'text-green-600'}
          isText
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Rules */}
        <div className="flex-1 lg:w-3/5 space-y-4">
          {/* Rule list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">
                Scoring Rules ({config.rules.length})
              </h2>
              <button
                onClick={addRule}
                className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                + Add Rule
              </button>
            </div>

            {config.rules.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No scoring rules defined. Click "Add Rule" or "Reset to Defaults" to get started.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {config.rules.map((rule, index) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    index={index}
                    totalRules={config.rules.length}
                    isExpanded={expandedRuleId === rule.id}
                    onToggleExpand={() =>
                      setExpandedRuleId(expandedRuleId === rule.id ? null : rule.id)
                    }
                    onUpdate={(updates) => updateRule(rule.id, updates)}
                    onRemove={() => removeRule(rule.id)}
                    onMoveUp={() => moveRule(index, -1)}
                    onMoveDown={() => moveRule(index, 1)}
                    onAddCondition={() => addCondition(rule.id)}
                    onUpdateCondition={(ci, updates) => updateCondition(rule.id, ci, updates)}
                    onRemoveCondition={(ci) => removeCondition(rule.id, ci)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview table */}
          {previews !== null && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">
                  Score Preview (Top 10 Accounts)
                </h2>
              </div>
              {previews.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No scored accounts to preview. Ingest some signals first.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-3 px-4 font-semibold text-gray-600">Account</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-600">Current</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-600">Projected</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-600">Delta</th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-600">Tier Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previews.map((p) => (
                        <tr key={p.accountId} className="hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-medium text-gray-900">{p.accountName}</span>
                              {p.domain && (
                                <span className="text-xs text-gray-400 ml-2">{p.domain}</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-medium">{p.currentScore}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-bold">{p.projectedScore}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`font-medium ${
                                p.delta > 0
                                  ? 'text-green-600'
                                  : p.delta < 0
                                    ? 'text-red-600'
                                    : 'text-gray-400'
                              }`}
                            >
                              {p.delta > 0 ? '+' : ''}
                              {p.delta}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TierBadge tier={p.currentTier} />
                              {p.currentTier !== p.projectedTier && (
                                <>
                                  <span className="text-gray-400 mx-1">&rarr;</span>
                                  <TierBadge tier={p.projectedTier} />
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Tier thresholds + summary */}
        <div className="lg:w-2/5 space-y-4">
          {/* Tier thresholds */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Tier Thresholds</h2>
            </div>
            <div className="p-4 space-y-5">
              <ThresholdSlider
                label="HOT"
                value={config.tierThresholds.HOT}
                onChange={(v) => updateThreshold('HOT', v)}
                color="bg-red-500"
                textColor="text-red-700"
              />
              <ThresholdSlider
                label="WARM"
                value={config.tierThresholds.WARM}
                onChange={(v) => updateThreshold('WARM', v)}
                color="bg-orange-500"
                textColor="text-orange-700"
              />
              <ThresholdSlider
                label="COLD"
                value={config.tierThresholds.COLD}
                onChange={(v) => updateThreshold('COLD', v)}
                color="bg-blue-500"
                textColor="text-blue-700"
              />

              {/* Visual tier range bar */}
              <div className="pt-2">
                <p className="text-xs font-medium text-gray-500 mb-2">Score Ranges</p>
                <div className="flex rounded-full overflow-hidden h-6">
                  <div
                    className="bg-gray-300 flex items-center justify-center text-[10px] font-medium text-gray-700"
                    style={{ width: `${config.tierThresholds.COLD}%` }}
                  >
                    {config.tierThresholds.COLD >= 10 ? 'INACTIVE' : ''}
                  </div>
                  <div
                    className="bg-blue-400 flex items-center justify-center text-[10px] font-medium text-white"
                    style={{
                      width: `${config.tierThresholds.WARM - config.tierThresholds.COLD}%`,
                    }}
                  >
                    COLD
                  </div>
                  <div
                    className="bg-orange-400 flex items-center justify-center text-[10px] font-medium text-white"
                    style={{
                      width: `${config.tierThresholds.HOT - config.tierThresholds.WARM}%`,
                    }}
                  >
                    WARM
                  </div>
                  <div
                    className="bg-red-500 flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ width: `${100 - config.tierThresholds.HOT}%` }}
                  >
                    HOT
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Weight distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Weight Distribution</h2>
            </div>
            <div className="p-4 space-y-2">
              {config.rules
                .filter((r) => r.enabled)
                .map((rule) => {
                  const pct = totalWeight > 0 ? Math.round((rule.weight / totalWeight) * 100) : 0;
                  return (
                    <div key={rule.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-32 truncate" title={rule.name}>
                        {rule.name}
                      </span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-2 bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-gray-500 w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              {enabledCount === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No enabled rules</p>
              )}
            </div>
          </div>

          {/* Max score */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">Max Score</h2>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={config.maxScore}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 100;
                    updateConfig((prev) => ({ ...prev, maxScore: Math.max(1, Math.min(1000, v)) }));
                  }}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <span className="text-xs text-gray-500">
                  The maximum possible score for any account
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  accent,
  isText,
}: {
  label: string;
  value: number | string;
  accent: string;
  isText?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`${isText ? 'text-lg' : 'text-2xl'} font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        TIER_COLORS[tier] || 'bg-gray-100 text-gray-600'
      }`}
    >
      {tier}
    </span>
  );
}

function ThresholdSlider({
  label,
  value,
  onChange,
  color,
  textColor,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
  textColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${color}`} />
          <span className={`text-sm font-medium ${textColor}`}>{label}</span>
        </div>
        <span className="text-sm font-bold text-gray-900">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
    </div>
  );
}

function RuleCard({
  rule,
  index,
  totalRules,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddCondition,
  onUpdateCondition,
  onRemoveCondition,
}: {
  rule: ScoringRule;
  index: number;
  totalRules: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<ScoringRule>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddCondition: () => void;
  onUpdateCondition: (ci: number, updates: Partial<ScoringCondition>) => void;
  onRemoveCondition: (ci: number) => void;
}) {
  const signalLabel =
    SIGNAL_TYPES.find((s) => s.value === rule.signalType)?.label || rule.signalType;
  const isDefault = rule.id.startsWith('default_');

  return (
    <div className={`${!rule.enabled ? 'opacity-60' : ''}`}>
      {/* Collapsed header */}
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={onToggleExpand}
      >
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalRules - 1}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Enable toggle */}
        <div onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onUpdate({ enabled: !rule.enabled })}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              rule.enabled ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                rule.enabled ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>

        {/* Name + signal type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 truncate">{rule.name}</span>
            {isDefault && (
              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">
                BUILT-IN
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{signalLabel}</span>
        </div>

        {/* Weight */}
        <div className="text-right">
          <span className="text-sm font-bold text-indigo-600">{rule.weight}</span>
          <span className="text-xs text-gray-400 ml-0.5">wt</span>
        </div>

        {/* Decay badge */}
        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
          {rule.decay === 'none' ? 'No decay' : rule.decay}
        </span>

        {/* Expand chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={rule.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Signal Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Signal Type</label>
              <select
                value={rule.signalType}
                onChange={(e) => onUpdate({ signalType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                {SIGNAL_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Weight slider */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Weight: {rule.weight}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={rule.weight}
                onChange={(e) => onUpdate({ weight: parseInt(e.target.value) })}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            {/* Decay */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Time Decay</label>
              <select
                value={rule.decay}
                onChange={(e) => onUpdate({ decay: e.target.value as ScoringRule['decay'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                {DECAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              type="text"
              value={rule.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Describe what this rule measures..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Conditions */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">
                Conditions ({rule.conditions.length})
              </label>
              <button
                onClick={onAddCondition}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                + Add Condition
              </button>
            </div>
            {rule.conditions.length === 0 ? (
              <p className="text-xs text-gray-400">
                No conditions. This rule will always contribute to the score.
              </p>
            ) : (
              <div className="space-y-2">
                {rule.conditions.map((cond, ci) => (
                  <div key={ci} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                    <select
                      value={cond.field}
                      onChange={(e) => onUpdateCondition(ci, { field: e.target.value })}
                      className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white"
                    >
                      <option value="signal_count">Signal Count</option>
                      <option value="user_count">User Count</option>
                      <option value="total_signals">Total Signals</option>
                    </select>
                    <select
                      value={cond.operator}
                      onChange={(e) =>
                        onUpdateCondition(ci, {
                          operator: e.target.value as ScoringCondition['operator'],
                        })
                      }
                      className="px-2 py-1.5 border border-gray-300 rounded text-xs bg-white"
                    >
                      <option value="gt">{'>'}</option>
                      <option value="lt">{'<'}</option>
                      <option value="eq">=</option>
                      <option value="contains">contains</option>
                    </select>
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => onUpdateCondition(ci, { value: e.target.value })}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs min-w-0"
                    />
                    <button
                      onClick={() => onRemoveCondition(ci)}
                      className="text-red-400 hover:text-red-600"
                      title="Remove condition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Delete rule */}
          <div className="flex justify-end">
            <button
              onClick={onRemove}
              className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              Delete Rule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
