import type { HttpClient } from '../client.js';
import type {
  Activity,
  BatchIngestResult,
  ListParams,
  PaginatedResponse,
  Signal,
  SignalInput,
  SignalQueryParams,
} from '../types.js';

/**
 * Methods for ingesting and querying signals.
 */
export class SignalsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Ingest a single signal event.
   */
  async ingest(signal: SignalInput): Promise<Signal> {
    return this.client.post<Signal>('/api/v1/signals', signal);
  }

  /**
   * Ingest a batch of signal events in a single request.
   */
  async ingestBatch(signals: SignalInput[]): Promise<BatchIngestResult> {
    return this.client.post<BatchIngestResult>('/api/v1/signals/batch', { signals });
  }

  /**
   * List signals with optional filters and pagination.
   */
  async list(params?: SignalQueryParams): Promise<PaginatedResponse<Signal>> {
    return this.client.get<PaginatedResponse<Signal>>(
      '/api/v1/signals',
      params as Record<string, unknown> | undefined,
    );
  }

  /**
   * Get all signals for a specific account.
   */
  async getAccountSignals(
    accountId: string,
    params?: ListParams,
  ): Promise<PaginatedResponse<Signal>> {
    return this.client.get<PaginatedResponse<Signal>>(
      `/api/v1/signals/accounts/${encodeURIComponent(accountId)}/signals`,
      params as Record<string, unknown> | undefined,
    );
  }

  /**
   * Get the merged timeline (signals + activities) for an account.
   */
  async getTimeline(accountId: string): Promise<Array<Signal | Activity>> {
    return this.client.get<Array<Signal | Activity>>(
      `/api/v1/signals/accounts/${encodeURIComponent(accountId)}/timeline`,
    );
  }
}
