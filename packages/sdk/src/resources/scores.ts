import type { HttpClient } from '../client.js';
import type { AccountScore, TopAccountsParams } from '../types.js';

/**
 * Query and compute PQA (Product-Qualified Account) scores.
 */
export class ScoresResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Retrieve the current score for an account.
   */
  async getScore(accountId: string): Promise<AccountScore> {
    return this.client.get<AccountScore>(
      `/api/v1/signals/accounts/${encodeURIComponent(accountId)}/score`,
    );
  }

  /**
   * Trigger a fresh score computation for an account.
   */
  async computeScore(accountId: string): Promise<AccountScore> {
    return this.client.post<AccountScore>(
      `/api/v1/signals/accounts/${encodeURIComponent(accountId)}/score`,
    );
  }

  /**
   * Get the top-scoring accounts, optionally filtered by tier.
   */
  async topAccounts(params?: TopAccountsParams): Promise<AccountScore[]> {
    const data = await this.client.get<{ accounts: AccountScore[] }>(
      '/api/v1/signals/accounts/top',
      params as Record<string, unknown> | undefined,
    );
    return data.accounts;
  }
}
