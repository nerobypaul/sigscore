import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalSourceStatus {
  id: string;
  type: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR';
  lastSyncAt: string | null;
  errorMessage: string | null;
  _count: { signals: number };
}

interface IntegrationStatus {
  connected: boolean;
  syncInProgress?: boolean;
  lastSyncAt?: string | null;
}

type ConnectorStatus = 'active' | 'syncing' | 'error' | 'paused' | 'disconnected';

interface ConnectorInfo {
  key: string;
  name: string;
  color: string;         // dot color class
  bgColor: string;       // background color class for the dot container
  status: ConnectorStatus;
  lastSyncAt: string | null;
  signalCount: number;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Known connectors (static registry of all connector types in DevSignal)
// ---------------------------------------------------------------------------

interface ConnectorDef {
  key: string;
  name: string;
  dotColor: string;
  bgColor: string;
  sourceType?: string;       // matches SignalSourceType enum
  integrationKey?: string;   // for HubSpot/Salesforce status endpoints
}

const KNOWN_CONNECTORS: ConnectorDef[] = [
  { key: 'github',        name: 'GitHub',         dotColor: 'bg-gray-900',    bgColor: 'bg-gray-100',    sourceType: 'GITHUB' },
  { key: 'npm',           name: 'npm',            dotColor: 'bg-red-500',     bgColor: 'bg-red-50',      sourceType: 'NPM' },
  { key: 'pypi',          name: 'PyPI',           dotColor: 'bg-blue-500',    bgColor: 'bg-blue-50',     sourceType: 'PYPI' },
  { key: 'segment',       name: 'Segment',        dotColor: 'bg-green-500',   bgColor: 'bg-green-50',    sourceType: 'SEGMENT' },
  { key: 'discord',       name: 'Discord',        dotColor: 'bg-indigo-500',  bgColor: 'bg-indigo-50',   sourceType: 'DISCORD' },
  { key: 'slack',         name: 'Slack',          dotColor: 'bg-purple-500',  bgColor: 'bg-purple-50' },
  { key: 'hubspot',       name: 'HubSpot',        dotColor: 'bg-orange-500',  bgColor: 'bg-orange-50',   integrationKey: 'hubspot' },
  { key: 'salesforce',    name: 'Salesforce',     dotColor: 'bg-blue-600',    bgColor: 'bg-blue-50',     integrationKey: 'salesforce' },
  { key: 'stackoverflow', name: 'Stack Overflow', dotColor: 'bg-amber-500',   bgColor: 'bg-amber-50',    sourceType: 'STACKOVERFLOW' },
  { key: 'twitter',       name: 'Twitter / X',    dotColor: 'bg-sky-500',     bgColor: 'bg-sky-50',      sourceType: 'TWITTER' },
  { key: 'reddit',        name: 'Reddit',         dotColor: 'bg-orange-600',  bgColor: 'bg-orange-50',   sourceType: 'REDDIT' },
  { key: 'posthog',       name: 'PostHog',        dotColor: 'bg-yellow-500',  bgColor: 'bg-yellow-50',   sourceType: 'POSTHOG' },
  { key: 'linkedin',      name: 'LinkedIn',       dotColor: 'bg-blue-700',    bgColor: 'bg-blue-50',     sourceType: 'LINKEDIN' },
  { key: 'intercom',      name: 'Intercom',       dotColor: 'bg-blue-400',    bgColor: 'bg-blue-50',     sourceType: 'INTERCOM' },
  { key: 'zendesk',       name: 'Zendesk',        dotColor: 'bg-green-600',   bgColor: 'bg-green-50',    sourceType: 'ZENDESK' },
  { key: 'website',       name: 'Website',        dotColor: 'bg-teal-500',    bgColor: 'bg-teal-50',     sourceType: 'WEBSITE' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveStatus(source: SignalSourceStatus): ConnectorStatus {
  if (source.status === 'ERROR') return 'error';
  if (source.status === 'PAUSED') return 'paused';
  // Heuristic: if lastSyncAt is within the last 10 minutes, consider it "syncing"
  if (source.lastSyncAt) {
    const diff = Date.now() - new Date(source.lastSyncAt).getTime();
    if (diff < 10 * 60 * 1000) return 'syncing';
  }
  return 'active';
}

function resolveIntegrationStatus(integration: IntegrationStatus): ConnectorStatus {
  if (!integration.connected) return 'disconnected';
  if (integration.syncInProgress) return 'syncing';
  return 'active';
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_LABELS: Record<ConnectorStatus, string> = {
  active: 'Active',
  syncing: 'Syncing',
  error: 'Error',
  paused: 'Paused',
  disconnected: 'Not connected',
};

const STATUS_DOT_COLORS: Record<ConnectorStatus, string> = {
  active: 'bg-emerald-400',
  syncing: 'bg-blue-400 animate-pulse',
  error: 'bg-red-500',
  paused: 'bg-yellow-400',
  disconnected: 'bg-gray-300',
};

const STATUS_TEXT_COLORS: Record<ConnectorStatus, string> = {
  active: 'text-emerald-700',
  syncing: 'text-blue-700',
  error: 'text-red-700',
  paused: 'text-yellow-700',
  disconnected: 'text-gray-400',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConnectorHealthCard() {
  const [connectors, setConnectors] = useState<ConnectorInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConnectorHealth() {
      try {
        // Fetch signal sources (batch) + integration statuses in parallel
        const results = await Promise.allSettled([
          api.get('/sources'),
          api.get('/integrations/hubspot/status').catch(() => null),
          api.get('/integrations/salesforce/status').catch(() => null),
          api.get('/settings/slack').catch(() => null),
        ]);

        // Parse signal sources
        const sourcesResult = results[0];
        const sources: SignalSourceStatus[] =
          sourcesResult.status === 'fulfilled' && sourcesResult.value?.data?.sources
            ? sourcesResult.value.data.sources
            : [];

        // Parse integration statuses
        const hubspotResult = results[1];
        const hubspotStatus: IntegrationStatus | null =
          hubspotResult.status === 'fulfilled' && hubspotResult.value?.data
            ? hubspotResult.value.data
            : null;

        const salesforceResult = results[2];
        const salesforceStatus: IntegrationStatus | null =
          salesforceResult.status === 'fulfilled' && salesforceResult.value?.data
            ? salesforceResult.value.data
            : null;

        const slackResult = results[3];
        const slackData: { configured?: boolean } | null =
          slackResult.status === 'fulfilled' && slackResult.value?.data
            ? slackResult.value.data
            : null;

        // Build a map of sourceType -> best source (prefer ACTIVE, then pick first)
        const sourceByType = new Map<string, SignalSourceStatus>();
        for (const src of sources) {
          const existing = sourceByType.get(src.type);
          if (!existing || (src.status === 'ACTIVE' && existing.status !== 'ACTIVE')) {
            sourceByType.set(src.type, src);
          }
        }

        // Build connector list
        const connectorList: ConnectorInfo[] = KNOWN_CONNECTORS.map((def) => {
          // Check signal sources first
          if (def.sourceType) {
            const src = sourceByType.get(def.sourceType);
            if (src) {
              return {
                key: def.key,
                name: def.name,
                color: def.dotColor,
                bgColor: def.bgColor,
                status: resolveStatus(src),
                lastSyncAt: src.lastSyncAt,
                signalCount: src._count.signals,
                errorMessage: src.errorMessage,
              };
            }
          }

          // Check HubSpot integration
          if (def.integrationKey === 'hubspot' && hubspotStatus?.connected) {
            return {
              key: def.key,
              name: def.name,
              color: def.dotColor,
              bgColor: def.bgColor,
              status: resolveIntegrationStatus(hubspotStatus),
              lastSyncAt: hubspotStatus.lastSyncAt || null,
              signalCount: 0,
              errorMessage: null,
            };
          }

          // Check Salesforce integration
          if (def.integrationKey === 'salesforce' && salesforceStatus?.connected) {
            return {
              key: def.key,
              name: def.name,
              color: def.dotColor,
              bgColor: def.bgColor,
              status: resolveIntegrationStatus(salesforceStatus),
              lastSyncAt: salesforceStatus.lastSyncAt || null,
              signalCount: 0,
              errorMessage: null,
            };
          }

          // Check Slack (settings-based)
          if (def.key === 'slack' && slackData?.configured) {
            return {
              key: def.key,
              name: def.name,
              color: def.dotColor,
              bgColor: def.bgColor,
              status: 'active' as ConnectorStatus,
              lastSyncAt: null,
              signalCount: 0,
              errorMessage: null,
            };
          }

          // Not connected
          return {
            key: def.key,
            name: def.name,
            color: def.dotColor,
            bgColor: def.bgColor,
            status: 'disconnected' as ConnectorStatus,
            lastSyncAt: null,
            signalCount: 0,
            errorMessage: null,
          };
        });

        // Sort: connected sources first (by signal count desc), disconnected last
        connectorList.sort((a, b) => {
          if (a.status === 'disconnected' && b.status !== 'disconnected') return 1;
          if (a.status !== 'disconnected' && b.status === 'disconnected') return -1;
          if (a.status === 'error' && b.status !== 'error') return -1;
          if (a.status !== 'error' && b.status === 'error') return 1;
          return b.signalCount - a.signalCount;
        });

        setConnectors(connectorList);
      } catch {
        // On total failure, show all as disconnected
        setConnectors(
          KNOWN_CONNECTORS.map((def) => ({
            key: def.key,
            name: def.name,
            color: def.dotColor,
            bgColor: def.bgColor,
            status: 'disconnected' as ConnectorStatus,
            lastSyncAt: null,
            signalCount: 0,
            errorMessage: null,
          }))
        );
      } finally {
        setLoading(false);
      }
    }

    fetchConnectorHealth();
  }, []);

  const activeCount = connectors.filter((c) => c.status !== 'disconnected').length;
  const errorCount = connectors.filter((c) => c.status === 'error').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Connector Health</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {activeCount} of {connectors.length} connected
            {errorCount > 0 && (
              <span className="text-red-600 font-medium ml-1">
                ({errorCount} {errorCount === 1 ? 'error' : 'errors'})
              </span>
            )}
          </p>
        </div>
        <Link
          to="/settings"
          className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
        >
          Manage Connectors
        </Link>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-md bg-gray-200" />
                <div className="h-4 bg-gray-200 rounded w-16" />
              </div>
              <div className="h-3 bg-gray-100 rounded w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {connectors.map((connector) => (
            <ConnectorTile key={connector.key} connector={connector} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connector tile sub-component
// ---------------------------------------------------------------------------

function ConnectorTile({ connector }: { connector: ConnectorInfo }) {
  const isDisconnected = connector.status === 'disconnected';
  const isError = connector.status === 'error';

  return (
    <div
      className={`
        rounded-lg border p-3 transition-colors
        ${isError ? 'border-red-200 bg-red-50/50' : ''}
        ${isDisconnected ? 'border-gray-100 bg-gray-50/50 opacity-60' : ''}
        ${!isError && !isDisconnected ? 'border-gray-200 hover:border-gray-300' : ''}
      `}
      title={connector.errorMessage || undefined}
    >
      {/* Icon + name row */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 ${connector.bgColor} rounded-md flex items-center justify-center flex-shrink-0`}>
          <div className={`w-2.5 h-2.5 rounded-full ${connector.color}`} />
        </div>
        <span className={`text-sm font-medium truncate ${isDisconnected ? 'text-gray-400' : 'text-gray-900'}`}>
          {connector.name}
        </span>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT_COLORS[connector.status]}`} />
        <span className={`text-xs font-medium ${STATUS_TEXT_COLORS[connector.status]}`}>
          {STATUS_LABELS[connector.status]}
        </span>
      </div>

      {/* Details (only for connected sources) */}
      {!isDisconnected && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-400">
          {connector.signalCount > 0 && (
            <span>{connector.signalCount.toLocaleString()} signals</span>
          )}
          {connector.lastSyncAt && (
            <span>{formatLastSync(connector.lastSyncAt)}</span>
          )}
        </div>
      )}

      {/* Error message preview */}
      {isError && connector.errorMessage && (
        <p className="mt-1 text-[10px] text-red-500 truncate" title={connector.errorMessage}>
          {connector.errorMessage}
        </p>
      )}
    </div>
  );
}
