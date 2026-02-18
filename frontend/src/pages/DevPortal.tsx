import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = 'quickstart' | 'reference' | 'sdk' | 'webhooks' | 'auth';
type Language = 'node' | 'python' | 'curl' | 'go';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface Endpoint {
  method: HttpMethod;
  path: string;
  description: string;
  request?: string;
  response?: string;
  params?: Array<{ name: string; type: string; required: boolean; description: string }>;
}

interface EndpointCategory {
  id: string;
  label: string;
  icon: string;
  endpoints: Endpoint[];
}

interface SdkMethod {
  name: string;
  description: string;
  signature: string;
  example: string;
  returnType: string;
}

interface SdkResourceDoc {
  name: string;
  accessor: string;
  description: string;
  methods: SdkMethod[];
}

// ---------------------------------------------------------------------------
// Constants -- Language labels
// ---------------------------------------------------------------------------

const LANG_LABELS: Record<Language, string> = {
  node: 'Node.js',
  python: 'Python',
  curl: 'cURL',
  go: 'Go',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  POST: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/25',
};


// ---------------------------------------------------------------------------
// API Reference Data
// ---------------------------------------------------------------------------

const API_CATEGORIES: EndpointCategory[] = [
  {
    id: 'signals',
    label: 'Signals',
    icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
    endpoints: [
      {
        method: 'POST',
        path: '/api/v1/signals',
        description: 'Ingest a single signal event',
        request: JSON.stringify({
          sourceId: 'github-app',
          type: 'repo_clone',
          actorId: 'contact_abc123',
          metadata: { repo: 'acme/sdk', branch: 'main' },
        }, null, 2),
        response: JSON.stringify({
          id: 'sig_abc123',
          sourceId: 'github-app',
          type: 'repo_clone',
          actorId: 'contact_abc123',
          metadata: { repo: 'acme/sdk', branch: 'main' },
          timestamp: '2026-02-14T10:30:00Z',
          createdAt: '2026-02-14T10:30:00Z',
        }, null, 2),
        params: [
          { name: 'sourceId', type: 'string', required: true, description: 'Identifier for the signal source (e.g. github-app, npm, web-app)' },
          { name: 'type', type: 'string', required: true, description: 'Signal type (e.g. repo_clone, package_install, feature_used)' },
          { name: 'actorId', type: 'string', required: false, description: 'Contact ID of the actor' },
          { name: 'accountId', type: 'string', required: false, description: 'Company/account ID' },
          { name: 'anonymousId', type: 'string', required: false, description: 'Anonymous identifier for unresolved users' },
          { name: 'metadata', type: 'object', required: false, description: 'Arbitrary key-value metadata' },
          { name: 'idempotencyKey', type: 'string', required: false, description: 'Prevents duplicate processing' },
          { name: 'timestamp', type: 'ISO 8601', required: false, description: 'Event timestamp (defaults to now)' },
        ],
      },
      {
        method: 'POST',
        path: '/api/v1/signals/batch',
        description: 'Ingest up to 1,000 signals in a single request',
        request: JSON.stringify({
          signals: [
            { sourceId: 'web-app', type: 'feature_used', actorId: 'c_1', metadata: { feature: 'dashboard' } },
            { sourceId: 'web-app', type: 'feature_used', actorId: 'c_2', metadata: { feature: 'api-keys' } },
          ],
        }, null, 2),
        response: JSON.stringify({
          results: [
            { success: true, signal: { id: 'sig_1' } },
            { success: true, signal: { id: 'sig_2' } },
          ],
          summary: { total: 2, succeeded: 2, failed: 0 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/api/v1/signals',
        description: 'Query signals with filters and pagination',
        response: JSON.stringify({
          data: [
            { id: 'sig_abc123', type: 'repo_clone', sourceId: 'github-app', timestamp: '2026-02-14T10:30:00Z' },
          ],
          pagination: { page: 1, limit: 20, total: 142, totalPages: 8 },
        }, null, 2),
        params: [
          { name: 'type', type: 'string', required: false, description: 'Filter by signal type' },
          { name: 'accountId', type: 'string', required: false, description: 'Filter by account' },
          { name: 'from', type: 'ISO 8601', required: false, description: 'Start of date range' },
          { name: 'to', type: 'ISO 8601', required: false, description: 'End of date range' },
          { name: 'page', type: 'integer', required: false, description: 'Page number (default: 1)' },
          { name: 'limit', type: 'integer', required: false, description: 'Items per page (default: 20, max: 100)' },
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/signals/accounts/top',
        description: 'Get top accounts ranked by PQA score',
        response: JSON.stringify([
          { accountId: 'comp_1', score: 92, tier: 'HOT', trend: 'RISING', signalCount: 847, userCount: 12 },
          { accountId: 'comp_2', score: 78, tier: 'WARM', trend: 'STABLE', signalCount: 312, userCount: 5 },
        ], null, 2),
      },
      {
        method: 'GET',
        path: '/api/v1/signals/accounts/:accountId/timeline',
        description: 'Get merged signal + activity timeline for an account',
      },
      {
        method: 'GET',
        path: '/api/v1/signals/accounts/:accountId/score',
        description: 'Retrieve the current PQA score for an account',
        response: JSON.stringify({
          id: 'score_1',
          accountId: 'comp_abc',
          score: 85,
          tier: 'HOT',
          trend: 'RISING',
          factors: [
            { name: 'signal_velocity', weight: 0.3, value: 0.9, description: 'High recent signal activity' },
            { name: 'user_breadth', weight: 0.25, value: 0.7, description: 'Multiple users from same org' },
          ],
          signalCount: 423,
          userCount: 8,
          computedAt: '2026-02-14T10:00:00Z',
        }, null, 2),
      },
      {
        method: 'POST',
        path: '/api/v1/signals/accounts/:accountId/score',
        description: 'Trigger a fresh PQA score computation',
      },
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/contacts',
        description: 'List contacts with search and pagination',
        params: [
          { name: 'search', type: 'string', required: false, description: 'Full-text search across name, email' },
          { name: 'companyId', type: 'string', required: false, description: 'Filter by company' },
          { name: 'page', type: 'integer', required: false, description: 'Page number (default: 1)' },
          { name: 'limit', type: 'integer', required: false, description: 'Items per page (default: 20)' },
        ],
        response: JSON.stringify({
          data: [
            { id: 'ct_1', firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.com', title: 'Staff Engineer', github: 'janedoe' },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }, null, 2),
      },
      {
        method: 'GET',
        path: '/api/v1/contacts/:id',
        description: 'Get a single contact with company, deals, and tags',
      },
      {
        method: 'POST',
        path: '/api/v1/contacts',
        description: 'Create a new contact',
        request: JSON.stringify({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@acme.com',
          title: 'Staff Engineer',
          github: 'janedoe',
          companyId: 'comp_abc123',
        }, null, 2),
      },
      { method: 'PUT', path: '/api/v1/contacts/:id', description: 'Update an existing contact' },
      { method: 'DELETE', path: '/api/v1/contacts/:id', description: 'Delete a contact' },
    ],
  },
  {
    id: 'companies',
    label: 'Companies',
    icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
    endpoints: [
      { method: 'GET', path: '/api/v1/companies', description: 'List companies with search and industry filter' },
      { method: 'GET', path: '/api/v1/companies/:id', description: 'Get company details with contacts, deals, tags' },
      {
        method: 'POST',
        path: '/api/v1/companies',
        description: 'Create a new company',
        request: JSON.stringify({
          name: 'Acme Inc',
          domain: 'acme.com',
          industry: 'Developer Tools',
          size: 'STARTUP',
          githubOrg: 'acme',
        }, null, 2),
      },
      { method: 'PUT', path: '/api/v1/companies/:id', description: 'Update a company' },
      { method: 'DELETE', path: '/api/v1/companies/:id', description: 'Delete a company' },
    ],
  },
  {
    id: 'deals',
    label: 'Deals',
    icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
    endpoints: [
      { method: 'GET', path: '/api/v1/deals', description: 'List deals with stage, owner, company filters' },
      { method: 'GET', path: '/api/v1/deals/:id', description: 'Get deal with contact, company, owner, activities' },
      {
        method: 'POST',
        path: '/api/v1/deals',
        description: 'Create a deal in the PLG pipeline',
        request: JSON.stringify({
          title: 'Acme Pro Upgrade',
          amount: 9500,
          currency: 'USD',
          stage: 'SALES_QUALIFIED',
          companyId: 'comp_abc123',
          contactId: 'ct_1',
        }, null, 2),
      },
      { method: 'PUT', path: '/api/v1/deals/:id', description: 'Update deal stage, amount, or metadata' },
      { method: 'DELETE', path: '/api/v1/deals/:id', description: 'Delete a deal' },
    ],
  },
  {
    id: 'scores',
    label: 'Scores',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
    endpoints: [
      { method: 'GET', path: '/api/v1/signals/accounts/top', description: 'Get top-scoring accounts by PQA' },
      { method: 'GET', path: '/api/v1/signals/accounts/:accountId/score', description: 'Retrieve current PQA score' },
      { method: 'POST', path: '/api/v1/signals/accounts/:accountId/score', description: 'Recompute PQA score' },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    icon: 'M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/search?q=...',
        description: 'Global full-text search with weighted relevance scoring',
        params: [
          { name: 'q', type: 'string', required: true, description: 'Search query with prefix matching' },
          { name: 'type', type: 'string', required: false, description: 'Filter by entity type: contact, company, deal, signal' },
          { name: 'limit', type: 'integer', required: false, description: 'Max results (default: 20)' },
        ],
        response: JSON.stringify({
          results: [
            { type: 'contact', id: 'ct_1', title: 'Jane Doe', subtitle: 'jane@acme.com', score: 0.95 },
            { type: 'company', id: 'comp_1', title: 'Acme Inc', subtitle: 'acme.com', score: 0.82 },
          ],
          total: 2,
        }, null, 2),
      },
    ],
  },
  {
    id: 'workflows',
    label: 'Workflows',
    icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z',
    endpoints: [
      { method: 'GET', path: '/api/v1/workflows', description: 'List all workflow automations' },
      {
        method: 'POST',
        path: '/api/v1/workflows',
        description: 'Create a workflow with trigger and actions',
        request: JSON.stringify({
          name: 'Hot Lead Slack Alert',
          trigger: 'score_changed',
          triggerConfig: { tier: 'HOT' },
          actions: [
            { type: 'send_slack', config: { channel: '#sales', message: 'New hot lead: {{account.name}}' } },
          ],
        }, null, 2),
      },
      { method: 'PUT', path: '/api/v1/workflows/:id', description: 'Update a workflow' },
      { method: 'DELETE', path: '/api/v1/workflows/:id', description: 'Delete a workflow' },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
    endpoints: [
      { method: 'GET', path: '/api/v1/webhooks', description: 'List webhook endpoints with delivery counts' },
      {
        method: 'POST',
        path: '/api/v1/webhooks',
        description: 'Register a new webhook endpoint (HTTPS only)',
        request: JSON.stringify({
          url: 'https://your-app.com/webhooks/devsignal',
          events: ['signal.created', 'deal.stage_changed', 'score.changed'],
        }, null, 2),
        response: JSON.stringify({
          id: 'wh_abc123',
          url: 'https://your-app.com/webhooks/devsignal',
          events: ['signal.created', 'deal.stage_changed', 'score.changed'],
          secret: 'whsec_xxxxxxxxxxxxxxxxxxxxxxxx',
          active: true,
          createdAt: '2026-02-14T10:00:00Z',
        }, null, 2),
      },
      { method: 'DELETE', path: '/api/v1/webhooks/:id', description: 'Delete a webhook endpoint' },
    ],
  },
];

// ---------------------------------------------------------------------------
// SDK Documentation Data
// ---------------------------------------------------------------------------

const SDK_RESOURCES: SdkResourceDoc[] = [
  {
    name: 'SignalsResource',
    accessor: 'ds.signals',
    description: 'Ingest and query product usage signals. Signals are the core of DevSignal\'s PLG intelligence.',
    methods: [
      {
        name: 'ingest',
        description: 'Ingest a single signal event.',
        signature: 'signals.ingest(signal: SignalInput): Promise<Signal>',
        returnType: 'Signal',
        example: `await ds.signals.ingest({
  type: 'feature_used',
  sourceId: 'web-app',
  metadata: { feature: 'dashboard', action: 'viewed' },
  actorId: 'contact_abc123',
});`,
      },
      {
        name: 'ingestBatch',
        description: 'Ingest up to 1,000 signals in a single request.',
        signature: 'signals.ingestBatch(signals: SignalInput[]): Promise<BatchIngestResult>',
        returnType: 'BatchIngestResult',
        example: `const result = await ds.signals.ingestBatch([
  { sourceId: 'web-app', type: 'page_view', metadata: { path: '/docs' } },
  { sourceId: 'web-app', type: 'feature_used', metadata: { feature: 'api-keys' } },
]);
console.log(result.summary); // { total: 2, succeeded: 2, failed: 0 }`,
      },
      {
        name: 'list',
        description: 'List signals with optional filters and pagination.',
        signature: 'signals.list(params?: SignalQueryParams): Promise<PaginatedResponse<Signal>>',
        returnType: 'PaginatedResponse<Signal>',
        example: `const signals = await ds.signals.list({
  type: 'repo_clone',
  from: '2026-01-01T00:00:00Z',
  limit: 50,
});`,
      },
      {
        name: 'getTimeline',
        description: 'Get the merged timeline (signals + activities) for an account.',
        signature: 'signals.getTimeline(accountId: string): Promise<Array<Signal | Activity>>',
        returnType: 'Array<Signal | Activity>',
        example: `const timeline = await ds.signals.getTimeline('comp_abc123');`,
      },
    ],
  },
  {
    name: 'ContactsResource',
    accessor: 'ds.contacts',
    description: 'Full CRUD operations for managing developer contacts.',
    methods: [
      {
        name: 'list',
        description: 'List contacts with optional search and pagination.',
        signature: 'contacts.list(params?: ContactQueryParams): Promise<PaginatedResponse<Contact>>',
        returnType: 'PaginatedResponse<Contact>',
        example: `const contacts = await ds.contacts.list({
  search: 'jane',
  companyId: 'comp_abc',
  page: 1,
  limit: 20,
});`,
      },
      {
        name: 'get',
        description: 'Get a single contact by ID.',
        signature: 'contacts.get(id: string): Promise<Contact>',
        returnType: 'Contact',
        example: `const contact = await ds.contacts.get('ct_abc123');`,
      },
      {
        name: 'create',
        description: 'Create a new contact.',
        signature: 'contacts.create(data: ContactInput): Promise<Contact>',
        returnType: 'Contact',
        example: `const contact = await ds.contacts.create({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@acme.com',
  title: 'Staff Engineer',
  github: 'janedoe',
});`,
      },
      {
        name: 'update',
        description: 'Update an existing contact. Only provided fields are changed.',
        signature: 'contacts.update(id: string, data: Partial<ContactInput>): Promise<Contact>',
        returnType: 'Contact',
        example: `const updated = await ds.contacts.update('ct_abc123', {
  title: 'Principal Engineer',
});`,
      },
      {
        name: 'delete',
        description: 'Delete a contact by ID.',
        signature: 'contacts.delete(id: string): Promise<void>',
        returnType: 'void',
        example: `await ds.contacts.delete('ct_abc123');`,
      },
    ],
  },
  {
    name: 'CompaniesResource',
    accessor: 'ds.companies',
    description: 'CRUD operations for companies (accounts). Core entity for PLG signal tracking.',
    methods: [
      {
        name: 'list',
        description: 'List companies with optional search and pagination.',
        signature: 'companies.list(params?: CompanyQueryParams): Promise<PaginatedResponse<Company>>',
        returnType: 'PaginatedResponse<Company>',
        example: `const companies = await ds.companies.list({ search: 'acme' });`,
      },
      {
        name: 'get',
        description: 'Get a single company by ID.',
        signature: 'companies.get(id: string): Promise<Company>',
        returnType: 'Company',
        example: `const company = await ds.companies.get('comp_abc123');`,
      },
      {
        name: 'create',
        description: 'Create a new company.',
        signature: 'companies.create(data: CompanyInput): Promise<Company>',
        returnType: 'Company',
        example: `const company = await ds.companies.create({
  name: 'Acme Inc',
  domain: 'acme.com',
  industry: 'Developer Tools',
  size: 'STARTUP',
  githubOrg: 'acme',
});`,
      },
      {
        name: 'update',
        description: 'Update a company. Only provided fields are changed.',
        signature: 'companies.update(id: string, data: Partial<CompanyInput>): Promise<Company>',
        returnType: 'Company',
        example: `const updated = await ds.companies.update('comp_abc', { size: 'MEDIUM' });`,
      },
      {
        name: 'delete',
        description: 'Delete a company by ID.',
        signature: 'companies.delete(id: string): Promise<void>',
        returnType: 'void',
        example: `await ds.companies.delete('comp_abc123');`,
      },
    ],
  },
  {
    name: 'DealsResource',
    accessor: 'ds.deals',
    description: 'PLG-native deal pipeline with stages from ANONYMOUS_USAGE through CLOSED_WON.',
    methods: [
      {
        name: 'list',
        description: 'List deals with optional filters and pagination.',
        signature: 'deals.list(params?: DealQueryParams): Promise<PaginatedResponse<Deal>>',
        returnType: 'PaginatedResponse<Deal>',
        example: `const deals = await ds.deals.list({ stage: 'SALES_QUALIFIED' });`,
      },
      {
        name: 'get',
        description: 'Get a single deal by ID.',
        signature: 'deals.get(id: string): Promise<Deal>',
        returnType: 'Deal',
        example: `const deal = await ds.deals.get('deal_abc123');`,
      },
      {
        name: 'create',
        description: 'Create a deal in the PLG pipeline.',
        signature: 'deals.create(data: DealInput): Promise<Deal>',
        returnType: 'Deal',
        example: `const deal = await ds.deals.create({
  title: 'Acme Pro Upgrade',
  amount: 9500,
  stage: 'SALES_QUALIFIED',
  companyId: 'comp_abc',
});`,
      },
      {
        name: 'update',
        description: 'Update a deal.',
        signature: 'deals.update(id: string, data: Partial<DealInput>): Promise<Deal>',
        returnType: 'Deal',
        example: `const updated = await ds.deals.update('deal_abc', {
  stage: 'CLOSED_WON',
  amount: 12000,
});`,
      },
      {
        name: 'delete',
        description: 'Delete a deal by ID.',
        signature: 'deals.delete(id: string): Promise<void>',
        returnType: 'void',
        example: `await ds.deals.delete('deal_abc123');`,
      },
    ],
  },
  {
    name: 'ScoresResource',
    accessor: 'ds.scores',
    description: 'Query and compute PQA (Product-Qualified Account) scores.',
    methods: [
      {
        name: 'getScore',
        description: 'Retrieve the current PQA score for an account.',
        signature: 'scores.getScore(accountId: string): Promise<AccountScore>',
        returnType: 'AccountScore',
        example: `const score = await ds.scores.getScore('comp_abc123');
console.log(score.tier); // 'HOT' | 'WARM' | 'COLD' | 'INACTIVE'`,
      },
      {
        name: 'computeScore',
        description: 'Trigger a fresh score computation for an account.',
        signature: 'scores.computeScore(accountId: string): Promise<AccountScore>',
        returnType: 'AccountScore',
        example: `const fresh = await ds.scores.computeScore('comp_abc123');`,
      },
      {
        name: 'topAccounts',
        description: 'Get the top-scoring accounts, optionally filtered by tier.',
        signature: 'scores.topAccounts(params?: TopAccountsParams): Promise<AccountScore[]>',
        returnType: 'AccountScore[]',
        example: `const hot = await ds.scores.topAccounts({ limit: 10, tier: 'HOT' });`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Quick Start code samples per language
// ---------------------------------------------------------------------------

const QUICKSTART_INSTALL: Record<Language, string> = {
  node: 'npm install @devsignal/node',
  python: 'pip install devsignal',
  curl: '# No installation needed -- use curl directly',
  go: 'go get github.com/devsignal/devsignal-go',
};

const QUICKSTART_INIT: Record<Language, string> = {
  node: `import { DevSignal } from '@devsignal/node';

const ds = new DevSignal({
  apiKey: process.env.DEVSIGNAL_API_KEY,  // ds_live_xxx...
});`,
  python: `from devsignal import DevSignal

ds = DevSignal(api_key=os.environ["DEVSIGNAL_API_KEY"])`,
  curl: `# Set your API key as an environment variable
export DEVSIGNAL_API_KEY="ds_live_xxx..."
export DEVSIGNAL_ORG_ID="org_xxx..."`,
  go: `import "github.com/devsignal/devsignal-go"

ds := devsignal.NewClient(os.Getenv("DEVSIGNAL_API_KEY"))`,
};

const QUICKSTART_SIGNAL: Record<Language, string> = {
  node: `// Track a product usage signal
await ds.signals.ingest({
  type: 'feature_used',
  sourceId: 'web-app',
  metadata: {
    feature: 'dashboard',
    action: 'viewed',
    plan: 'pro',
  },
  actorId: 'contact_abc123',
});`,
  python: `# Track a product usage signal
ds.signals.ingest(
    type="feature_used",
    source_id="web-app",
    metadata={
        "feature": "dashboard",
        "action": "viewed",
        "plan": "pro",
    },
    actor_id="contact_abc123",
)`,
  curl: `curl -X POST https://devsignal.dev/api/v1/signals \\
  -H "Authorization: Bearer $DEVSIGNAL_API_KEY" \\
  -H "X-Organization-Id: $DEVSIGNAL_ORG_ID" \\
  -H "Content-Type: application/json" \\
  -d '{
    "type": "feature_used",
    "sourceId": "web-app",
    "metadata": {
      "feature": "dashboard",
      "action": "viewed",
      "plan": "pro"
    },
    "actorId": "contact_abc123"
  }'`,
  go: `// Track a product usage signal
err := ds.Signals.Ingest(ctx, &devsignal.SignalInput{
    Type:     "feature_used",
    SourceID: "web-app",
    Metadata: map[string]interface{}{
        "feature": "dashboard",
        "action":  "viewed",
        "plan":    "pro",
    },
    ActorID: "contact_abc123",
})`,
};

// ---------------------------------------------------------------------------
// Shared UI Components
// ---------------------------------------------------------------------------

function CodeBlock({
  code,
  language,
  className = '',
}: {
  code: string;
  language: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`relative rounded-lg overflow-hidden border border-gray-700/60 ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/90 border-b border-gray-700/50">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-700/50"
        >
          {copied ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed bg-[#0d1117]">
        <code className="text-gray-300 font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${METHOD_COLORS[method]}`}
      style={{ minWidth: '3.25rem' }}
    >
      {method}
    </span>
  );
}

function LanguageTabs({
  selected,
  onChange,
}: {
  selected: Language;
  onChange: (lang: Language) => void;
}) {
  const langs: Language[] = ['node', 'python', 'curl', 'go'];
  return (
    <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1">
      {langs.map((lang) => (
        <button
          key={lang}
          onClick={() => onChange(lang)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            selected === lang
              ? 'bg-gray-700 text-white'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
          }`}
        >
          {LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Quick Start
// ---------------------------------------------------------------------------

function QuickStartTab() {
  const [lang, setLang] = useState<Language>('node');
  const [keyRevealed, setKeyRevealed] = useState(false);
  const maskedKey = 'ds_live_xxxx...xxxx';
  const exampleKey = 'ds_live_a1b2c3d4e5f6g7h8i9j0';

  return (
    <div className="space-y-12">
      {/* Hero */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">Quick Start</h2>
        <p className="mt-3 text-gray-400 text-lg leading-relaxed max-w-2xl">
          Send your first product usage signal in under 60 seconds.
          Three steps to start tracking developer activity.
        </p>
      </div>

      {/* Language selector */}
      <LanguageTabs selected={lang} onChange={setLang} />

      {/* API Key display */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/30 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-200">Your API Key</h4>
            <p className="text-xs text-gray-500 mt-1">
              Create API keys in Settings or via the API Keys endpoint
            </p>
          </div>
          <button
            onClick={() => setKeyRevealed(!keyRevealed)}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 rounded-md border border-indigo-500/30 hover:border-indigo-500/50"
          >
            {keyRevealed ? 'Hide' : 'Reveal'}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <code className="text-sm font-mono text-indigo-400 bg-gray-900/60 px-3 py-1.5 rounded border border-gray-700/50 flex-1">
            {keyRevealed ? exampleKey : maskedKey}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(keyRevealed ? exampleKey : maskedKey)}
            className="text-gray-400 hover:text-white p-2 rounded hover:bg-gray-700/50 transition-colors"
            title="Copy"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-10">
        {/* Step 1 */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-sm font-bold">
              1
            </span>
            <h3 className="text-lg font-semibold text-white">Install the SDK</h3>
          </div>
          <CodeBlock code={QUICKSTART_INSTALL[lang]} language={lang === 'node' ? 'bash' : lang === 'python' ? 'bash' : lang === 'go' ? 'bash' : 'bash'} />
        </div>

        {/* Step 2 */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-sm font-bold">
              2
            </span>
            <h3 className="text-lg font-semibold text-white">Initialize the client</h3>
          </div>
          <CodeBlock code={QUICKSTART_INIT[lang]} language={LANG_LABELS[lang]} />
        </div>

        {/* Step 3 */}
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-sm font-bold">
              3
            </span>
            <h3 className="text-lg font-semibold text-white">Send your first signal</h3>
          </div>
          <CodeBlock code={QUICKSTART_SIGNAL[lang]} language={LANG_LABELS[lang]} />
        </div>
      </div>

      {/* Next steps */}
      <div className="rounded-lg border border-gray-700/60 bg-gray-800/20 p-6">
        <h4 className="text-sm font-semibold text-gray-200 mb-4">What happens next?</h4>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-lg bg-gray-900/50 border border-gray-700/40 p-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <h5 className="text-sm font-medium text-white">Identity Resolution</h5>
            <p className="text-xs text-gray-500 mt-1">Signals are automatically matched to contacts and accounts</p>
          </div>
          <div className="rounded-lg bg-gray-900/50 border border-gray-700/40 p-4">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
              </svg>
            </div>
            <h5 className="text-sm font-medium text-white">PQA Scoring</h5>
            <p className="text-xs text-gray-500 mt-1">Accounts are scored in real-time as signals arrive</p>
          </div>
          <div className="rounded-lg bg-gray-900/50 border border-gray-700/40 p-4">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <h5 className="text-sm font-medium text-white">Alerts & Workflows</h5>
            <p className="text-xs text-gray-500 mt-1">Triggers fire based on score changes and signal patterns</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: API Reference
// ---------------------------------------------------------------------------

function ApiReferenceTab() {
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('signals');
  const [searchTerm, setSearchTerm] = useState('');

  // Playground state
  const [playgroundEndpoint, setPlaygroundEndpoint] = useState<Endpoint | null>(null);
  const [playgroundBody, setPlaygroundBody] = useState('');
  const [playgroundResponse, setPlaygroundResponse] = useState('');
  const [playgroundLoading, setPlaygroundLoading] = useState(false);

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return API_CATEGORIES;
    const term = searchTerm.toLowerCase();
    return API_CATEGORIES.map((cat) => ({
      ...cat,
      endpoints: cat.endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(term) ||
          ep.description.toLowerCase().includes(term) ||
          ep.method.toLowerCase().includes(term),
      ),
    })).filter((cat) => cat.endpoints.length > 0);
  }, [searchTerm]);

  const currentCategory = filteredCategories.find((c) => c.id === selectedCategory) ?? filteredCategories[0];

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoint(expandedEndpoint === key ? null : key);
  };

  const openPlayground = (ep: Endpoint) => {
    setPlaygroundEndpoint(ep);
    setPlaygroundBody(ep.request ?? '');
    setPlaygroundResponse('');
  };

  const runPlayground = () => {
    setPlaygroundLoading(true);
    // Simulate API call
    setTimeout(() => {
      if (playgroundEndpoint?.response) {
        setPlaygroundResponse(playgroundEndpoint.response);
      } else {
        setPlaygroundResponse(JSON.stringify({ message: 'Success', status: 200 }, null, 2));
      }
      setPlaygroundLoading(false);
    }, 800);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">API Reference</h2>
        <p className="mt-3 text-gray-400 text-lg leading-relaxed max-w-2xl">
          Complete REST API documentation organized by resource. All endpoints accept and return JSON.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          placeholder="Search endpoints..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-gray-800/50 border border-gray-700/60 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40"
        />
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {filteredCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
              selectedCategory === cat.id
                ? 'bg-indigo-600/15 border-indigo-500/30 text-indigo-400'
                : 'bg-gray-800/30 border-gray-700/40 text-gray-400 hover:text-gray-200 hover:border-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
            </svg>
            {cat.label}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-500">
              {cat.endpoints.length}
            </span>
          </button>
        ))}
      </div>

      {/* Endpoints list */}
      {currentCategory && (
        <div className="space-y-3">
          {currentCategory.endpoints.map((ep, idx) => {
            const key = `${currentCategory.id}-${idx}`;
            const isExpanded = expandedEndpoint === key;

            return (
              <div key={key} className="rounded-lg border border-gray-700/50 overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => toggleEndpoint(key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-left"
                >
                  <MethodBadge method={ep.method} />
                  <code className="text-sm font-mono text-gray-200 flex-1">{ep.path}</code>
                  <span className="text-xs text-gray-500 hidden sm:block max-w-xs truncate">{ep.description}</span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-gray-700/40 bg-gray-900/30 p-5 space-y-5">
                    <p className="text-sm text-gray-400">{ep.description}</p>

                    {/* Parameters */}
                    {ep.params && ep.params.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">Parameters</h4>
                        <div className="border border-gray-700/40 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-800/50">
                                <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Name</th>
                                <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Type</th>
                                <th className="text-left text-xs font-medium text-gray-400 px-4 py-2 hidden sm:table-cell">Required</th>
                                <th className="text-left text-xs font-medium text-gray-400 px-4 py-2">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ep.params.map((param) => (
                                <tr key={param.name} className="border-t border-gray-700/30">
                                  <td className="px-4 py-2.5">
                                    <code className="text-xs font-mono text-indigo-400">{param.name}</code>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <span className="text-xs text-gray-500 font-mono">{param.type}</span>
                                  </td>
                                  <td className="px-4 py-2.5 hidden sm:table-cell">
                                    {param.required ? (
                                      <span className="text-xs text-amber-400 font-medium">required</span>
                                    ) : (
                                      <span className="text-xs text-gray-600">optional</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-gray-400">{param.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Request body */}
                    {ep.request && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">Request Body</h4>
                        <CodeBlock code={ep.request} language="json" />
                      </div>
                    )}

                    {/* Response */}
                    {ep.response && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">Response</h4>
                        <CodeBlock code={ep.response} language="json" />
                      </div>
                    )}

                    {/* Try it button */}
                    <button
                      onClick={() => openPlayground(ep)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-400 border border-indigo-500/30 rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                      </svg>
                      Try it
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Playground modal */}
      {playgroundEndpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
              <div className="flex items-center gap-3">
                <MethodBadge method={playgroundEndpoint.method} />
                <code className="text-sm font-mono text-gray-200">{playgroundEndpoint.path}</code>
              </div>
              <button
                onClick={() => setPlaygroundEndpoint(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {(playgroundEndpoint.method === 'POST' || playgroundEndpoint.method === 'PUT') && (
                <div>
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-2">
                    Request Body
                  </label>
                  <textarea
                    value={playgroundBody}
                    onChange={(e) => setPlaygroundBody(e.target.value)}
                    className="w-full h-40 bg-[#0d1117] border border-gray-700/60 rounded-lg p-4 text-sm font-mono text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                    spellCheck={false}
                  />
                </div>
              )}

              <button
                onClick={runPlayground}
                disabled={playgroundLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {playgroundLoading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                    </svg>
                    Send Request
                  </>
                )}
              </button>

              {playgroundResponse && (
                <div>
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-2">
                    Response
                  </label>
                  <CodeBlock code={playgroundResponse} language="json" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: SDK Documentation
// ---------------------------------------------------------------------------

function SdkTab() {
  const [expandedResource, setExpandedResource] = useState<string>('SignalsResource');

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">SDK Documentation</h2>
        <p className="mt-3 text-gray-400 text-lg leading-relaxed max-w-2xl">
          The <code className="text-indigo-400 text-sm bg-gray-800 px-1.5 py-0.5 rounded">@devsignal/node</code> TypeScript
          SDK provides a type-safe, zero-dependency client for the DevSignal API.
        </p>
      </div>

      {/* Installation */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Installation</h3>
        <CodeBlock code="npm install @devsignal/node" language="bash" />
      </div>

      {/* Configuration */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Configuration</h3>
        <CodeBlock
          code={`import { DevSignal } from '@devsignal/node';

const ds = new DevSignal({
  apiKey: 'ds_live_xxxxxxxxxxxx',   // Required. Your API key.
  baseUrl: 'https://devsignal.dev', // Optional. Defaults to https://api.devsignal.dev
});`}
          language="typescript"
        />

        <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-5">
          <h4 className="text-sm font-semibold text-gray-200 mb-3">DevSignalOptions</h4>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono text-indigo-400 bg-gray-900/60 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">apiKey</code>
              <div>
                <span className="text-xs text-amber-400 font-medium">required</span>
                <span className="text-xs text-gray-500 ml-2">string</span>
                <p className="text-xs text-gray-400 mt-0.5">API key starting with ds_live_ or ds_test_</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono text-indigo-400 bg-gray-900/60 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">baseUrl</code>
              <div>
                <span className="text-xs text-gray-600 font-medium">optional</span>
                <span className="text-xs text-gray-500 ml-2">string</span>
                <p className="text-xs text-gray-400 mt-0.5">Base URL of the DevSignal API. Defaults to https://api.devsignal.dev</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resources */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Resources</h3>
        <p className="text-sm text-gray-400">
          The client exposes five resource namespaces: <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">signals</code>,{' '}
          <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">contacts</code>,{' '}
          <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">companies</code>,{' '}
          <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">deals</code>, and{' '}
          <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">scores</code>.
        </p>

        <div className="space-y-3">
          {SDK_RESOURCES.map((resource) => {
            const isExpanded = expandedResource === resource.name;

            return (
              <div key={resource.name} className="rounded-lg border border-gray-700/50 overflow-hidden">
                <button
                  onClick={() => setExpandedResource(isExpanded ? '' : resource.name)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-gray-800/30 hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div>
                    <code className="text-sm font-mono text-indigo-400">{resource.accessor}</code>
                    <p className="text-xs text-gray-500 mt-1">{resource.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] text-gray-500 bg-gray-700/50 px-2 py-0.5 rounded">
                      {resource.methods.length} methods
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-700/40 divide-y divide-gray-700/30">
                    {resource.methods.map((method) => (
                      <div key={method.name} className="p-5 space-y-3 bg-gray-900/20">
                        <div>
                          <code className="text-sm font-mono text-white">{method.signature}</code>
                          <p className="text-xs text-gray-400 mt-1">{method.description}</p>
                          <div className="mt-1.5">
                            <span className="text-[10px] text-gray-500">Returns:</span>{' '}
                            <code className="text-[10px] font-mono text-emerald-400">{method.returnType}</code>
                          </div>
                        </div>
                        <CodeBlock code={method.example} language="typescript" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Handling */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Error Handling</h3>
        <p className="text-sm text-gray-400">
          All API errors throw a <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">DevSignalError</code>{' '}
          with the HTTP status code, error message, and optional error code.
        </p>
        <CodeBlock
          code={`import { DevSignal, DevSignalError } from '@devsignal/node';

try {
  await ds.contacts.get('nonexistent_id');
} catch (error) {
  if (error instanceof DevSignalError) {
    console.error(error.message);  // "Contact not found"
    console.error(error.status);   // 404
    console.error(error.code);     // "NOT_FOUND"
  }
}`}
          language="typescript"
        />

        <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-5">
          <h4 className="text-sm font-semibold text-gray-200 mb-3">DevSignalError Properties</h4>
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono text-indigo-400 bg-gray-900/60 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">message</code>
              <p className="text-xs text-gray-400">Human-readable error message from the API</p>
            </div>
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono text-indigo-400 bg-gray-900/60 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">status</code>
              <p className="text-xs text-gray-400">HTTP status code (400, 401, 403, 404, 422, 429, 500)</p>
            </div>
            <div className="flex items-start gap-3">
              <code className="text-xs font-mono text-indigo-400 bg-gray-900/60 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">code</code>
              <p className="text-xs text-gray-400">Machine-readable error code (e.g. NOT_FOUND, VALIDATION_ERROR)</p>
            </div>
          </div>
        </div>
      </div>

      {/* TypeScript Types */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">TypeScript Types</h3>
        <p className="text-sm text-gray-400">
          All types are exported from the main package entry point.
        </p>
        <CodeBlock
          code={`import type {
  Signal,
  SignalInput,
  SignalQueryParams,
  Contact,
  ContactInput,
  ContactQueryParams,
  Company,
  CompanyInput,
  CompanyQueryParams,
  Deal,
  DealInput,
  DealQueryParams,
  DealStage,
  AccountScore,
  ScoreTier,
  ScoreTrend,
  PaginatedResponse,
  PaginationMeta,
  BatchIngestResult,
  DevSignalOptions,
} from '@devsignal/node';`}
          language="typescript"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Webhooks Guide
// ---------------------------------------------------------------------------

function WebhooksTab() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">Webhooks</h2>
        <p className="mt-3 text-gray-400 text-lg leading-relaxed max-w-2xl">
          Receive real-time notifications when events occur in DevSignal.
          Webhooks are delivered as HTTP POST requests to your endpoint.
        </p>
      </div>

      {/* Setup */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Setting Up Webhooks</h3>
        <p className="text-sm text-gray-400">
          Register a webhook endpoint via the API or the Settings page.
          Your endpoint must be a publicly accessible HTTPS URL.
        </p>
        <CodeBlock
          code={`curl -X POST https://devsignal.dev/api/v1/webhooks \\
  -H "Authorization: Bearer ds_live_YOUR_KEY" \\
  -H "X-Organization-Id: YOUR_ORG_ID" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-app.com/webhooks/devsignal",
    "events": ["signal.created", "deal.stage_changed", "score.changed"]
  }'`}
          language="bash"
        />
      </div>

      {/* Event Types */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Event Types</h3>
        <div className="border border-gray-700/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/50">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Event</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['signal.created', 'A new signal has been ingested'],
                ['signal.batch_completed', 'A batch signal ingest has completed'],
                ['contact.created', 'A new contact has been created'],
                ['contact.updated', 'A contact has been updated'],
                ['contact.deleted', 'A contact has been deleted'],
                ['company.created', 'A new company has been created'],
                ['deal.created', 'A new deal has been created'],
                ['deal.stage_changed', 'A deal has moved to a different pipeline stage'],
                ['deal.closed', 'A deal has been closed (won or lost)'],
                ['score.changed', 'An account PQA score has changed tier'],
                ['score.computed', 'A fresh PQA score has been computed'],
                ['workflow.triggered', 'A workflow automation has been triggered'],
              ].map(([event, desc]) => (
                <tr key={event} className="border-t border-gray-700/30">
                  <td className="px-4 py-2.5">
                    <code className="text-xs font-mono text-indigo-400">{event}</code>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payload */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Webhook Payload</h3>
        <p className="text-sm text-gray-400">
          Each webhook delivery includes a JSON body with the event type, timestamp, and event data.
        </p>
        <CodeBlock
          code={JSON.stringify({
            id: 'evt_abc123',
            type: 'signal.created',
            timestamp: '2026-02-14T10:30:00Z',
            data: {
              id: 'sig_xyz',
              type: 'repo_clone',
              sourceId: 'github-app',
              actorId: 'ct_abc',
              metadata: { repo: 'acme/sdk' },
            },
          }, null, 2)}
          language="json"
        />
      </div>

      {/* Verification */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Signature Verification</h3>
        <p className="text-sm text-gray-400">
          Every webhook delivery includes an <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">X-DevSignal-Signature</code> header
          containing an HMAC-SHA256 signature of the request body, computed using your webhook secret.
        </p>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-sm text-amber-200/80">
              Always verify webhook signatures in production. Accepting unverified
              webhooks can expose your application to spoofed events.
            </p>
          </div>
        </div>

        <CodeBlock
          code={`import crypto from 'crypto';

function verifyWebhook(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

// Express middleware example
app.post('/webhooks/devsignal', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-devsignal-signature'] as string;
  const isValid = verifyWebhook(req.body.toString(), signature, WEBHOOK_SECRET);

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body.toString());
  // Handle event...

  res.status(200).json({ received: true });
});`}
          language="typescript"
        />
      </div>

      {/* Retry Policy */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Retry Policy</h3>
        <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-5 space-y-3">
          <p className="text-sm text-gray-400">
            Failed webhook deliveries (non-2xx responses or timeouts) are retried
            with exponential backoff:
          </p>
          <div className="space-y-2">
            {[
              ['Attempt 1', 'Immediate'],
              ['Attempt 2', 'After 1 minute'],
              ['Attempt 3', 'After 5 minutes'],
              ['Attempt 4', 'After 30 minutes'],
              ['Attempt 5', 'After 2 hours'],
              ['Attempt 6', 'After 8 hours (final)'],
            ].map(([attempt, timing]) => (
              <div key={attempt} className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
                <span className="text-xs text-gray-300 font-medium min-w-[5rem]">{attempt}</span>
                <span className="text-xs text-gray-500">{timing}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            After 6 failed attempts, the webhook endpoint is automatically disabled.
            You can re-enable it from the Settings page.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Authentication
// ---------------------------------------------------------------------------

function AuthTab() {
  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight">Authentication</h2>
        <p className="mt-3 text-gray-400 text-lg leading-relaxed max-w-2xl">
          DevSignal supports multiple authentication methods for different use cases.
          Choose the method that best fits your integration.
        </p>
      </div>

      {/* API Key Auth */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-400" />
          <h3 className="text-lg font-semibold text-white">API Key Authentication</h3>
          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            Recommended for server-to-server
          </span>
        </div>
        <p className="text-sm text-gray-400">
          API keys are the recommended way to authenticate server-to-server requests.
          Keys use the <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">ds_live_</code> prefix
          and support scoped permissions.
        </p>
        <CodeBlock
          code={`# Pass the API key in the Authorization header
curl https://devsignal.dev/api/v1/signals \\
  -H "Authorization: Bearer ds_live_a1b2c3d4e5f6g7h8" \\
  -H "X-Organization-Id: org_abc123"`}
          language="bash"
        />

        <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-5">
          <h4 className="text-sm font-semibold text-gray-200 mb-3">Available Scopes</h4>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              ['signals:write', 'Ingest signals (single and batch)'],
              ['signals:read', 'Query signals and timelines'],
              ['contacts:read', 'List and get contacts'],
              ['contacts:write', 'Create, update, delete contacts'],
              ['companies:read', 'List and get companies'],
              ['companies:write', 'Create, update, delete companies'],
              ['deals:read', 'List and get deals'],
              ['deals:write', 'Create, update, delete deals'],
              ['scores:read', 'Read PQA scores'],
              ['scores:write', 'Trigger score computation'],
              ['webhooks:read', 'List webhook endpoints'],
              ['webhooks:write', 'Create, delete webhooks'],
            ].map(([scope, desc]) => (
              <div key={scope} className="flex items-start gap-2 text-xs">
                <code className="text-indigo-400 font-mono bg-gray-900/60 px-1.5 py-0.5 rounded flex-shrink-0">{scope}</code>
                <span className="text-gray-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* JWT Auth */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-blue-400" />
          <h3 className="text-lg font-semibold text-white">JWT Bearer Tokens</h3>
          <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
            For frontend apps
          </span>
        </div>
        <p className="text-sm text-gray-400">
          JWT tokens are used for user-facing sessions in the dashboard and frontend applications.
          Obtain tokens via the login endpoint.
        </p>
        <CodeBlock
          code={`# 1. Login to get tokens
curl -X POST https://devsignal.dev/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{ "email": "you@company.com", "password": "your-password" }'

# Response:
# { "accessToken": "eyJhbG...", "refreshToken": "eyJhbG..." }

# 2. Use the access token
curl https://devsignal.dev/api/v1/contacts \\
  -H "Authorization: Bearer eyJhbG..." \\
  -H "X-Organization-Id: org_abc123"

# 3. Refresh when expired (access tokens expire in 15 minutes)
curl -X POST https://devsignal.dev/api/v1/auth/refresh \\
  -H "Content-Type: application/json" \\
  -d '{ "refreshToken": "eyJhbG..." }'`}
          language="bash"
        />
      </div>

      {/* Organization Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-purple-400" />
          <h3 className="text-lg font-semibold text-white">Organization Context</h3>
        </div>
        <p className="text-sm text-gray-400">
          DevSignal is multi-tenant. Every API request (except auth endpoints) requires
          the <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">X-Organization-Id</code> header
          for proper data isolation.
        </p>
        <CodeBlock
          code={`# Required on every non-auth request
X-Organization-Id: org_abc123`}
          language="http"
        />
      </div>

      {/* Rate Limits */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Rate Limits</h3>
        <p className="text-sm text-gray-400">
          API requests are rate-limited per organization. Limits vary by pricing tier.
          Rate limit headers are included in every response.
        </p>

        <div className="border border-gray-700/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/50">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Tier</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Rate Limit</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Burst</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Free', '100 req/min', '20 req/sec'],
                ['Pro', '500 req/min', '50 req/sec'],
                ['Growth', '1,000 req/min', '100 req/sec'],
                ['Scale', '5,000 req/min', '500 req/sec'],
              ].map(([tier, rate, burst]) => (
                <tr key={tier} className="border-t border-gray-700/30">
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-medium text-white">{tier}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{rate}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{burst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CodeBlock
          code={`# Rate limit response headers
X-RateLimit-Limit: 500
X-RateLimit-Remaining: 487
X-RateLimit-Reset: 1708000000

# When rate limited, you receive:
# HTTP 429 Too Many Requests
# { "error": "Rate limit exceeded", "retryAfter": 12 }`}
          language="http"
        />
      </div>

      {/* Error Codes */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Error Responses</h3>
        <div className="border border-gray-700/50 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/50">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['400', 'Bad Request -- Invalid request body or parameters'],
                ['401', 'Unauthorized -- Invalid or missing authentication'],
                ['403', 'Forbidden -- Insufficient permissions / scope'],
                ['404', 'Not Found -- Resource does not exist'],
                ['422', 'Unprocessable -- Validation error'],
                ['429', 'Too Many Requests -- Rate limit exceeded'],
                ['500', 'Internal Server Error -- Something went wrong on our end'],
              ].map(([code, meaning]) => (
                <tr key={code} className="border-t border-gray-700/30">
                  <td className="px-4 py-2.5">
                    <code className="text-xs font-mono text-amber-400">{code}</code>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main DevPortal Page
// ---------------------------------------------------------------------------

const TAB_CONFIG: Array<{ id: TabId; label: string; icon: string }> = [
  {
    id: 'quickstart',
    label: 'Quick Start',
    icon: 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z',
  },
  {
    id: 'reference',
    label: 'API Reference',
    icon: 'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
  },
  {
    id: 'sdk',
    label: 'SDK',
    icon: 'M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25',
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    icon: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  },
  {
    id: 'auth',
    label: 'Authentication',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  },
];


export default function DevPortal() {
  const [activeTab, setActiveTab] = useState<TabId>('quickstart');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = 'Developer Portal — DevSignal'; }, []);

  // Scroll to top when changing tabs
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeTab]);

  // Close sidebar on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Client-side search (highlights matching tabs)
  const matchingTabs = useMemo(() => {
    if (!searchQuery.trim()) return new Set<TabId>();
    const q = searchQuery.toLowerCase();
    const matches = new Set<TabId>();
    // Check quickstart keywords
    if (['install', 'setup', 'start', 'quick', 'sdk', 'npm'].some((k) => k.includes(q) || q.includes(k))) {
      matches.add('quickstart');
    }
    // Check API reference keywords
    if (API_CATEGORIES.some((c) =>
      c.label.toLowerCase().includes(q) ||
      c.endpoints.some((e) => e.path.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
    )) {
      matches.add('reference');
    }
    // Check SDK keywords
    if (SDK_RESOURCES.some((r) =>
      r.name.toLowerCase().includes(q) ||
      r.accessor.toLowerCase().includes(q) ||
      r.methods.some((m) => m.name.toLowerCase().includes(q))
    )) {
      matches.add('sdk');
    }
    // Check webhook keywords
    if (['webhook', 'event', 'signature', 'hmac', 'retry', 'payload'].some((k) => k.includes(q) || q.includes(k))) {
      matches.add('webhooks');
    }
    // Check auth keywords
    if (['auth', 'key', 'jwt', 'token', 'rate', 'limit', 'scope', 'permission'].some((k) => k.includes(q) || q.includes(k))) {
      matches.add('auth');
    }
    return matches;
  }, [searchQuery]);

  const handleSidebarNav = useCallback((tabId: TabId) => {
    setActiveTab(tabId);
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Top navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="h-full max-w-[90rem] mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-5">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-gray-400 hover:text-white"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="text-base font-bold tracking-tight text-white">DevSignal</span>
              <span className="text-xs text-gray-500 font-medium ml-1 hidden sm:inline">Developers</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1 ml-4">
              <Link
                to="/"
                className="px-2.5 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                Home
              </Link>
              <Link
                to="/docs"
                className="px-2.5 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                API Docs
              </Link>
              <Link
                to="/pricing"
                className="px-2.5 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                Pricing
              </Link>
            </nav>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md mx-4 hidden sm:block">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search docs... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-gray-800/50 border border-gray-700/60 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 p-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/nerobypaul/headless-crm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors p-1.5"
              title="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <Link
              to="/login"
              className="text-xs text-gray-400 hover:text-white transition-colors px-2.5 py-1.5"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="pt-14 flex max-w-[90rem] mx-auto">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed top-14 bottom-0 left-0 z-40 w-60 bg-gray-950 border-r border-gray-800 overflow-y-auto transition-transform duration-200 ease-in-out lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <nav className="p-4 space-y-1">
            {TAB_CONFIG.map((tab) => {
              const isActive = activeTab === tab.id;
              const isMatch = searchQuery && matchingTabs.has(tab.id);

              return (
                <button
                  key={tab.id}
                  onClick={() => handleSidebarNav(tab.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
                    isActive
                      ? 'bg-indigo-600/10 text-indigo-400 font-medium'
                      : isMatch
                      ? 'bg-amber-500/5 text-amber-400 hover:bg-amber-500/10'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  {tab.label}
                  {isMatch && !isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 ml-auto" />
                  )}
                </button>
              );
            })}

            {/* Divider */}
            <div className="pt-4 mt-4 border-t border-gray-800">
              <p className="px-3 mb-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
                Resources
              </p>
              <a
                href="/api-docs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Swagger / OpenAPI
              </a>
              <a
                href="https://www.npmjs.com/package/@devsignal/node"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
                </svg>
                npm Package
              </a>
              <Link
                to="/docs"
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
                Endpoint List
              </Link>
            </div>

            {/* API Status */}
            <div className="pt-4 mt-4 border-t border-gray-800">
              <div className="px-3 py-3 rounded-lg bg-gray-800/30 border border-gray-700/40">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-400">All systems operational</span>
                </div>
                <p className="text-[10px] text-gray-500">
                  Base URL: <code className="text-gray-400">devsignal.dev</code>
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  API version: <code className="text-gray-400">v1</code>
                </p>
              </div>
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main ref={mainRef} className="flex-1 min-w-0 px-4 sm:px-8 lg:px-12 py-8 lg:py-10 overflow-y-auto">
          <div className="max-w-3xl">
            {/* Tab bar (mobile/supplemental) */}
            <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2 scrollbar-none lg:hidden">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800/50 border border-transparent'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'quickstart' && <QuickStartTab />}
            {activeTab === 'reference' && <ApiReferenceTab />}
            {activeTab === 'sdk' && <SdkTab />}
            {activeTab === 'webhooks' && <WebhooksTab />}
            {activeTab === 'auth' && <AuthTab />}

            {/* Footer */}
            <div className="mt-16 border-t border-gray-800 pt-8 pb-16">
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-6">
                <h3 className="text-base font-semibold text-white">Need help?</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Check out the full interactive OpenAPI spec, or reach out to our team.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href="/api-docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    OpenAPI / Swagger
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white rounded-lg transition-colors"
                  >
                    Create Free Account
                  </Link>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between text-xs text-gray-600">
                <span>DevSignal -- Built for devtool PLG teams</span>
                <div className="flex items-center gap-4">
                  <Link to="/" className="hover:text-gray-400 transition-colors">Home</Link>
                  <Link to="/pricing" className="hover:text-gray-400 transition-colors">Pricing</Link>
                  <Link to="/login" className="hover:text-gray-400 transition-colors">Sign In</Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
