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
} from '@sigscore/node';
```

## Documentation

Full API reference and guides at [sigscore.dev/developers](https://sigscore.dev/developers).

## License

MIT
