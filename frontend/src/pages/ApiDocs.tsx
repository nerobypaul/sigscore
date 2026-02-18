import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth?: string;
  body?: string;
  response?: string;
}

interface EndpointCategory {
  id: string;
  label: string;
  description: string;
  endpoints: Endpoint[];
}

// ---------------------------------------------------------------------------
// Data -- derived from the actual backend route definitions
// ---------------------------------------------------------------------------

const API_CATEGORIES: EndpointCategory[] = [
  {
    id: 'auth',
    label: 'Authentication',
    description:
      'Register, log in, refresh tokens, and retrieve the current user profile. Auth endpoints return JWT access and refresh tokens.',
    endpoints: [
      {
        method: 'POST',
        path: '/auth/register',
        description: 'Create a new user account',
        auth: 'None',
        body: `{
  "email": "jane@acme.com",
  "password": "s3cur3P@ss",
  "firstName": "Jane",
  "lastName": "Doe"
}`,
        response: `{
  "user": { "id": "usr_abc123", "email": "jane@acme.com" },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "rt_x9y8z7..."
}`,
      },
      {
        method: 'POST',
        path: '/auth/login',
        description: 'Authenticate with email and password',
        auth: 'None',
        body: `{
  "email": "jane@acme.com",
  "password": "s3cur3P@ss"
}`,
        response: `{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "rt_x9y8z7..."
}`,
      },
      {
        method: 'POST',
        path: '/auth/refresh',
        description: 'Exchange a refresh token for a new token pair',
        auth: 'None',
        body: `{ "refreshToken": "rt_x9y8z7..." }`,
      },
      {
        method: 'POST',
        path: '/auth/logout',
        description: 'Invalidate the current refresh token',
        auth: 'Bearer JWT',
      },
      {
        method: 'GET',
        path: '/auth/me',
        description: 'Get the authenticated user profile and organizations',
        auth: 'Bearer JWT',
        response: `{
  "id": "usr_abc123",
  "email": "jane@acme.com",
  "firstName": "Jane",
  "lastName": "Doe",
  "organizations": [
    { "id": "org_xyz", "name": "Acme Inc", "role": "ADMIN" }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/auth/forgot-password',
        description: 'Send a password reset email',
        auth: 'None',
        body: `{ "email": "jane@acme.com" }`,
      },
      {
        method: 'POST',
        path: '/auth/reset-password',
        description: 'Reset password with a valid token',
        auth: 'None',
        body: `{ "token": "reset_token_here", "password": "newP@ssw0rd" }`,
      },
    ],
  },
  {
    id: 'organizations',
    label: 'Organizations',
    description:
      'Manage organizations (workspaces). Each organization is a multi-tenant boundary for all CRM data, signals, and settings.',
    endpoints: [
      { method: 'GET', path: '/organizations', description: 'List organizations the user belongs to', auth: 'Bearer JWT' },
      { method: 'GET', path: '/organizations/:id', description: 'Get a single organization', auth: 'Bearer JWT' },
      {
        method: 'POST',
        path: '/organizations',
        description: 'Create a new organization',
        auth: 'Bearer JWT',
        body: `{
  "name": "Acme Inc",
  "domain": "acme.com"
}`,
      },
      {
        method: 'PUT',
        path: '/organizations/:id',
        description: 'Update organization name, domain, or settings',
        auth: 'Bearer JWT',
        body: `{ "name": "Acme Corp", "domain": "acme.io" }`,
      },
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    description:
      'Manage contacts within your organization. Supports search, pagination, filtering by company, and full CRUD operations.',
    endpoints: [
      {
        method: 'GET',
        path: '/contacts',
        description: 'List contacts with search and pagination',
        auth: 'Bearer JWT / API Key',
        response: `{
  "contacts": [
    {
      "id": "ct_abc123",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@acme.com",
      "title": "Staff Engineer",
      "company": { "id": "co_xyz", "name": "Acme" }
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 25
}`,
      },
      { method: 'GET', path: '/contacts/:id', description: 'Get a single contact with company, deals, and tags', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/contacts',
        description: 'Create a new contact',
        auth: 'Bearer JWT / API Key',
        body: `{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@acme.com",
  "title": "Staff Engineer",
  "github": "janedoe",
  "companyId": "co_xyz"
}`,
      },
      {
        method: 'PUT',
        path: '/contacts/:id',
        description: 'Update an existing contact',
        auth: 'Bearer JWT / API Key',
        body: `{ "title": "Principal Engineer" }`,
      },
      { method: 'DELETE', path: '/contacts/:id', description: 'Permanently delete a contact', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'companies',
    label: 'Companies',
    description:
      'Manage companies (accounts). Companies are the core entity for PLG signal tracking and PQA scoring.',
    endpoints: [
      { method: 'GET', path: '/companies', description: 'List companies with search and industry filter', auth: 'Bearer JWT / API Key' },
      {
        method: 'GET',
        path: '/companies/:id',
        description: 'Get company details with contacts, deals, tags, and PQA score',
        auth: 'Bearer JWT / API Key',
        response: `{
  "id": "co_xyz",
  "name": "Acme Inc",
  "domain": "acme.com",
  "industry": "Developer Tools",
  "score": { "score": 87, "tier": "HOT" },
  "contacts": [...],
  "deals": [...]
}`,
      },
      {
        method: 'POST',
        path: '/companies',
        description: 'Create a new company',
        auth: 'Bearer JWT / API Key',
        body: `{
  "name": "Acme Inc",
  "domain": "acme.com",
  "industry": "Developer Tools"
}`,
      },
      { method: 'PUT', path: '/companies/:id', description: 'Update an existing company', auth: 'Bearer JWT / API Key' },
      { method: 'DELETE', path: '/companies/:id', description: 'Delete a company', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'deals',
    label: 'Deals',
    description:
      'PLG-native deal pipeline with stages from ANONYMOUS_USAGE through CLOSED_WON. Filter by stage, owner, or company.',
    endpoints: [
      { method: 'GET', path: '/deals', description: 'List deals with stage, owner, company filters', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/deals/:id', description: 'Get deal with contact, company, owner, and activities', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/deals',
        description: 'Create a deal in the PLG pipeline',
        auth: 'Bearer JWT / API Key',
        body: `{
  "title": "Acme Pro Upgrade",
  "stage": "EXPANSION_SIGNAL",
  "amount": 4800,
  "companyId": "co_xyz",
  "contactId": "ct_abc123"
}`,
      },
      {
        method: 'PUT',
        path: '/deals/:id',
        description: 'Update deal stage, amount, or metadata',
        auth: 'Bearer JWT / API Key',
        body: `{ "stage": "SALES_QUALIFIED", "amount": 9600 }`,
      },
      { method: 'DELETE', path: '/deals/:id', description: 'Delete a deal', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'activities',
    label: 'Activities',
    description:
      'Track tasks, calls, meetings, emails, and notes linked to contacts, companies, or deals.',
    endpoints: [
      { method: 'GET', path: '/activities', description: 'List activities with type, status, entity filters', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/activities/:id', description: 'Get an activity with related entities', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/activities',
        description: 'Create a task, call, meeting, email, or note',
        auth: 'Bearer JWT / API Key',
        body: `{
  "type": "TASK",
  "subject": "Follow up on expansion signal",
  "contactId": "ct_abc123",
  "dueAt": "2026-02-20T10:00:00Z"
}`,
      },
      { method: 'PUT', path: '/activities/:id', description: 'Update activity status, priority, or details', auth: 'Bearer JWT / API Key' },
      { method: 'DELETE', path: '/activities/:id', description: 'Delete an activity', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'signals',
    label: 'Signals',
    description:
      'Ingest product usage signals, query signal history, view account timelines, and compute PQA scores. The core of DevSignal\'s PLG intelligence.',
    endpoints: [
      {
        method: 'POST',
        path: '/signals',
        description: 'Ingest a single signal event',
        auth: 'Bearer JWT / API Key',
        body: `{
  "sourceId": "github-app",
  "type": "repo_clone",
  "actorId": "ct_abc123",
  "metadata": { "repo": "acme/sdk", "branch": "main" }
}`,
        response: `{
  "id": "sig_xyz789",
  "type": "repo_clone",
  "sourceId": "github-app",
  "createdAt": "2026-02-16T12:00:00Z"
}`,
      },
      {
        method: 'POST',
        path: '/signals/batch',
        description: 'Ingest up to 1,000 signals in one request',
        auth: 'Bearer JWT / API Key',
        body: `{
  "signals": [
    { "sourceId": "web-app", "type": "feature_used", "actorId": "ct_1", "metadata": { "feature": "dashboard" } },
    { "sourceId": "web-app", "type": "feature_used", "actorId": "ct_2", "metadata": { "feature": "api-keys" } }
  ]
}`,
      },
      { method: 'GET', path: '/signals', description: 'Query signals with type, source, date filters', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/signals/accounts/top', description: 'Get top accounts ranked by PQA score', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/signals/accounts/:accountId/timeline', description: 'Merged signal + activity timeline for an account', auth: 'Bearer JWT / API Key' },
      {
        method: 'GET',
        path: '/signals/accounts/:accountId/score',
        description: 'Get the current PQA score for an account',
        auth: 'Bearer JWT / API Key',
        response: `{
  "accountId": "co_xyz",
  "score": 87,
  "tier": "HOT",
  "breakdown": {
    "repo_clone": 35,
    "api_call": 28,
    "docs_visit": 24
  }
}`,
      },
      { method: 'POST', path: '/signals/accounts/:accountId/score', description: 'Force recompute PQA score for an account', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'workflows',
    label: 'Workflows',
    description:
      'Create event-driven automation workflows triggered by signals, contact creation, deal stage changes, or score changes. Each workflow has conditions and actions.',
    endpoints: [
      { method: 'GET', path: '/workflows', description: 'List workflows with optional enabled filter', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/workflows/:id', description: 'Get a single workflow with recent run history', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/workflows',
        description: 'Create a new automation workflow',
        auth: 'Bearer JWT / API Key',
        body: `{
  "name": "Hot Lead Slack Alert",
  "trigger": {
    "event": "score_changed",
    "filters": { "tier": "HOT" }
  },
  "conditions": [
    { "field": "score", "operator": "gte", "value": 80 }
  ],
  "actions": [
    { "type": "send_slack", "params": { "channel": "#sales", "message": "Hot lead: {{company.name}}" } }
  ],
  "enabled": true
}`,
      },
      { method: 'PUT', path: '/workflows/:id', description: 'Update workflow trigger, conditions, or actions', auth: 'Bearer JWT / API Key' },
      { method: 'DELETE', path: '/workflows/:id', description: 'Delete a workflow', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/workflows/:id/runs', description: 'Get execution history for a workflow', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/workflows/process-event',
        description: 'Manually trigger event processing (testing)',
        auth: 'Bearer JWT / API Key',
        body: `{ "event": "signal_received", "data": { "type": "repo_clone" } }`,
      },
    ],
  },
  {
    id: 'playbooks',
    label: 'Playbooks',
    description:
      'Pre-built workflow templates covering acquisition, expansion, retention, and engagement. Activate a playbook to instantly create the corresponding workflow.',
    endpoints: [
      { method: 'GET', path: '/playbooks', description: 'List all playbook templates with activation status', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/playbooks/active', description: 'List currently active playbooks for the org', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/playbooks/:id/activate',
        description: 'Activate a playbook template (creates workflow)',
        auth: 'Bearer JWT / API Key',
        response: `{ "ok": true, "playbookId": "pb_new_signup", "workflowId": "wf_abc123" }`,
      },
      { method: 'DELETE', path: '/playbooks/:id', description: 'Deactivate a playbook (removes workflow)', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'scoring',
    label: 'Scoring',
    description:
      'No-code lead scoring builder. Configure weighted rules by signal type, set tier thresholds (HOT/WARM/COLD), preview scores, and bulk recompute. Requires ADMIN role.',
    endpoints: [
      {
        method: 'GET',
        path: '/scoring/config',
        description: 'Get the current scoring configuration',
        auth: 'Bearer JWT (Admin)',
        response: `{
  "rules": [
    { "id": "r1", "name": "Repo Clone", "signalType": "repo_clone", "weight": 30, "decay": "14d", "enabled": true }
  ],
  "tierThresholds": { "HOT": 70, "WARM": 40, "COLD": 0 },
  "maxScore": 100
}`,
      },
      {
        method: 'PUT',
        path: '/scoring/config',
        description: 'Update scoring rules and tier thresholds',
        auth: 'Bearer JWT (Admin)',
        body: `{
  "rules": [...],
  "tierThresholds": { "HOT": 75, "WARM": 45, "COLD": 0 },
  "maxScore": 100
}`,
      },
      { method: 'POST', path: '/scoring/preview', description: 'Preview scores with a proposed config (without saving)', auth: 'Bearer JWT (Admin)' },
      { method: 'POST', path: '/scoring/recompute', description: 'Force recompute all PQA scores', auth: 'Bearer JWT (Admin)' },
      { method: 'POST', path: '/scoring/reset', description: 'Reset scoring config to defaults', auth: 'Bearer JWT (Admin)' },
    ],
  },
  {
    id: 'sequences',
    label: 'Email Sequences',
    description:
      'Multi-step email sequences with configurable delays, enrollment management, and per-step analytics. Powered by Resend.',
    endpoints: [
      { method: 'GET', path: '/sequences', description: 'List sequences with status and pagination', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/sequences/:id', description: 'Get a sequence with steps and stats', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/sequences',
        description: 'Create a new email sequence',
        auth: 'Bearer JWT (Admin)',
        body: `{
  "name": "Onboarding Drip",
  "triggerType": "contact_created",
  "fromName": "DevSignal",
  "fromEmail": "hello@devsignal.io"
}`,
      },
      { method: 'PUT', path: '/sequences/:id', description: 'Update sequence name, status, or trigger', auth: 'Bearer JWT (Admin)' },
      { method: 'DELETE', path: '/sequences/:id', description: 'Archive a sequence', auth: 'Bearer JWT (Admin)' },
      {
        method: 'POST',
        path: '/sequences/:id/steps',
        description: 'Add an email step to a sequence',
        auth: 'Bearer JWT (Admin)',
        body: `{
  "subject": "Welcome to DevSignal",
  "body": "<p>Hi {{firstName}}, ...</p>",
  "delayDays": 0
}`,
      },
      { method: 'PUT', path: '/sequences/:id/steps/:stepId', description: 'Update an email step', auth: 'Bearer JWT (Admin)' },
      { method: 'DELETE', path: '/sequences/:id/steps/:stepId', description: 'Delete a step from a sequence', auth: 'Bearer JWT (Admin)' },
      { method: 'PUT', path: '/sequences/:id/steps/reorder', description: 'Reorder steps within a sequence', auth: 'Bearer JWT (Admin)' },
      {
        method: 'POST',
        path: '/sequences/:id/enroll',
        description: 'Enroll contacts in a sequence (max 500)',
        auth: 'Bearer JWT / API Key',
        body: `{ "contactIds": ["ct_abc123", "ct_def456"] }`,
      },
      { method: 'GET', path: '/sequences/:id/enrollments', description: 'List enrollments for a sequence', auth: 'Bearer JWT / API Key' },
      { method: 'PUT', path: '/sequences/:id/enrollments/:enrollmentId/pause', description: 'Pause an enrollment', auth: 'Bearer JWT / API Key' },
      { method: 'PUT', path: '/sequences/:id/enrollments/:enrollmentId/resume', description: 'Resume a paused enrollment', auth: 'Bearer JWT / API Key' },
      { method: 'DELETE', path: '/sequences/:id/enrollments/:enrollmentId', description: 'Unenroll a contact', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/sequences/:id/stats', description: 'Get aggregate stats (sent, opened, clicked)', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'connectors',
    label: 'Connectors',
    description:
      'Manage signal source connectors for 13+ platforms. Trigger syncs, test connections, and configure Segment webhook ingestion.',
    endpoints: [
      { method: 'POST', path: '/connectors/npm/:sourceId/sync', description: 'Enqueue an npm download sync job', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/connectors/npm/test', description: 'Test npm API connectivity for packages', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/connectors/pypi/:sourceId/sync', description: 'Enqueue a PyPI download sync job', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/connectors/pypi/test', description: 'Test PyPI API connectivity for packages', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/connectors/segment',
        description: 'Create a Segment source with webhook URL and shared secret',
        auth: 'Bearer JWT (Admin)',
        response: `{
  "source": {
    "id": "src_abc",
    "webhookUrl": "/api/v1/webhooks/segment/src_abc",
    "sharedSecret": "hex_secret_here"
  }
}`,
      },
      { method: 'GET', path: '/connectors/segment/:sourceId', description: 'Get Segment source config and webhook URL', auth: 'Bearer JWT (Admin)' },
      { method: 'POST', path: '/connectors/segment/:sourceId/rotate-secret', description: 'Rotate the Segment shared secret', auth: 'Bearer JWT (Admin)' },
      { method: 'DELETE', path: '/connectors/segment/:sourceId', description: 'Delete a Segment source', auth: 'Bearer JWT (Admin)' },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    description:
      'Register HTTPS webhook endpoints to receive real-time notifications when signals are ingested or platform events occur.',
    endpoints: [
      { method: 'GET', path: '/webhooks', description: 'List webhook endpoints with delivery counts', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/webhooks',
        description: 'Register a new webhook endpoint (HTTPS only)',
        auth: 'Bearer JWT / API Key',
        body: `{
  "url": "https://your-app.com/webhooks/devsignal",
  "events": ["signal.created", "deal.stage_changed"]
}`,
      },
      { method: 'DELETE', path: '/webhooks/:id', description: 'Delete a webhook endpoint', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'webhook-subscriptions',
    label: 'Webhook Subscriptions',
    description:
      'Zapier/Make-compatible REST Hook subscriptions. Subscribe to 8 event types with HMAC-signed payloads. Supports both API key and JWT auth.',
    endpoints: [
      { method: 'GET', path: '/webhooks/subscribe', description: 'List all webhook subscriptions for the org', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/webhooks/subscribe/events', description: 'List supported event types', auth: 'None' },
      { method: 'GET', path: '/webhooks/subscribe/:id', description: 'Get a single subscription', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/webhooks/subscribe',
        description: 'Create a new subscription (REST Hook pattern)',
        auth: 'Bearer JWT / API Key',
        body: `{
  "targetUrl": "https://hooks.zapier.com/abc123",
  "event": "signal.created"
}`,
      },
      {
        method: 'PATCH',
        path: '/webhooks/subscribe/:id',
        description: 'Toggle subscription active status',
        auth: 'Bearer JWT / API Key',
        body: `{ "active": false }`,
      },
      { method: 'DELETE', path: '/webhooks/subscribe/:id', description: 'Remove a subscription', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/webhooks/subscribe/:id/test', description: 'Send a test payload to the subscription URL', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description:
      'Overview stats, signal trends, PQA distribution, pipeline funnel, and advanced cohort analysis. Power your dashboards and reports.',
    endpoints: [
      {
        method: 'GET',
        path: '/analytics',
        description: 'Overview stats: contacts, companies, deals, signals, pipeline',
        auth: 'Bearer JWT / API Key',
      },
      { method: 'GET', path: '/analytics/signal-trends', description: 'Daily signal counts over a configurable window', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/pqa-distribution', description: 'Account scores grouped by PQA tier', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/pipeline', description: 'Deal funnel in PLG stage order', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/top-signals', description: 'Most common signal types this month', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/advanced/cohorts', description: 'Cohort analysis: account retention over time', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/advanced/funnel', description: 'Signal funnel conversion through stages', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/advanced/trends', description: 'Signal trends by type, grouped by day or week', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/advanced/tier-movement', description: 'Track accounts that changed PQA tier', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/advanced/top-movers', description: 'Accounts with biggest score changes', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/analytics/advanced/source-attribution', description: 'Which signal sources drive the most pipeline', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'identity',
    label: 'Identity Resolution',
    description:
      'Find duplicate contacts, merge identities, enrich profiles, and view the full identity graph linking emails, GitHub handles, and more.',
    endpoints: [
      { method: 'GET', path: '/identity/duplicates', description: 'Find potential duplicate contacts by shared identities', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/identity/merge',
        description: 'Merge duplicate contacts into a primary record',
        auth: 'Bearer JWT (Admin)',
        body: `{
  "primaryId": "ct_abc123",
  "duplicateIds": ["ct_dup1", "ct_dup2"]
}`,
        response: `{ "merged": 2, "errors": [], "primaryId": "ct_abc123" }`,
      },
      { method: 'POST', path: '/identity/enrich/:contactId', description: 'Trigger enrichment for a specific contact', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/identity/graph/:contactId', description: 'View the full identity graph for a contact', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'enrichment',
    label: 'Enrichment',
    description:
      'Clearbit-powered data enrichment for companies and contacts. Connect your API key, enrich individually or in bulk via background jobs.',
    endpoints: [
      { method: 'POST', path: '/enrichment/connect', description: 'Save Clearbit API key (Admin only)', auth: 'Bearer JWT (Admin)' },
      { method: 'GET', path: '/enrichment/status', description: 'Get Clearbit connection status and enrichment stats', auth: 'Bearer JWT (Admin)' },
      { method: 'POST', path: '/enrichment/companies/:companyId', description: 'Enrich a single company', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/enrichment/contacts/:contactId', description: 'Enrich a single contact', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/enrichment/bulk/companies', description: 'Trigger bulk company enrichment via BullMQ', auth: 'Bearer JWT (Admin)' },
      { method: 'POST', path: '/enrichment/bulk/contacts', description: 'Trigger bulk contact enrichment via BullMQ', auth: 'Bearer JWT (Admin)' },
      { method: 'DELETE', path: '/enrichment/disconnect', description: 'Remove Clearbit config (Admin only)', auth: 'Bearer JWT (Admin)' },
    ],
  },
  {
    id: 'bulk',
    label: 'Bulk Operations',
    description:
      'Bulk delete, tag, and export operations for contacts, companies, and deals. All operations require ADMIN role and support up to 500 IDs per request.',
    endpoints: [
      {
        method: 'POST',
        path: '/bulk/contacts/delete',
        description: 'Bulk delete contacts (max 500)',
        auth: 'Bearer JWT (Admin)',
        body: `{ "ids": ["ct_abc123", "ct_def456", "ct_ghi789"] }`,
        response: `{ "deleted": 3 }`,
      },
      {
        method: 'POST',
        path: '/bulk/contacts/tag',
        description: 'Bulk add a tag to contacts',
        auth: 'Bearer JWT (Admin)',
        body: `{ "ids": ["ct_abc123", "ct_def456"], "tagName": "hot-lead", "tagColor": "red" }`,
      },
      {
        method: 'POST',
        path: '/bulk/contacts/export',
        description: 'Export contacts as CSV (max 10,000 rows)',
        auth: 'Bearer JWT (Admin)',
        body: `{ "ids": ["ct_abc123"], "filters": { "search": "acme" } }`,
      },
      { method: 'POST', path: '/bulk/companies/delete', description: 'Bulk delete companies (max 500)', auth: 'Bearer JWT (Admin)' },
      { method: 'POST', path: '/bulk/deals/delete', description: 'Bulk delete deals (max 500)', auth: 'Bearer JWT (Admin)' },
    ],
  },
  {
    id: 'dashboards',
    label: 'Dashboards',
    description:
      'Custom dashboard builder with drag-and-drop widgets. Create, update, and share dashboards with configurable widget layouts.',
    endpoints: [
      { method: 'GET', path: '/dashboards', description: 'List the current user\'s dashboards', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/dashboards/:id', description: 'Get a single dashboard with its widget layout', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/dashboards',
        description: 'Create a new dashboard',
        auth: 'Bearer JWT / API Key',
        body: `{
  "name": "Sales Overview",
  "layout": [
    { "type": "signal-trends", "position": { "x": 0, "y": 0, "w": 6, "h": 4 }, "config": {} },
    { "type": "pqa-distribution", "position": { "x": 6, "y": 0, "w": 6, "h": 4 }, "config": {} }
  ]
}`,
      },
      { method: 'PUT', path: '/dashboards/:id', description: 'Update dashboard name and/or widget layout', auth: 'Bearer JWT / API Key' },
      { method: 'DELETE', path: '/dashboards/:id', description: 'Delete a dashboard', auth: 'Bearer JWT / API Key' },
      { method: 'PUT', path: '/dashboards/:id/default', description: 'Set a dashboard as the user\'s default', auth: 'Bearer JWT / API Key' },
      { method: 'GET', path: '/dashboards/widgets/:type', description: 'Fetch data for a specific widget type', auth: 'Bearer JWT / API Key' },
    ],
  },
  {
    id: 'members',
    label: 'Team Members',
    description:
      'Invite users, manage roles (OWNER, ADMIN, MEMBER, VIEWER), and transfer organization ownership.',
    endpoints: [
      { method: 'GET', path: '/members', description: 'List all members of the organization', auth: 'Bearer JWT / API Key' },
      {
        method: 'POST',
        path: '/members/invite',
        description: 'Invite a user by email to the organization',
        auth: 'Bearer JWT (Admin)',
        body: `{ "email": "dev@acme.com", "role": "MEMBER" }`,
      },
      {
        method: 'PUT',
        path: '/members/:userId/role',
        description: 'Update a member\'s role',
        auth: 'Bearer JWT (Admin)',
        body: `{ "role": "ADMIN" }`,
      },
      { method: 'DELETE', path: '/members/:userId', description: 'Remove a member from the organization', auth: 'Bearer JWT (Admin)' },
      {
        method: 'POST',
        path: '/members/transfer-ownership',
        description: 'Transfer organization ownership (Owner only)',
        auth: 'Bearer JWT (Owner)',
        body: `{ "userId": "usr_xyz789" }`,
      },
    ],
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    description:
      'Manage API keys for programmatic access. Keys use scoped permissions and the ds_live_ prefix.',
    endpoints: [
      {
        method: 'GET',
        path: '/api-keys',
        description: 'List API keys (key prefix only)',
        auth: 'Bearer JWT / API Key',
        response: `{
  "keys": [
    {
      "id": "key_abc",
      "name": "Production SDK",
      "prefix": "ds_live_a1b2c3",
      "scopes": ["signals:write", "contacts:read"],
      "lastUsedAt": "2026-02-15T20:00:00Z"
    }
  ]
}`,
      },
      {
        method: 'POST',
        path: '/api-keys',
        description: 'Create a new API key with scopes',
        auth: 'Bearer JWT (Admin)',
        body: `{
  "name": "Production SDK",
  "scopes": ["signals:write", "contacts:read", "companies:read"]
}`,
        response: `{
  "id": "key_abc",
  "key": "ds_live_a1b2c3d4e5f6...",
  "name": "Production SDK"
}`,
      },
      { method: 'PUT', path: '/api-keys/:id/revoke', description: 'Revoke an API key', auth: 'Bearer JWT (Admin)' },
      { method: 'DELETE', path: '/api-keys/:id', description: 'Permanently delete an API key', auth: 'Bearer JWT (Admin)' },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    description:
      'Full-text search across contacts, companies, deals, and signals using PostgreSQL tsvector with weighted relevance scoring.',
    endpoints: [
      {
        method: 'GET',
        path: '/search?q=acme',
        description: 'Global search with prefix matching and type filters',
        auth: 'Bearer JWT / API Key',
        response: `{
  "results": [
    { "type": "company", "id": "co_xyz", "name": "Acme Inc", "score": 0.95 },
    { "type": "contact", "id": "ct_abc", "name": "Jane Doe", "score": 0.82 }
  ]
}`,
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI Engine',
    description:
      'AI-powered account briefs, next-best-action suggestions, and contact enrichment powered by Claude.',
    endpoints: [
      {
        method: 'GET',
        path: '/ai/brief/:accountId',
        description: 'Get the cached AI brief for an account',
        auth: 'Bearer JWT / API Key',
        response: `{
  "accountId": "co_xyz",
  "brief": "Acme Inc is a Series B devtool company showing strong expansion signals...",
  "generatedAt": "2026-02-15T18:00:00Z"
}`,
      },
      { method: 'POST', path: '/ai/brief/:accountId', description: 'Generate a new AI account brief', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/ai/suggest/:accountId', description: 'Get AI-suggested next-best-actions', auth: 'Bearer JWT / API Key' },
      { method: 'POST', path: '/ai/enrich/:contactId', description: 'Enrich a contact profile with AI', auth: 'Bearer JWT / API Key' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Rate limit tiers
// ---------------------------------------------------------------------------

const RATE_LIMITS = [
  { name: 'General API', limit: '100 req/min', scope: '/api/v1/*', description: 'Baseline protection for all API routes' },
  { name: 'Signal Ingest', limit: '500 req/min', scope: '/api/v1/signals', description: 'High throughput for SDK signal ingestion' },
  { name: 'Webhooks', limit: '200 req/min', scope: '/api/v1/webhooks/*', description: 'Inbound connector webhooks (GitHub, Segment, etc.)' },
  { name: 'Authentication', limit: '5 req/min', scope: '/api/v1/auth/login', description: 'Strict limit to prevent brute-force attacks' },
  { name: 'Demo Seed', limit: '3 req/min', scope: '/api/v1/demo/*', description: 'Prevent abuse from seeding test data' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  PATCH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold font-mono border ${METHOD_STYLES[method] ?? 'bg-gray-700 text-gray-300'}`}
      style={{ minWidth: '3.75rem' }}
    >
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Code block component with copy button
// ---------------------------------------------------------------------------

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  // Strip HTML tags to get the raw text for clipboard
  const rawText = code.replace(/<[^>]*>/g, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-700/50">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700/50">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed bg-gray-900/90">
        <code
          className="text-gray-300 font-mono"
          dangerouslySetInnerHTML={{ __html: code }}
        />
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// JSON code block -- renders a plain JSON string with syntax colouring
// ---------------------------------------------------------------------------

function JsonBlock({ json, label }: { json: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Simple JSON syntax highlighting via regex
  const highlighted = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // strings
    .replace(/"([^"\\]|\\.)*"/g, (match) => {
      // If followed by a colon, it's a key
      return `<span class="text-indigo-400">${match}</span>`;
    })
    // numbers
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="text-amber-400">$1</span>')
    // booleans / null
    .replace(/\b(true|false|null)\b/g, '<span class="text-emerald-400">$1</span>');

  return (
    <div className="rounded-lg overflow-hidden border border-gray-700/50">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/80 border-b border-gray-700/50">
        <span className="text-xs text-gray-400 font-mono">{label ?? 'json'}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed bg-gray-900/90">
        <code className="text-gray-300 font-mono" dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible endpoint detail (request/response bodies)
// ---------------------------------------------------------------------------

function EndpointRow({ ep }: { ep: Endpoint }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(ep.body || ep.response);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-900/70 transition-colors">
      <button
        type="button"
        onClick={() => hasDetails && setOpen(!open)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <MethodBadge method={ep.method} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono text-gray-200">{ep.path}</code>
            {ep.auth && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 font-mono border border-gray-700/50">
                {ep.auth}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{ep.description}</p>
        </div>
        {hasDetails && (
          <svg
            className={`w-4 h-4 text-gray-500 mt-1 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {open && hasDetails && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-800/50">
          {ep.body && <JsonBlock json={ep.body} label="Request body" />}
          {ep.response && <JsonBlock json={ep.response} label="Response" />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------

function CollapsibleSection({
  id,
  label,
  description,
  endpoints,
  defaultOpen,
}: {
  id: string;
  label: string;
  description: string;
  endpoints: Endpoint[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-20 mt-12 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 border-b border-gray-800 text-left group"
      >
        <div>
          <h2 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
            {label}
            <span className="ml-2 text-sm font-normal text-gray-500">
              {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
            </span>
          </h2>
          <p className="mt-1 text-sm text-gray-400 leading-relaxed">{description}</p>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {endpoints.map((ep, idx) => (
            <EndpointRow key={idx} ep={ep} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section anchor wrapper
// ---------------------------------------------------------------------------

function Section({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ApiDocs() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const mainRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { document.title = 'API Documentation — DevSignal'; }, []);

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return API_CATEGORIES;
    const q = searchQuery.toLowerCase();
    return API_CATEGORIES.map((cat) => {
      const matchesCategory =
        cat.label.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q);
      const matchingEndpoints = cat.endpoints.filter(
        (ep) =>
          ep.path.toLowerCase().includes(q) ||
          ep.method.toLowerCase().includes(q) ||
          ep.description.toLowerCase().includes(q),
      );
      if (matchesCategory) return cat;
      if (matchingEndpoints.length > 0) {
        return { ...cat, endpoints: matchingEndpoints };
      }
      return null;
    }).filter((cat): cat is EndpointCategory => cat !== null);
  }, [searchQuery]);

  // Total endpoint count
  const totalEndpoints = API_CATEGORIES.reduce((sum, c) => sum + c.endpoints.length, 0);

  // Track which section is visible via IntersectionObserver
  useEffect(() => {
    const ids = ['overview', 'authentication', 'rate-limits', 'quick-start', ...API_CATEGORIES.map((c) => c.id)];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        searchInputRef.current?.blur();
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setSidebarOpen(false);
    }
  };

  // Sidebar navigation items
  const navItems = [
    { id: 'overview', label: 'Overview' },
    { id: 'authentication', label: 'Authentication' },
    { id: 'rate-limits', label: 'Rate Limits' },
    { id: 'quick-start', label: 'Quick Start' },
    ...API_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ----------------------------------------------------------------- */}
      {/* Top navigation */}
      {/* ----------------------------------------------------------------- */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800">
        <div className="h-full max-w-[90rem] mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Left */}
          <div className="flex items-center gap-6">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden text-gray-400 hover:text-white"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            <Link to="/" className="flex items-center gap-2">
              {/* Logo mark */}
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight text-white">DevSignal</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => scrollTo('overview')}
                className="px-3 py-1.5 text-sm text-indigo-400 font-medium transition-colors rounded-md bg-indigo-600/10"
              >
                Docs
              </button>
              <button
                onClick={() => scrollTo('auth')}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                API Reference
              </button>
              <Link
                to="/pricing"
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                Pricing
              </Link>
            </nav>
          </div>

          {/* Center - search */}
          <div className="hidden md:flex flex-1 max-w-md mx-6">
            <div className="relative w-full">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search endpoints...  /"
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-900 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/* Body */}
      {/* ----------------------------------------------------------------- */}
      <div className="pt-16 flex max-w-[90rem] mx-auto">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed top-16 bottom-0 left-0 z-40 w-64 bg-gray-950 border-r border-gray-800 overflow-y-auto transition-transform duration-200 ease-in-out lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Mobile search */}
          <div className="md:hidden p-4 pb-2">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search endpoints..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-gray-900 border border-gray-800 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>

          <nav className="p-4 space-y-0.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">
              Getting Started
            </p>
            {navItems.slice(0, 4).map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeSection === item.id
                    ? 'bg-indigo-600/10 text-indigo-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {item.label}
              </button>
            ))}

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2 px-3 pt-3 border-t border-gray-800">
              API Reference
            </p>
            {navItems.slice(4).map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeSection === item.id
                    ? 'bg-indigo-600/10 text-indigo-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {item.label}
              </button>
            ))}

            <div className="pt-3 mt-3 border-t border-gray-800">
              <a
                href="/api-docs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Swagger / OpenAPI
              </a>
              <a
                href="/api/openapi.json"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Download OpenAPI JSON
              </a>
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main ref={mainRef} className="flex-1 min-w-0 px-4 sm:px-8 lg:px-12 py-10 lg:py-12">
          <div className="max-w-3xl">
            {/* -------------------------------------------------------------- */}
            {/* Overview */}
            {/* -------------------------------------------------------------- */}
            <Section id="overview">
              <h1 className="text-4xl font-bold tracking-tight text-white">API Reference</h1>
              <p className="mt-4 text-lg text-gray-400 leading-relaxed">
                DevSignal provides a REST API for managing your developer signal data, ingesting product usage
                signals, computing PQA scores, and automating your PLG sales motion. All endpoints
                return JSON and follow standard HTTP semantics.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                  <h3 className="text-sm font-semibold text-gray-300">Base URL</h3>
                  <code className="mt-2 block text-sm text-indigo-400 font-mono">
                    https://api.devsignal.io/api/v1
                  </code>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                  <h3 className="text-sm font-semibold text-gray-300">Content Type</h3>
                  <code className="mt-2 block text-sm text-indigo-400 font-mono">
                    application/json
                  </code>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                  <h3 className="text-sm font-semibold text-gray-300">Endpoints</h3>
                  <p className="mt-2 text-sm text-indigo-400 font-mono">{totalEndpoints} endpoints</p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Organization Context</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Most endpoints require an organization context. Pass the organization ID via the{' '}
                  <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">x-organization-id</code>{' '}
                  header with every request. This ensures multi-tenant data isolation.
                </p>
              </div>

              <div className="mt-4 rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">GraphQL</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  In addition to REST, DevSignal provides a full GraphQL API at{' '}
                  <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">/api/v1/graphql</code>{' '}
                  with Apollo Server and 11 DataLoaders for efficient nested queries.
                </p>
              </div>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* Authentication */}
            {/* -------------------------------------------------------------- */}
            <Section id="authentication">
              <div className="mt-16 border-t border-gray-800 pt-10">
                <h2 className="text-2xl font-bold text-white">Authentication</h2>
                <p className="mt-3 text-gray-400 leading-relaxed">
                  DevSignal supports two authentication methods. Use JWT Bearer tokens for
                  user-facing sessions, and API keys for server-to-server integrations and CI/CD.
                </p>

                <div className="mt-6 space-y-4">
                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      JWT Bearer Token
                    </h3>
                    <p className="mt-2 text-sm text-gray-400">
                      Obtain tokens via{' '}
                      <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">POST /auth/login</code>.
                      Access tokens expire in 15 minutes; use{' '}
                      <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">POST /auth/refresh</code>{' '}
                      to get a new pair.
                    </p>
                    <div className="mt-3">
                      <CodeBlock
                        language="http"
                        code='Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      API Key
                    </h3>
                    <p className="mt-2 text-sm text-gray-400">
                      Create API keys in Settings or via{' '}
                      <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">POST /api-keys</code>.
                      Keys use the <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">ds_live_</code> prefix
                      and support scoped permissions (e.g., <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">signals:write</code>,{' '}
                      <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">contacts:read</code>).
                    </p>
                    <div className="mt-3">
                      <CodeBlock
                        language="http"
                        code='Authorization: Bearer ds_live_a1b2c3d4e5...'
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      SSO (SAML / OIDC)
                    </h3>
                    <p className="mt-2 text-sm text-gray-400">
                      Enterprise SSO via SAML 2.0 and OpenID Connect (PKCE flow). Available on the Scale plan.
                      Also supports GitHub and Google OAuth for social login.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/5 p-5">
                  <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    Security Note
                  </h3>
                  <p className="mt-2 text-sm text-gray-400">
                    Never expose your API key in client-side code. Use environment variables and server-side
                    proxies. API keys should only be used from trusted backend services.
                  </p>
                </div>
              </div>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* Rate Limits */}
            {/* -------------------------------------------------------------- */}
            <Section id="rate-limits">
              <div className="mt-16 border-t border-gray-800 pt-10">
                <h2 className="text-2xl font-bold text-white">Rate Limits</h2>
                <p className="mt-3 text-gray-400 leading-relaxed">
                  All API requests are rate limited per IP address. Rate limit headers are returned with every
                  response following the{' '}
                  <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">RateLimit-*</code>{' '}
                  standard.
                </p>

                <div className="mt-6 rounded-lg border border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900/80">
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Tier</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Limit</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">Scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RATE_LIMITS.map((rl, i) => (
                        <tr
                          key={i}
                          className={`border-t border-gray-800/50 ${i % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}`}
                        >
                          <td className="px-4 py-3">
                            <span className="text-gray-200 font-medium">{rl.name}</span>
                            <p className="text-xs text-gray-500 mt-0.5 sm:hidden">{rl.scope}</p>
                          </td>
                          <td className="px-4 py-3">
                            <code className="text-indigo-400 font-mono text-xs bg-gray-800 px-2 py-0.5 rounded">
                              {rl.limit}
                            </code>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <code className="text-gray-400 font-mono text-xs">{rl.scope}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4">
                  <CodeBlock
                    language="http"
                    code={`HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1708099260
Retry-After: 42

{
  "error": "Too many requests from this IP. Please try again later."
}`}
                  />
                </div>
              </div>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* Quick Start */}
            {/* -------------------------------------------------------------- */}
            <Section id="quick-start">
              <div className="mt-16 border-t border-gray-800 pt-10">
                <h2 className="text-2xl font-bold text-white">Quick Start</h2>
                <p className="mt-3 text-gray-400 leading-relaxed">
                  Send your first product usage signal in under a minute. Install the SDK, configure
                  your API key, and start tracking.
                </p>

                {/* Step 1 -- Install */}
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">1. Install the SDK</h3>
                  <CodeBlock language="bash" code="npm install @devsignal/node" />
                </div>

                {/* Step 2 -- Initialize */}
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">2. Initialize and send a signal</h3>
                  <CodeBlock
                    language="typescript"
                    code={`<span class="text-blue-400">import</span> { DevSignal } <span class="text-blue-400">from</span> <span class="text-emerald-400">'@devsignal/node'</span>;

<span class="text-blue-400">const</span> ds = <span class="text-blue-400">new</span> <span class="text-yellow-300">DevSignal</span>({
  <span class="text-gray-300">apiKey</span>: process.env.<span class="text-gray-100">DEVSIGNAL_API_KEY</span>,
  <span class="text-gray-300">orgId</span>:  process.env.<span class="text-gray-100">DEVSIGNAL_ORG_ID</span>,
});

<span class="text-gray-500">// Track a product usage event</span>
<span class="text-blue-400">await</span> ds.<span class="text-yellow-300">signal</span>({
  <span class="text-gray-300">sourceId</span>: <span class="text-emerald-400">'github-app'</span>,
  <span class="text-gray-300">type</span>:     <span class="text-emerald-400">'repo_clone'</span>,
  <span class="text-gray-300">actorId</span>: <span class="text-emerald-400">'contact_abc123'</span>,
  <span class="text-gray-300">metadata</span>: {
    <span class="text-gray-300">repo</span>: <span class="text-emerald-400">'acme/sdk'</span>,
    <span class="text-gray-300">branch</span>: <span class="text-emerald-400">'main'</span>,
  },
});`}
                  />
                </div>

                {/* Step 3 -- curl example */}
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">3. Or use curl directly</h3>
                  <CodeBlock
                    language="bash"
                    code={`curl -X POST https://api.devsignal.io/api/v1/signals \\
  -H "Authorization: Bearer ds_live_YOUR_KEY" \\
  -H "x-organization-id: YOUR_ORG_ID" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sourceId": "github-app",
    "type": "repo_clone",
    "actorId": "contact_abc123",
    "metadata": { "repo": "acme/sdk" }
  }'`}
                  />
                </div>

                {/* Step 4 -- Batch */}
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">4. Batch ingest (up to 1,000 signals)</h3>
                  <CodeBlock
                    language="typescript"
                    code={`<span class="text-blue-400">await</span> ds.<span class="text-yellow-300">signalBatch</span>([
  { <span class="text-gray-300">sourceId</span>: <span class="text-emerald-400">'web-app'</span>, <span class="text-gray-300">type</span>: <span class="text-emerald-400">'feature_used'</span>, <span class="text-gray-300">actorId</span>: <span class="text-emerald-400">'c_1'</span>, <span class="text-gray-300">metadata</span>: { <span class="text-gray-300">feature</span>: <span class="text-emerald-400">'dashboard'</span> } },
  { <span class="text-gray-300">sourceId</span>: <span class="text-emerald-400">'web-app'</span>, <span class="text-gray-300">type</span>: <span class="text-emerald-400">'feature_used'</span>, <span class="text-gray-300">actorId</span>: <span class="text-emerald-400">'c_2'</span>, <span class="text-gray-300">metadata</span>: { <span class="text-gray-300">feature</span>: <span class="text-emerald-400">'api-keys'</span> } },
  <span class="text-gray-500">// ... up to 1,000 signals per batch</span>
]);`}
                  />
                </div>

                {/* Step 5 -- Verify */}
                <div className="mt-8">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">5. Verify your signal was received</h3>
                  <CodeBlock
                    language="bash"
                    code={`curl "https://api.devsignal.io/api/v1/signals?type=repo_clone&limit=5" \\
  -H "Authorization: Bearer ds_live_YOUR_KEY" \\
  -H "x-organization-id: YOUR_ORG_ID"`}
                  />
                </div>
              </div>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* Search results info */}
            {/* -------------------------------------------------------------- */}
            {searchQuery.trim() && (
              <div className="mt-12 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 flex items-center justify-between">
                <p className="text-sm text-gray-300">
                  Showing{' '}
                  <span className="text-white font-medium">
                    {filteredCategories.reduce((s, c) => s + c.endpoints.length, 0)}
                  </span>{' '}
                  endpoints across{' '}
                  <span className="text-white font-medium">{filteredCategories.length}</span>{' '}
                  categories matching{' '}
                  <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">
                    {searchQuery}
                  </code>
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* Endpoint categories */}
            {/* -------------------------------------------------------------- */}
            <div className="mt-8">
              {filteredCategories.map((category, idx) => (
                <CollapsibleSection
                  key={category.id}
                  id={category.id}
                  label={category.label}
                  description={category.description}
                  endpoints={category.endpoints}
                  defaultOpen={idx < 3 || !!searchQuery.trim()}
                />
              ))}
            </div>

            {/* No results */}
            {searchQuery.trim() && filteredCategories.length === 0 && (
              <div className="mt-12 text-center py-16">
                <svg className="w-12 h-12 mx-auto text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="mt-4 text-gray-400">
                  No endpoints match <span className="text-white">"{searchQuery}"</span>
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Clear search
                </button>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* PLG Pipeline Stages reference */}
            {/* -------------------------------------------------------------- */}
            {!searchQuery.trim() && (
              <div className="mt-16 border-t border-gray-800 pt-10">
                <h2 className="text-xl font-bold text-white mb-3">PLG Pipeline Stages</h2>
                <p className="text-sm text-gray-400 mb-4">
                  DevSignal uses a PLG-native pipeline with these stages, from anonymous usage through closed deal:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'ANONYMOUS_USAGE',
                    'IDENTIFIED',
                    'ACTIVATED',
                    'TEAM_ADOPTION',
                    'EXPANSION_SIGNAL',
                    'SALES_QUALIFIED',
                    'NEGOTIATION',
                    'CLOSED_WON',
                    'CLOSED_LOST',
                  ].map((stage) => (
                    <span
                      key={stage}
                      className="px-2.5 py-1 text-xs font-mono rounded bg-gray-800 text-gray-300 border border-gray-700"
                    >
                      {stage}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* Workflow trigger events reference */}
            {/* -------------------------------------------------------------- */}
            {!searchQuery.trim() && (
              <div className="mt-10">
                <h2 className="text-xl font-bold text-white mb-3">Workflow Trigger Events</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Workflows can be triggered by the following events:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { event: 'signal_received', desc: 'A new product usage signal is ingested' },
                    { event: 'contact_created', desc: 'A new contact is added to the CRM' },
                    { event: 'deal_stage_changed', desc: 'A deal moves to a new pipeline stage' },
                    { event: 'score_changed', desc: 'An account\'s PQA score crosses a tier threshold' },
                  ].map((t) => (
                    <div key={t.event} className="rounded-lg border border-gray-800 bg-gray-900/40 p-4">
                      <code className="text-sm font-mono text-indigo-400">{t.event}</code>
                      <p className="text-xs text-gray-500 mt-1">{t.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* Webhook event types reference */}
            {/* -------------------------------------------------------------- */}
            {!searchQuery.trim() && (
              <div className="mt-10">
                <h2 className="text-xl font-bold text-white mb-3">Webhook Event Types</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Subscribe to these events via webhook subscriptions. Payloads are HMAC-signed with SHA-256.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'signal.created',
                    'contact.created',
                    'contact.updated',
                    'company.created',
                    'deal.created',
                    'deal.stage_changed',
                    'score.changed',
                    'workflow.triggered',
                  ].map((evt) => (
                    <span
                      key={evt}
                      className="px-2.5 py-1 text-xs font-mono rounded bg-gray-800 text-gray-300 border border-gray-700"
                    >
                      {evt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* Error codes reference */}
            {/* -------------------------------------------------------------- */}
            {!searchQuery.trim() && (
              <div className="mt-10 border-t border-gray-800 pt-10">
                <h2 className="text-xl font-bold text-white mb-3">Error Handling</h2>
                <p className="text-sm text-gray-400 mb-4">
                  All errors return a consistent JSON shape. Use the HTTP status code and error message to handle failures.
                </p>
                <JsonBlock
                  json={`{
  "error": "Contact not found",
  "statusCode": 404,
  "isOperational": true
}`}
                  label="Error response"
                />
                <div className="mt-4 rounded-lg border border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900/80">
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                        <th className="text-left px-4 py-3 text-gray-400 font-medium">Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { code: '200', desc: 'OK -- Request succeeded' },
                        { code: '201', desc: 'Created -- Resource created' },
                        { code: '204', desc: 'No Content -- Resource deleted' },
                        { code: '400', desc: 'Bad Request -- Validation error' },
                        { code: '401', desc: 'Unauthorized -- Missing or invalid token' },
                        { code: '403', desc: 'Forbidden -- Insufficient role' },
                        { code: '404', desc: 'Not Found -- Resource does not exist' },
                        { code: '429', desc: 'Too Many Requests -- Rate limit exceeded' },
                        { code: '500', desc: 'Internal Server Error' },
                      ].map((s, i) => (
                        <tr key={s.code} className={`border-t border-gray-800/50 ${i % 2 === 0 ? 'bg-gray-900/30' : 'bg-gray-900/10'}`}>
                          <td className="px-4 py-2">
                            <code className="text-indigo-400 font-mono text-xs">{s.code}</code>
                          </td>
                          <td className="px-4 py-2 text-gray-400">{s.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------- */}
            {/* Footer */}
            {/* -------------------------------------------------------------- */}
            <div className="mt-16 border-t border-gray-800 pt-10 pb-20">
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-6">
                <h3 className="text-lg font-semibold text-white">Full OpenAPI Specification</h3>
                <p className="mt-2 text-sm text-gray-400">
                  Explore the complete interactive API documentation with request/response schemas,
                  try-it-out forms, and downloadable OpenAPI spec.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <a
                    href="/api-docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    Open Swagger Docs
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                  <a
                    href="/api/openapi.json"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 rounded-lg transition-colors"
                  >
                    Download OpenAPI JSON
                  </a>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-between text-sm text-gray-600">
                <span>DevSignal -- Built for devtool PLG teams</span>
                <div className="flex items-center gap-4">
                  <Link to="/login" className="hover:text-gray-400 transition-colors">
                    Sign In
                  </Link>
                  <Link to="/register" className="hover:text-gray-400 transition-colors">
                    Get Started
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
