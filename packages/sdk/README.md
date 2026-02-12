# @devsignal/node

Official Node.js SDK for the DevSignal API. Zero dependencies -- uses native `fetch` (Node 18+).

## Install

```bash
npm install @devsignal/node
```

## Quick start

```typescript
import { DevSignal } from '@devsignal/node';

const ds = new DevSignal({
  apiKey: 'ds_live_xxxxxxxxxxxx',
  // baseUrl: 'https://api.devsignal.dev', // optional
});
```

## Signals

```typescript
// Ingest a single signal
const signal = await ds.signals.ingest({
  type: 'feature_used',
  sourceId: 'my-app',
  metadata: { feature: 'dashboard', action: 'viewed' },
  actorEmail: 'user@example.com',
});

// Batch ingest
const batch = await ds.signals.ingestBatch([
  { type: 'page_view', sourceId: 'web', metadata: { path: '/pricing' } },
  { type: 'api_call',  sourceId: 'api', metadata: { endpoint: '/v1/users' } },
]);
console.log(`Processed: ${batch.processed}, Failed: ${batch.failed}`);

// List signals with filters
const signals = await ds.signals.list({
  type: 'feature_used',
  from: '2025-01-01',
  to: '2025-12-31',
  page: 1,
  limit: 50,
});

// Account signals & timeline
const accountSignals = await ds.signals.getAccountSignals('acct_123');
const timeline = await ds.signals.getTimeline('acct_123');
```

## Contacts

```typescript
// Create
const contact = await ds.contacts.create({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  title: 'CTO',
  companyId: 'comp_456',
});

// List with search
const contacts = await ds.contacts.list({ search: 'jane', page: 1, limit: 20 });

// Get, update, delete
const fetched = await ds.contacts.get('contact_789');
const updated = await ds.contacts.update('contact_789', { title: 'VP Engineering' });
await ds.contacts.delete('contact_789');
```

## Companies

```typescript
const company = await ds.companies.create({
  name: 'Acme Inc',
  domain: 'acme.com',
  industry: 'SaaS',
  size: 'MEDIUM',
});

const companies = await ds.companies.list({ search: 'acme', industry: 'SaaS' });
const fetched = await ds.companies.get('comp_456');
const updated = await ds.companies.update('comp_456', { size: 'LARGE' });
await ds.companies.delete('comp_456');
```

## Deals

```typescript
const deal = await ds.deals.create({
  title: 'Acme Enterprise Plan',
  amount: 50000,
  currency: 'USD',
  stage: 'SALES_QUALIFIED',
  companyId: 'comp_456',
  contactId: 'contact_789',
});

const deals = await ds.deals.list({ stage: 'NEGOTIATION', limit: 10 });
const updated = await ds.deals.update(deal.id, { stage: 'CLOSED_WON' });
await ds.deals.delete(deal.id);
```

## Scores

```typescript
// Get current PQA score for an account
const score = await ds.scores.getScore('acct_123');
console.log(`Score: ${score.score}, Tier: ${score.tier}, Trend: ${score.trend}`);

// Force a fresh score computation
const fresh = await ds.scores.computeScore('acct_123');

// Get top accounts
const topAccounts = await ds.scores.topAccounts({ limit: 25, tier: 'HOT' });
```

## Error handling

```typescript
import { DevSignal, DevSignalError } from '@devsignal/node';

try {
  await ds.contacts.get('nonexistent');
} catch (err) {
  if (err instanceof DevSignalError) {
    console.error(`API error ${err.status}: ${err.message}`);
    console.error(`Error code: ${err.code}`);
  }
}
```

## Types

All request/response types are exported for use in your own code:

```typescript
import type {
  Signal,
  SignalInput,
  Contact,
  ContactInput,
  Company,
  CompanyInput,
  Deal,
  DealInput,
  DealStage,
  AccountScore,
  ScoreTier,
  ScoreTrend,
  PaginatedResponse,
  ListParams,
} from '@devsignal/node';
```

## License

MIT
