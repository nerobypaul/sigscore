import type { HttpClient } from '../client.js';
import type {
  Contact,
  ContactInput,
  ContactQueryParams,
  PaginatedResponse,
} from '../types.js';

/**
 * CRUD operations for contacts.
 */
export class ContactsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List contacts with optional search and pagination.
   */
  async list(params?: ContactQueryParams): Promise<PaginatedResponse<Contact>> {
    return this.client.get<PaginatedResponse<Contact>>(
      '/api/v1/contacts',
      params as Record<string, unknown> | undefined,
    );
  }

  /**
   * Get a single contact by ID.
   */
  async get(id: string): Promise<Contact> {
    return this.client.get<Contact>(
      `/api/v1/contacts/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Create a new contact.
   */
  async create(data: ContactInput): Promise<Contact> {
    return this.client.post<Contact>('/api/v1/contacts', data);
  }

  /**
   * Update an existing contact. Only provided fields are changed.
   */
  async update(id: string, data: Partial<ContactInput>): Promise<Contact> {
    return this.client.put<Contact>(
      `/api/v1/contacts/${encodeURIComponent(id)}`,
      data,
    );
  }

  /**
   * Delete a contact by ID.
   */
  async delete(id: string): Promise<void> {
    await this.client.delete<void>(
      `/api/v1/contacts/${encodeURIComponent(id)}`,
    );
  }
}
