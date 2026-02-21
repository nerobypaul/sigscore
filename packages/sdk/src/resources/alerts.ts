import type { HttpClient } from '../client.js';
import type {
  AlertHistoryParams,
  AlertHistoryResponse,
  AlertRule,
  AlertRuleInput,
  AlertTestResult,
} from '../types.js';

/**
 * Manage account alert rules (score changes, engagement drops, etc.).
 */
export class AlertsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List all alert rules for the organization.
   */
  async list(): Promise<AlertRule[]> {
    const data = await this.client.get<{ rules: AlertRule[] }>(
      '/api/v1/account-alerts',
    );
    return data.rules;
  }

  /**
   * Create a new alert rule.
   */
  async create(data: AlertRuleInput): Promise<AlertRule> {
    const result = await this.client.post<{ rule: AlertRule }>(
      '/api/v1/account-alerts',
      data,
    );
    return result.rule;
  }

  /**
   * Get a single alert rule by ID.
   *
   * Note: The API returns the rule directly (not wrapped).
   * Use `list()` for the full set — individual GET returns the same shape.
   */
  async get(id: string): Promise<AlertRule> {
    return this.client.get<AlertRule>(
      `/api/v1/account-alerts/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Update an existing alert rule. Only provided fields are changed.
   */
  async update(id: string, data: Partial<AlertRuleInput>): Promise<AlertRule> {
    const result = await this.client.put<{ rule: AlertRule }>(
      `/api/v1/account-alerts/${encodeURIComponent(id)}`,
      data,
    );
    return result.rule;
  }

  /**
   * Delete an alert rule by ID.
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(
      `/api/v1/account-alerts/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Send a test alert to verify notification channels are working.
   */
  async test(id: string): Promise<AlertTestResult> {
    return this.client.post<AlertTestResult>(
      `/api/v1/account-alerts/${encodeURIComponent(id)}/test`,
    );
  }

  /**
   * Get recent alert firing history (via notifications).
   */
  async history(params?: AlertHistoryParams): Promise<AlertHistoryResponse> {
    return this.client.get<AlertHistoryResponse>(
      '/api/v1/account-alerts/history',
      params as Record<string, unknown> | undefined,
    );
  }
}
