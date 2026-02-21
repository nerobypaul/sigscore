import type { HttpClient } from '../client.js';
import type {
  WebhookDelivery,
  WebhookSubscription,
  WebhookSubscriptionInput,
  WebhookSubscriptionStatus,
  WebhookSubscriptionUpdate,
  WebhookTestResult,
} from '../types.js';

/**
 * Manage webhook subscriptions (Zapier/Make REST Hook pattern).
 */
export class WebhooksResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List all webhook subscriptions for the organization.
   */
  async list(): Promise<WebhookSubscription[]> {
    const data = await this.client.get<{ subscriptions: WebhookSubscription[] }>(
      '/api/v1/webhooks/subscribe',
    );
    return data.subscriptions;
  }

  /**
   * Create a new webhook subscription.
   */
  async create(data: WebhookSubscriptionInput): Promise<WebhookSubscription> {
    return this.client.post<WebhookSubscription>(
      '/api/v1/webhooks/subscribe',
      data,
    );
  }

  /**
   * Get a single webhook subscription by ID.
   */
  async get(id: string): Promise<WebhookSubscription> {
    return this.client.get<WebhookSubscription>(
      `/api/v1/webhooks/subscribe/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Update a webhook subscription (toggle active status).
   */
  async update(id: string, data: WebhookSubscriptionUpdate): Promise<WebhookSubscription> {
    return this.client.put<WebhookSubscription>(
      `/api/v1/webhooks/subscribe/${encodeURIComponent(id)}`,
      data,
    );
  }

  /**
   * Delete a webhook subscription.
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(
      `/api/v1/webhooks/subscribe/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Send a test webhook payload to verify the endpoint is reachable.
   */
  async test(id: string): Promise<WebhookTestResult> {
    return this.client.post<WebhookTestResult>(
      `/api/v1/webhooks/subscribe/${encodeURIComponent(id)}/test`,
    );
  }

  /**
   * Get subscription details with delivery statistics and failure rate.
   */
  async getStatus(id: string): Promise<WebhookSubscriptionStatus> {
    return this.client.get<WebhookSubscriptionStatus>(
      `/api/v1/webhooks/subscribe/${encodeURIComponent(id)}/status`,
    );
  }

  /**
   * List recent delivery attempts for a subscription.
   */
  async listDeliveries(id: string, limit?: number): Promise<WebhookDelivery[]> {
    const data = await this.client.get<{ deliveries: WebhookDelivery[] }>(
      `/api/v1/webhooks/subscribe/${encodeURIComponent(id)}/deliveries`,
      limit !== undefined ? { limit } : undefined,
    );
    return data.deliveries;
  }
}
