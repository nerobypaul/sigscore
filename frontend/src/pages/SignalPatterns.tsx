import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/Toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalProfile {
  accountId: string;
  accountName: string;
  signalTypeCounts: Record<string, number>;
  signalVelocity: number;
  topSignalTypes: string[];
  engagementPattern: 'accelerating' | 'steady' | 'decelerating' | 'dormant';
  firmographics: { industry?: string; size?: string; domain?: string };
  totalSignals: number;
}

interface ICPDefinition {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  criteria: {
    minScore?: number;
    signalTypes?: string[];
    minSignalCount?: number;
    engagementPatterns?: string[];
    industries?: string[];
    companySize?: string[];
  };
  createdAt: string;
}

interface ICPMatchResult {
  accountId: string;
  companyName: string;
  score: number;
  matchPercentage: number;
  matchedCriteria: string[];
  missedCriteria: string[];
  signalProfile: SignalProfile;
}

interface SignalSequence {
  sequence: string[];
  occurrences: number;
  accountNames: string[];
  avgScore: number;
}

type TabKey = 'icp' | 'sequences';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_OPTIONS = [
  'repo_star',
  'repo_clone',
  'repo_fork',
  'pull_request',
  'issue_opened',
  'package_install',
  'page_view',
  'api_call',
  'signup',
  'login',
  'feature_used',
  'support_ticket',
  'doc_view',
  'webhook_sent',
  'mention',
];

const ENGAGEMENT_OPTIONS = ['accelerating', 'steady', 'decelerating', 'dormant'];

const INDUSTRY_OPTIONS = [
  'Developer Tools',
  'Cloud Infrastructure',
  'Data & Analytics',
  'Security',
  'AI/ML',
  'Fintech',
  'E-commerce',
  'SaaS',
  'Open Source',
  'Other',
];

const SIZE_OPTIONS = ['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function engagementBadge(pattern: string): { bg: string; text: string } {
  switch (pattern) {
    case 'accelerating':
      return { bg: 'bg-green-100', text: 'text-green-700' };
    case 'steady':
      return { bg: 'bg-blue-100', text: 'text-blue-700' };
    case 'decelerating':
      return { bg: 'bg-yellow-100', text: 'text-yellow-700' };
    case 'dormant':
      return { bg: 'bg-gray-100', text: 'text-gray-600' };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-600' };
  }
}

function matchColor(pct: number): string {
  if (pct >= 80) return 'text-green-600';
  if (pct >= 50) return 'text-yellow-600';
  return 'text-gray-500';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SignalPatterns() {
  useEffect(() => { document.title = 'Signal Patterns - Sigscore'; }, []);

  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('icp');

  // ICP state
  const [icpDefinitions, setIcpDefinitions] = useState<ICPDefinition[]>([]);
  const [loadingICPs, setLoadingICPs] = useState(true);
  const [selectedICP, setSelectedICP] = useState<string | null>(null);
  const [icpMatches, setIcpMatches] = useState<ICPMatchResult[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // ICP Builder form state
  const [showBuilder, setShowBuilder] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMinScore, setFormMinScore] = useState('');
  const [formSignalTypes, setFormSignalTypes] = useState<string[]>([]);
  const [formMinSignalCount, setFormMinSignalCount] = useState('');
  const [formEngagementPatterns, setFormEngagementPatterns] = useState<string[]>([]);
  const [formIndustries, setFormIndustries] = useState<string[]>([]);
  const [formCompanySize, setFormCompanySize] = useState<string[]>([]);
  const [savingICP, setSavingICP] = useState(false);

  // Sequences state
  const [sequences, setSequences] = useState<SignalSequence[]>([]);
  const [loadingSequences, setLoadingSequences] = useState(false);

  // ---- Fetch ICP Definitions ----

  const fetchICPs = useCallback(async () => {
    try {
      setLoadingICPs(true);
      const { data } = await api.get('/patterns/icp');
      setIcpDefinitions(data.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load ICP definitions';
      toast.error(msg);
    } finally {
      setLoadingICPs(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchICPs();
  }, [fetchICPs]);

  // ---- Fetch ICP Matches ----

  const fetchMatches = useCallback(async (icpId: string) => {
    try {
      setLoadingMatches(true);
      setSelectedICP(icpId);
      const { data } = await api.get(`/patterns/icp/${icpId}/matches`);
      setIcpMatches(data.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load matches';
      toast.error(msg);
    } finally {
      setLoadingMatches(false);
    }
  }, [toast]);

  // ---- Fetch Sequences ----

  const fetchSequences = useCallback(async () => {
    try {
      setLoadingSequences(true);
      const { data } = await api.get('/patterns/sequences');
      setSequences(data.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load sequences';
      toast.error(msg);
    } finally {
      setLoadingSequences(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeTab === 'sequences' && sequences.length === 0) {
      fetchSequences();
    }
  }, [activeTab, sequences.length, fetchSequences]);

  // ---- Save ICP ----

  const handleSaveICP = async () => {
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }

    const criteria: ICPDefinition['criteria'] = {};
    if (formMinScore) criteria.minScore = parseInt(formMinScore, 10);
    if (formSignalTypes.length > 0) criteria.signalTypes = formSignalTypes;
    if (formMinSignalCount) criteria.minSignalCount = parseInt(formMinSignalCount, 10);
    if (formEngagementPatterns.length > 0) criteria.engagementPatterns = formEngagementPatterns;
    if (formIndustries.length > 0) criteria.industries = formIndustries;
    if (formCompanySize.length > 0) criteria.companySize = formCompanySize;

    try {
      setSavingICP(true);
      await api.post('/patterns/icp', {
        name: formName.trim(),
        description: formDescription.trim(),
        criteria,
      });
      toast.success('ICP definition saved');
      setShowBuilder(false);
      resetForm();
      fetchICPs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save ICP';
      toast.error(msg);
    } finally {
      setSavingICP(false);
    }
  };

  const handleDeleteICP = async (icpId: string) => {
    try {
      await api.delete(`/patterns/icp/${icpId}`);
      toast.success('ICP definition deleted');
      if (selectedICP === icpId) {
        setSelectedICP(null);
        setIcpMatches([]);
      }
      fetchICPs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete ICP';
      toast.error(msg);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormMinScore('');
    setFormSignalTypes([]);
    setFormMinSignalCount('');
    setFormEngagementPatterns([]);
    setFormIndustries([]);
    setFormCompanySize([]);
  };

  const toggleArrayItem = (arr: string[], item: string, setter: (v: string[]) => void) => {
    if (arr.includes(item)) {
      setter(arr.filter((i) => i !== item));
    } else {
      setter([...arr, item]);
    }
  };

  // ---- Render ----

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Signal Patterns</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define ideal customer profiles and discover signal sequences that predict high engagement
          </p>
        </div>
        {activeTab === 'icp' && (
          <button
            onClick={() => setShowBuilder(!showBuilder)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon />
            {showBuilder ? 'Cancel' : 'New ICP'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {([
            { key: 'icp' as const, label: 'ICP Matching' },
            { key: 'sequences' as const, label: 'Signal Sequences' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'icp' && (
        <ICPTab
          showBuilder={showBuilder}
          definitions={icpDefinitions}
          loadingICPs={loadingICPs}
          selectedICP={selectedICP}
          matches={icpMatches}
          loadingMatches={loadingMatches}
          savingICP={savingICP}
          formName={formName}
          formDescription={formDescription}
          formMinScore={formMinScore}
          formSignalTypes={formSignalTypes}
          formMinSignalCount={formMinSignalCount}
          formEngagementPatterns={formEngagementPatterns}
          formIndustries={formIndustries}
          formCompanySize={formCompanySize}
          setFormName={setFormName}
          setFormDescription={setFormDescription}
          setFormMinScore={setFormMinScore}
          setFormSignalTypes={setFormSignalTypes}
          setFormMinSignalCount={setFormMinSignalCount}
          setFormEngagementPatterns={setFormEngagementPatterns}
          setFormIndustries={setFormIndustries}
          setFormCompanySize={setFormCompanySize}
          toggleArrayItem={toggleArrayItem}
          onSave={handleSaveICP}
          onDelete={handleDeleteICP}
          onSelectICP={fetchMatches}
        />
      )}

      {activeTab === 'sequences' && (
        <SequencesTab
          sequences={sequences}
          loading={loadingSequences}
          onRefresh={fetchSequences}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ICP Tab
// ---------------------------------------------------------------------------

interface ICPTabProps {
  showBuilder: boolean;
  definitions: ICPDefinition[];
  loadingICPs: boolean;
  selectedICP: string | null;
  matches: ICPMatchResult[];
  loadingMatches: boolean;
  savingICP: boolean;
  formName: string;
  formDescription: string;
  formMinScore: string;
  formSignalTypes: string[];
  formMinSignalCount: string;
  formEngagementPatterns: string[];
  formIndustries: string[];
  formCompanySize: string[];
  setFormName: (v: string) => void;
  setFormDescription: (v: string) => void;
  setFormMinScore: (v: string) => void;
  setFormSignalTypes: (v: string[]) => void;
  setFormMinSignalCount: (v: string) => void;
  setFormEngagementPatterns: (v: string[]) => void;
  setFormIndustries: (v: string[]) => void;
  setFormCompanySize: (v: string[]) => void;
  toggleArrayItem: (arr: string[], item: string, setter: (v: string[]) => void) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onSelectICP: (id: string) => void;
}

function ICPTab(props: ICPTabProps) {
  return (
    <div className="space-y-6">
      {/* ICP Builder */}
      {props.showBuilder && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Define Ideal Customer Profile</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={props.formName}
                onChange={(e) => props.setFormName(e.target.value)}
                placeholder="e.g. High-Intent Series A Devtools"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={props.formDescription}
                onChange={(e) => props.setFormDescription(e.target.value)}
                placeholder="Brief description of this ICP"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Min PQA Score */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min PQA Score</label>
              <input
                type="number"
                min="0"
                max="100"
                value={props.formMinScore}
                onChange={(e) => props.setFormMinScore(e.target.value)}
                placeholder="e.g. 50"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Min Signal Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Signal Count (90d)</label>
              <input
                type="number"
                min="0"
                value={props.formMinSignalCount}
                onChange={(e) => props.setFormMinSignalCount(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Signal Types */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Signal Types (must have at least one)</label>
            <div className="flex flex-wrap gap-2">
              {SIGNAL_TYPE_OPTIONS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => props.toggleArrayItem(props.formSignalTypes, type, props.setFormSignalTypes)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    props.formSignalTypes.includes(type)
                      ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {type.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Engagement Patterns */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Engagement Patterns</label>
            <div className="flex flex-wrap gap-2">
              {ENGAGEMENT_OPTIONS.map((pattern) => (
                <button
                  key={pattern}
                  type="button"
                  onClick={() => props.toggleArrayItem(props.formEngagementPatterns, pattern, props.setFormEngagementPatterns)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    props.formEngagementPatterns.includes(pattern)
                      ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {pattern}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Industry */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Industries</label>
              <div className="flex flex-wrap gap-2">
                {INDUSTRY_OPTIONS.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    onClick={() => props.toggleArrayItem(props.formIndustries, industry, props.setFormIndustries)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      props.formIndustries.includes(industry)
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {industry}
                  </button>
                ))}
              </div>
            </div>

            {/* Company Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Company Size</label>
              <div className="flex flex-wrap gap-2">
                {SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => props.toggleArrayItem(props.formCompanySize, size, props.setFormCompanySize)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      props.formCompanySize.includes(size)
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {size.charAt(0) + size.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={props.onSave}
              disabled={props.savingICP}
              className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {props.savingICP ? 'Saving...' : 'Save ICP Definition'}
            </button>
          </div>
        </div>
      )}

      {/* ICP Definitions List */}
      {props.loadingICPs ? (
        <div className="text-center py-12 text-gray-500">Loading ICP definitions...</div>
      ) : props.definitions.length === 0 && !props.showBuilder ? (
        <div className="text-center py-16">
          <ICPEmptyIcon />
          <h3 className="mt-3 text-sm font-semibold text-gray-900">No ICP definitions yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Create your first Ideal Customer Profile to find accounts that match your target criteria.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {props.definitions.map((icp) => (
            <div
              key={icp.id}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
                props.selectedICP === icp.id
                  ? 'border-indigo-400 ring-1 ring-indigo-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => props.onSelectICP(icp.id)}
                  className="flex-1 text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">{icp.name}</h3>
                  {icp.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{icp.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {icp.criteria.minScore !== undefined && (
                      <CriteriaBadge label={`Score >= ${icp.criteria.minScore}`} />
                    )}
                    {icp.criteria.signalTypes && icp.criteria.signalTypes.length > 0 && (
                      <CriteriaBadge label={`${icp.criteria.signalTypes.length} signal types`} />
                    )}
                    {icp.criteria.minSignalCount !== undefined && (
                      <CriteriaBadge label={`>= ${icp.criteria.minSignalCount} signals`} />
                    )}
                    {icp.criteria.engagementPatterns && icp.criteria.engagementPatterns.length > 0 && (
                      <CriteriaBadge label={icp.criteria.engagementPatterns.join(', ')} />
                    )}
                    {icp.criteria.industries && icp.criteria.industries.length > 0 && (
                      <CriteriaBadge label={icp.criteria.industries.join(', ')} />
                    )}
                    {icp.criteria.companySize && icp.criteria.companySize.length > 0 && (
                      <CriteriaBadge label={icp.criteria.companySize.map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join(', ')} />
                    )}
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDelete(icp.id);
                  }}
                  className="flex-shrink-0 ml-3 text-gray-400 hover:text-red-500 transition-colors p-1"
                  title="Delete ICP"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ICP Matches Table */}
      {props.selectedICP && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Matching Accounts
            {!props.loadingMatches && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({props.matches.length} found)
              </span>
            )}
          </h2>

          {props.loadingMatches ? (
            <div className="text-center py-8 text-gray-500">Analyzing accounts...</div>
          ) : props.matches.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No accounts match this ICP definition.</p>
              <p className="text-xs text-gray-400 mt-1">
                Try broadening the criteria or wait for more signal data.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PQA Score</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Match</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Top Signals</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Engagement</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Matched Criteria</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {props.matches.map((match) => {
                      const eb = engagementBadge(match.signalProfile.engagementPattern);
                      return (
                        <tr key={match.accountId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link
                              to={`/companies/${match.accountId}`}
                              className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                            >
                              {match.companyName}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-gray-900">{match.score}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-semibold ${matchColor(match.matchPercentage)}`}>
                              {match.matchPercentage}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {match.signalProfile.topSignalTypes.map((t) => (
                                <span key={t} className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                  {t.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${eb.bg} ${eb.text}`}>
                              {match.signalProfile.engagementPattern}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {match.matchedCriteria.slice(0, 3).map((c, i) => (
                                <span key={i} className="inline-block px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                                  {c.length > 30 ? c.slice(0, 30) + '...' : c}
                                </span>
                              ))}
                              {match.matchedCriteria.length > 3 && (
                                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                                  +{match.matchedCriteria.length - 3} more
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sequences Tab
// ---------------------------------------------------------------------------

function SequencesTab({
  sequences,
  loading,
  onRefresh,
}: {
  sequences: SignalSequence[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return <div className="text-center py-12 text-gray-500">Analyzing signal sequences...</div>;
  }

  if (sequences.length === 0) {
    return (
      <div className="text-center py-16">
        <SequenceEmptyIcon />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">No signal sequences detected</h3>
        <p className="mt-1 text-sm text-gray-500">
          Sequences are discovered from high-scoring accounts (PQA &gt; 70).
        </p>
        <p className="mt-1 text-xs text-gray-400">
          More signal data will reveal patterns over time.
        </p>
        <button
          onClick={onRefresh}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-500">
          Common signal sequences found in high-scoring accounts (PQA &gt; 70)
        </p>
        <button
          onClick={onRefresh}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Refresh
        </button>
      </div>

      {sequences.map((seq, idx) => (
        <div key={idx} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Sequence visualization */}
              <div className="flex items-center gap-1 flex-wrap mb-3">
                {seq.sequence.map((type, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="inline-flex px-3 py-1 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg border border-indigo-200">
                      {type.replace(/_/g, ' ')}
                    </span>
                    {i < seq.sequence.length - 1 && (
                      <ArrowRightIcon />
                    )}
                  </span>
                ))}
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>
                  Seen in <span className="font-medium text-gray-700">{seq.occurrences}</span> accounts
                </span>
                <span>
                  Avg score: <span className="font-medium text-gray-700">{seq.avgScore}</span>
                </span>
              </div>

              {/* Account names */}
              {seq.accountNames.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Accounts: {seq.accountNames.join(', ')}
                </p>
              )}
            </div>

            {/* Frequency badge */}
            <div className="flex-shrink-0">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                seq.occurrences >= 5
                  ? 'bg-green-100 text-green-700'
                  : seq.occurrences >= 3
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
              }`}>
                {seq.occurrences}x
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CriteriaBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

function ICPEmptyIcon() {
  return (
    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function SequenceEmptyIcon() {
  return (
    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}
