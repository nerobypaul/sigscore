import type { HttpClient } from '../client.js';
import type {
  AccountBrief,
  AiConfig,
  AiConfigUpdate,
  EnrichedContact,
  SuggestedAction,
} from '../types.js';

/**
 * AI-powered intelligence: account briefs, next-best-actions, and contact enrichment.
 */
export class AiResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Get the cached AI brief for an account.
   */
  async getBrief(accountId: string): Promise<AccountBrief> {
    return this.client.get<AccountBrief>(
      `/api/v1/ai/brief/${encodeURIComponent(accountId)}`,
    );
  }

  /**
   * Generate (or regenerate) an AI brief for an account.
   */
  async generateBrief(accountId: string): Promise<AccountBrief> {
    return this.client.post<AccountBrief>(
      `/api/v1/ai/brief/${encodeURIComponent(accountId)}`,
    );
  }

  /**
   * Get AI-suggested next-best-actions for an account.
   */
  async suggestActions(accountId: string): Promise<SuggestedAction[]> {
    const data = await this.client.post<{ actions: SuggestedAction[] }>(
      `/api/v1/ai/suggest/${encodeURIComponent(accountId)}`,
    );
    return data.actions;
  }

  /**
   * Enrich a contact with AI-gathered intelligence.
   */
  async enrichContact(contactId: string): Promise<EnrichedContact> {
    return this.client.post<EnrichedContact>(
      `/api/v1/ai/enrich/${encodeURIComponent(contactId)}`,
    );
  }

  /**
   * Get the current AI configuration (provider, enabled status, etc.).
   */
  async getConfig(): Promise<AiConfig> {
    return this.client.get<AiConfig>('/api/v1/ai/config');
  }

  /**
   * Update the AI configuration (e.g. set the provider API key).
   */
  async updateConfig(config: AiConfigUpdate): Promise<AiConfig> {
    return this.client.put<AiConfig>('/api/v1/ai/config/api-key', config);
  }
}
