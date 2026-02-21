import { HttpClient } from './client.js';
import { SignalsResource } from './resources/signals.js';
import { ContactsResource } from './resources/contacts.js';
import { CompaniesResource } from './resources/companies.js';
import { DealsResource } from './resources/deals.js';
import { ScoresResource } from './resources/scores.js';
import type { SigscoreOptions } from './types.js';

/**
 * Sigscore Node.js SDK client.
 *
 * @example
 * ```ts
 * import { Sigscore } from '@sigscore/node';
 *
 * const ds = new Sigscore({ apiKey: 'ds_live_xxxxxxxxxxxx' });
 *
 * // Ingest a signal
 * await ds.signals.ingest({
 *   type: 'feature_used',
 *   sourceId: 'app',
 *   metadata: { feature: 'dashboard', action: 'viewed' },
 * });
 *
 * // Query top accounts
 * const top = await ds.scores.topAccounts({ limit: 10, tier: 'HOT' });
 * ```
 */
export class Sigscore {
  public readonly signals: SignalsResource;
  public readonly contacts: ContactsResource;
  public readonly companies: CompaniesResource;
  public readonly deals: DealsResource;
  public readonly scores: ScoresResource;

  constructor(options: SigscoreOptions) {
    const client = new HttpClient(options);

    this.signals = new SignalsResource(client);
    this.contacts = new ContactsResource(client);
    this.companies = new CompaniesResource(client);
    this.deals = new DealsResource(client);
    this.scores = new ScoresResource(client);
  }
}

// Re-export everything consumers might need
export * from './types.js';
export { SigscoreError } from './errors.js';
