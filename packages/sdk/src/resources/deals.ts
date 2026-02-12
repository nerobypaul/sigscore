import type { HttpClient } from '../client.js';
import type {
  Deal,
  DealInput,
  DealQueryParams,
  PaginatedResponse,
} from '../types.js';

/**
 * CRUD operations for deals.
 */
export class DealsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List deals with optional filters and pagination.
   */
  async list(params?: DealQueryParams): Promise<PaginatedResponse<Deal>> {
    return this.client.get<PaginatedResponse<Deal>>(
      '/api/v1/deals',
      params as Record<string, unknown> | undefined,
    );
  }

  /**
   * Get a single deal by ID.
   */
  async get(id: string): Promise<Deal> {
    return this.client.get<Deal>(
      `/api/v1/deals/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Create a new deal.
   */
  async create(data: DealInput): Promise<Deal> {
    return this.client.post<Deal>('/api/v1/deals', data);
  }

  /**
   * Update an existing deal. Only provided fields are changed.
   */
  async update(id: string, data: Partial<DealInput>): Promise<Deal> {
    return this.client.put<Deal>(
      `/api/v1/deals/${encodeURIComponent(id)}`,
      data,
    );
  }

  /**
   * Delete a deal by ID.
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(
      `/api/v1/deals/${encodeURIComponent(id)}`,
    );
  }
}
