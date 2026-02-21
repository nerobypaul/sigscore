import { SigscoreError } from './errors.js';
import type { SigscoreOptions } from './types.js';

const DEFAULT_BASE_URL = 'https://api.sigscore.dev';

/**
 * Low-level HTTP client used internally by every resource class.
 *
 * Uses the native `fetch` API available in Node 18+.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: SigscoreOptions) {
    if (!options.apiKey) {
      throw new SigscoreError('apiKey is required', 0, 'MISSING_API_KEY');
    }

    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  // ---------------------------------------------------------------------------
  // Public request helpers
  // ---------------------------------------------------------------------------

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>(url, { method: 'DELETE' });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
      const body = await response.text();
      let message = `Sigscore API error: ${response.status} ${response.statusText}`;
      let code: string | undefined;

      try {
        const parsed = JSON.parse(body) as { message?: string; error?: string; code?: string };
        message = parsed.message ?? parsed.error ?? message;
        code = parsed.code;
      } catch {
        // body is not JSON — use the default message
      }

      throw new SigscoreError(message, response.status, code);
    }

    // 204 No Content — nothing to parse
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}
