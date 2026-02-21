import { HttpClient } from './client.js';
import { SignalsResource } from './resources/signals.js';
import { ContactsResource } from './resources/contacts.js';
import { CompaniesResource } from './resources/companies.js';
import { DealsResource } from './resources/deals.js';
import { ScoresResource } from './resources/scores.js';
import { AiResource } from './resources/ai.js';
import { WebhooksResource } from './resources/webhooks.js';
import { AlertsResource } from './resources/alerts.js';
import { ScoringResource } from './resources/scoring.js';
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
 *
 * // Generate an AI brief
 * const brief = await ds.ai.generateBrief('account-id');
 *
 * // Subscribe to webhook events
 * const hook = await ds.webhooks.create({
 *   targetUrl: 'https://example.com/hook',
 *   event: 'score.changed',
 * });
 *
 * // Create an alert rule
 * const rule = await ds.alerts.create({
 *   name: 'Hot score drop',
 *   triggerType: 'score_drop',
 *   conditions: { dropPercent: 20, withinDays: 7 },
 *   channels: { inApp: true, email: false, slack: false },
 * });
 *
 * // Update scoring config
 * const config = await ds.scoring.getConfig();
 * ```
 */
export class Sigscore {
  public readonly signals: SignalsResource;
  public readonly contacts: ContactsResource;
  public readonly companies: CompaniesResource;
  public readonly deals: DealsResource;
  public readonly scores: ScoresResource;
  public readonly ai: AiResource;
  public readonly webhooks: WebhooksResource;
  public readonly alerts: AlertsResource;
  public readonly scoring: ScoringResource;

  constructor(options: SigscoreOptions) {
    const client = new HttpClient(options);

    this.signals = new SignalsResource(client);
    this.contacts = new ContactsResource(client);
    this.companies = new CompaniesResource(client);
    this.deals = new DealsResource(client);
    this.scores = new ScoresResource(client);
    this.ai = new AiResource(client);
    this.webhooks = new WebhooksResource(client);
    this.alerts = new AlertsResource(client);
    this.scoring = new ScoringResource(client);
  }
}

// Re-export everything consumers might need
export * from './types.js';
export { SigscoreError } from './errors.js';
