import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookSubscription {
  id: string;
  targetUrl: string;
  event: string;
  secret: string;
  active: boolean;
}

interface TestResult {
  success: boolean;
  statusCode: number | null;
  response: string | null;
  duration: number;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
}

interface DeliveryRecord {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  response: string | null;
  success: boolean;
  attempt: number;
  maxAttempts: number;
  jobId: string | null;
  createdAt: string;
}

interface WebhookTestPanelProps {
  subscription: WebhookSubscription;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusCodeColor(code: number | null): string {
  if (code === null) return 'text-gray-500';
  if (code >= 200 && code < 300) return 'text-green-600 bg-green-50 border-green-200';
  if (code >= 300 && code < 400) return 'text-blue-600 bg-blue-50 border-blue-200';
  if (code >= 400 && code < 500) return 'text-amber-600 bg-amber-50 border-amber-200';
  return 'text-red-600 bg-red-50 border-red-200';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WebhookTestPanel({ subscription, onClose }: WebhookTestPanelProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'request' | 'response' | 'history'>('request');

  // Fetch recent deliveries
  const fetchDeliveries = useCallback(async () => {
    try {
      setDeliveriesLoading(true);
      const { data } = await api.get(
        `/webhooks/subscribe/${subscription.id}/deliveries`,
        { params: { limit: 5 } },
      );
      setDeliveries(data.deliveries);
    } catch {
      // Silently ignore — deliveries are supplementary
    } finally {
      setDeliveriesLoading(false);
    }
  }, [subscription.id]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  // Send test webhook
  const handleSendTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);

    try {
      const { data } = await api.post(`/webhooks/subscribe/${subscription.id}/test`);
      setTestResult(data);
      setActiveTab('response');
      // Refresh deliveries after test
      fetchDeliveries();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setTestError(axiosErr.response?.data?.error || 'Failed to send test webhook');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Webhook Test Panel</h3>
          <span className="text-xs text-gray-500 font-mono truncate max-w-xs" title={subscription.targetUrl}>
            {subscription.targetUrl}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSendTest}
            disabled={testing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {testing ? (
              <>
                <Spinner size="sm" className="border-white border-t-transparent" />
                Sending...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 14.828a4 4 0 010-5.656m5.656 0a4 4 0 010 5.656M12 12h.008v.008H12V12z" />
                </svg>
                Send Test
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Close panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {testError && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {testError}
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-3">
        <div className="flex gap-1 border-b border-gray-200">
          {(['request', 'response', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'request' && 'Request Preview'}
              {tab === 'response' && (
                <span className="flex items-center gap-1.5">
                  Response
                  {testResult && (
                    <span
                      className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusCodeColor(testResult.statusCode)}`}
                    >
                      {testResult.statusCode ?? 'ERR'}
                    </span>
                  )}
                </span>
              )}
              {tab === 'history' && `History (${deliveries.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4 max-h-96 overflow-auto">
        {/* ---- Request Preview tab ---- */}
        {activeTab === 'request' && (
          <div className="space-y-3">
            {/* URL */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Endpoint
              </label>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold rounded">POST</span>
                <code className="text-xs text-gray-800 font-mono break-all">{subscription.targetUrl}</code>
              </div>
            </div>

            {/* Headers */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Headers
              </label>
              <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-100 space-y-0.5 overflow-x-auto">
                <div><span className="text-indigo-400">Content-Type</span>: application/json</div>
                <div><span className="text-indigo-400">X-Sigscore-Event</span>: {subscription.event}</div>
                <div>
                  <span className="text-indigo-400">X-Sigscore-Signature</span>:{' '}
                  <span className="text-gray-400">sha256=&lt;hmac-sha256-of-body&gt;</span>
                </div>
              </div>
            </div>

            {/* Sample Payload */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Sample Payload
              </label>
              <pre className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-100 overflow-x-auto whitespace-pre-wrap">
                {testResult
                  ? JSON.stringify(testResult.payload, null, 2)
                  : JSON.stringify(
                      {
                        event: subscription.event,
                        timestamp: new Date().toISOString(),
                        organizationId: '<your-org-id>',
                        data: '(sample data for ' + subscription.event + ')',
                        _test: true,
                      },
                      null,
                      2,
                    )}
              </pre>
            </div>
          </div>
        )}

        {/* ---- Response tab ---- */}
        {activeTab === 'response' && (
          <div>
            {testing && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
                <span className="ml-3 text-sm text-gray-500">Sending test webhook...</span>
              </div>
            )}

            {!testing && !testResult && !testError && (
              <div className="text-center py-8">
                <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M9.172 14.828a4 4 0 010-5.656m5.656 0a4 4 0 010 5.656M12 12h.008v.008H12V12z" />
                </svg>
                <p className="text-sm text-gray-500">Click "Send Test" to fire a test webhook</p>
                <p className="text-xs text-gray-400 mt-1">The result will appear here</p>
              </div>
            )}

            {!testing && testResult && (
              <div className="space-y-3">
                {/* Status summary */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className={`text-sm font-semibold ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                      {testResult.success ? 'Delivered Successfully' : 'Delivery Failed'}
                    </span>
                  </div>

                  <span
                    className={`inline-flex px-2 py-0.5 rounded border text-xs font-semibold ${statusCodeColor(testResult.statusCode)}`}
                  >
                    {testResult.statusCode ?? 'No response'}
                  </span>

                  <span className="text-xs text-gray-500">
                    {formatDuration(testResult.duration)}
                  </span>
                </div>

                {/* Request headers sent */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Request Headers Sent
                  </label>
                  <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-100 space-y-0.5 overflow-x-auto">
                    {Object.entries(testResult.headers).map(([key, value]) => (
                      <div key={key}>
                        <span className="text-indigo-400">{key}</span>: {value}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Response body */}
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Response Body
                  </label>
                  <pre className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-gray-100 overflow-x-auto whitespace-pre-wrap max-h-48">
                    {testResult.response
                      ? formatResponseBody(testResult.response)
                      : '(empty response)'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- History tab ---- */}
        {activeTab === 'history' && (
          <div>
            {deliveriesLoading && (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            )}

            {!deliveriesLoading && deliveries.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">No delivery history yet</p>
                <p className="text-xs text-gray-400 mt-1">Send a test to create the first delivery record</p>
              </div>
            )}

            {!deliveriesLoading && deliveries.length > 0 && (
              <div className="space-y-2">
                {deliveries.map((delivery) => (
                  <DeliveryRow key={delivery.id} delivery={delivery} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeliveryRow({ delivery }: { delivery: DeliveryRecord }) {
  const [expanded, setExpanded] = useState(false);

  const isTest = delivery.jobId?.startsWith('test_') ?? false;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {delivery.success ? (
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          )}
          <span
            className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-semibold ${statusCodeColor(delivery.statusCode)}`}
          >
            {delivery.statusCode ?? 'ERR'}
          </span>
          <span className="text-xs text-gray-600">{delivery.event}</span>
          {isTest && (
            <span className="inline-flex px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] font-medium text-indigo-600">
              TEST
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {formatTimestamp(delivery.createdAt)}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 space-y-2 pt-2">
          {/* Payload */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Payload
            </label>
            <pre className="bg-gray-900 rounded-lg p-2 text-[11px] font-mono text-gray-100 overflow-x-auto whitespace-pre-wrap max-h-32">
              {JSON.stringify(delivery.payload, null, 2)}
            </pre>
          </div>

          {/* Response */}
          {delivery.response && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Response
              </label>
              <pre className="bg-gray-900 rounded-lg p-2 text-[11px] font-mono text-gray-100 overflow-x-auto whitespace-pre-wrap max-h-32">
                {formatResponseBody(delivery.response)}
              </pre>
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-4 text-[10px] text-gray-400">
            <span>Attempt {delivery.attempt}/{delivery.maxAttempts}</span>
            {delivery.jobId && <span className="font-mono">Job: {delivery.jobId}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatResponseBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}
