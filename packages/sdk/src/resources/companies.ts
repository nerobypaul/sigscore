import type { HttpClient } from '../client.js';
import type {
  Company,
  CompanyInput,
  CompanyQueryParams,
  PaginatedResponse,
} from '../types.js';

/**
 * CRUD operations for companies (called "accounts" in some API docs).
 */
export class CompaniesResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List companies with optional search and pagination.
   */
  async list(params?: CompanyQueryParams): Promise<PaginatedResponse<Company>> {
    return this.client.get<PaginatedResponse<Company>>(
      '/api/v1/companies',
      params as Record<string, unknown> | undefined,
    );
  }

  /**
   * Get a single company by ID.
   */
  async get(id: string): Promise<Company> {
    return this.client.get<Company>(
      `/api/v1/companies/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Create a new company.
   */
  async create(data: CompanyInput): Promise<Company> {
    return this.client.post<Company>('/api/v1/companies', data);
  }

  /**
   * Update an existing company. Only provided fields are changed.
   */
  async update(id: string, data: Partial<CompanyInput>): Promise<Company> {
    return this.client.put<Company>(
      `/api/v1/companies/${encodeURIComponent(id)}`,
      data,
    );
  }

  /**
   * Delete a company by ID.
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(
      `/api/v1/companies/${encodeURIComponent(id)}`,
    );
  }
}
