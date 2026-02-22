# @sigscore/node

[![npm version](https://img.shields.io/npm/v/@sigscore/node.svg)](https://www.npmjs.com/package/@sigscore/node)
[![license](https://img.shields.io/npm/l/@sigscore/node.svg)](https://github.com/nerobypaul/sigscore/blob/main/LICENSE)

Official Node.js SDK for the [Sigscore](https://sigscore.dev) API.

Zero dependencies. TypeScript-first. Works with any Node.js 18+ project.

## Install

```bash
npm install @sigscore/node
```

## Quick start

```ts
import { Sigscore } from '@sigscore/node';

const ds = new Sigscore({ apiKey: 'ds_live_xxxxxxxxxxxx' });

// Ingest a signal
await ds.signals.ingest({
  type: 'feature_used',
  sourceId: 'app',
  metadata: { feature: 'dashboard', action: 'viewed' },
});

// Batch ingest
const batch = await ds.signals.ingestBatch([
  { type: 'page_view', sourceId: 'web', metadata: { path: '/pricing' } },
  { type: 'api_call', sourceId: 'api', metadata: { endpoint: '/v1/users' } },
]);

// Get top-scoring accounts
const hot = await ds.scores.topAccounts({ limit: 10, tier: 'HOT' });
```

## Configuration

| Option    | Type     | Default                     | Description                                      |
| --------- | -------- | --------------------------- | ------------------------------------------------ |
| `apiKey`  | `string` | --                          | Required. Starts with `ds_live_` or `ds_test_`.  |
| `baseUrl` | `string` | `https://api.sigscore.dev` | Override the API base URL.                       |

## Resources

### `ds.signals`

| Method                                  | Description                              |
| --------------------------------------- | ---------------------------------------- |
| `ingest(signal)`                        | Ingest a single signal event.            |
| `ingestBatch(signals)`                  | Ingest multiple signals in one request.  |
| `list(params?)`                         | List signals with filters and pagination.|
| `getAccountSignals(accountId, params?)` | Get all signals for an account.          |
| `getTimeline(accountId)`                | Merged signal + activity timeline.       |

### `ds.contacts`

| Method              | Description                           |
| ------------------- | ------------------------------------- |
| `list(params?)`     | List contacts with search/pagination. |
| `get(id)`           | Get a contact by ID.                  |
| `create(data)`      | Create a new contact.                 |
| `update(id, data)`  | Partial update a contact.             |
| `delete(id)`        | Delete a contact.                     |

### `ds.companies`

| Method              | Description                            |
| ------------------- | -------------------------------------- |
| `list(params?)`     | List companies with search/pagination. |
| `get(id)`           | Get a company by ID.                   |
| `create(data)`      | Create a new company.                  |
| `update(id, data)`  | Partial update a company.              |
| `delete(id)`        | Delete a company.                      |

### `ds.deals`

| Method              | Description                          |
| ------------------- | ------------------------------------ |
| `list(params?)`     | List deals with filters/pagination.  |
| `get(id)`           | Get a deal by ID.                    |
| `create(data)`      | Create a new deal.                   |
| `update(id, data)`  | Partial update a deal.               |
| `delete(id)`        | Delete a deal.                       |

### `ds.scores`

| Method                    | Description                               |
| ------------------------- | ----------------------------------------- |
| `getScore(accountId)`     | Get the current PQA score for an account. |
| `computeScore(accountId)` | Trigger a fresh score computation.        |
| `topAccounts(params?)`    | Get top-scoring accounts by tier.         |

### `ds.ai`

AI-powered intelligence: account briefs, next-best-actions, and contact enrichment.

| Method                      | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `getBrief(accountId)`       | Get the cached AI brief for an account.           |
| `generateBrief(accountId)`  | Generate (or regenerate) an AI brief.             |
| `suggestActions(accountId)` | Get AI-suggested next-best-actions for an account.|
| `enrichContact(contactId)`  | Enrich a contact with AI-gathered intelligence.   |
| `getConfig()`               | Get the current AI configuration.                 |
| `updateConfig(config)`      | Update the AI configuration (e.g. provider key).  |

```ts
// Generate an AI brief for an account
const brief = await ds.ai.generateBrief('account-id');
console.log(brief.summary, brief.highlights);

// Get next-best-actions
const actions = await ds.ai.suggestActions('account-id');
actions.forEach((a) => console.log(a.priority, a.action));

// Enrich a contact
const enriched = await ds.ai.enrichContact('contact-id');
```

### `ds.webhooks`

Manage webhook subscriptions using the Zapier/Make REST Hook pattern. Payloads are HMAC-signed.

| Method                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `list()`                     | List all webhook subscriptions for the organization.   |
| `create(data)`               | Create a new webhook subscription.                     |
| `get(id)`                    | Get a single webhook subscription by ID.               |
| `update(id, data)`           | Update a subscription (toggle active status).          |
| `delete(id)`                 | Delete a webhook subscription.                         |
| `test(id)`                   | Send a test payload to verify the endpoint.            |
| `getStatus(id)`              | Get delivery statistics and failure rate.              |
| `listDeliveries(id, limit?)` | List recent delivery attempts for a subscription.      |

Supported events: `signal.created`, `contact.created`, `contact.updated`, `company.created`, `company.updated`, `deal.created`, `deal.updated`, `score.changed`.

```ts
// Subscribe to score changes
const hook = await ds.webhooks.create({
  targetUrl: 'https://example.com/hook',
  event: 'score.changed',
});

// Check delivery health
const status = await ds.webhooks.getStatus(hook.id);
console.log(status.deliveryStats.failureRate);

// Send a test payload
const test = await ds.webhooks.test(hook.id);
console.log(test.success, test.statusCode);
```

### `ds.alerts`

Manage account alert rules that fire on score changes, engagement drops, and other triggers.

| Method              | Description                                        |
| ------------------- | -------------------------------------------------- |
| `list()`            | List all alert rules for the organization.         |
| `create(data)`      | Create a new alert rule.                           |
| `get(id)`           | Get a single alert rule by ID.                     |
| `update(id, data)`  | Partial update an alert rule.                      |
| `delete(id)`        | Delete an alert rule.                              |
| `test(id)`          | Send a test alert to verify notification channels. |
| `history(params?)`  | Get recent alert firing history.                   |

Trigger types: `score_drop`, `score_rise`, `score_threshold`, `engagement_drop`, `new_hot_signal`, `account_inactive`.

```ts
// Alert when an account score drops >20% in 7 days
const rule = await ds.alerts.create({
  name: 'Hot score drop',
  triggerType: 'score_drop',
  conditions: { dropPercent: 20, withinDays: 7 },
  channels: { inApp: true, email: false, slack: false },
});

// Verify notification channels work
const test = await ds.alerts.test(rule.id);

// Paginate through alert history
const { history, hasMore } = await ds.alerts.history({ limit: 25 });
```

### `ds.scoring`

Configure scoring rules, tier thresholds, and recompute account scores.

| Method               | Description                                                    |
| -------------------- | -------------------------------------------------------------- |
| `getConfig()`        | Get the current scoring configuration (rules + thresholds).    |
| `updateConfig(config)` | Replace the entire scoring configuration.                   |
| `preview(config)`    | Preview how a config change would affect scores (dry run).     |
| `recompute(config?)` | Force-recompute all account scores. Optionally save new config.|
| `reset()`            | Reset scoring to platform defaults and recompute.              |

```ts
// Get current config
const config = await ds.scoring.getConfig();

// Preview the impact of raising the HOT threshold
config.tierThresholds.HOT = 80;
const previews = await ds.scoring.preview(config);
previews.forEach((p) =>
  console.log(p.accountId, p.currentTier, '->', p.previewTier),
);

// Apply and recompute
const { updated } = await ds.scoring.recompute(config);
console.log(`Recomputed ${updated} accounts`);
```

## Error handling

All API errors throw a `SigscoreError` with `status`, `code`, and `message` properties.

```ts
import { Sigscore, SigscoreError } from '@sigscore/node';

try {
  await ds.contacts.get('nonexistent');
} catch (err) {
  if (err instanceof SigscoreError) {
    console.error(err.status);  // 404
    console.error(err.message); // "Contact not found"
  }
}
```

## TypeScript

All request and response types are exported from the package entry point.

```ts
import type {
  Signal, SignalInput, Contact, ContactInput,
  Company, CompanyInput, Deal, DealInput,
  AccountScore, ScoreTier, PaginatedResponse,
  AccountBrief, SuggestedAction, EnrichedContact,
  AiConfig, AiConfigUpdate,
  WebhookSubscription, WebhookSubscriptionInput,
  WebhookEventType, WebhookDelivery, WebhookTestResult,
  AlertRule, AlertRuleInput, AlertTriggerType,
  AlertChannels, AlertConditions, AlertHistoryResponse,
  ScoringConfig, ScoringRule, TierThresholds,
  ScorePreview, RecomputeResult,
} from '@sigscore/node';
```

## Documentation

Full API reference and guides at [sigscore.dev/developers](https://sigscore.dev/developers).

## License

MIT
