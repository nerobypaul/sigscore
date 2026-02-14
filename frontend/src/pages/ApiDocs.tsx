import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
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
      { method: 'POST', path: '/auth/register', description: 'Create a new user account' },
      { method: 'POST', path: '/auth/login', description: 'Authenticate with email and password' },
      { method: 'POST', path: '/auth/refresh', description: 'Exchange a refresh token for a new token pair' },
      { method: 'POST', path: '/auth/logout', description: 'Invalidate the current refresh token' },
      { method: 'GET', path: '/auth/me', description: 'Get the authenticated user profile and orgs' },
    ],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    description:
      'Manage contacts within your organization. Supports search, pagination, filtering by company, and full CRUD operations.',
    endpoints: [
      { method: 'GET', path: '/contacts', description: 'List contacts with search and pagination' },
      { method: 'GET', path: '/contacts/:id', description: 'Get a single contact with company, deals, tags' },
      { method: 'POST', path: '/contacts', description: 'Create a new contact' },
      { method: 'PUT', path: '/contacts/:id', description: 'Update an existing contact' },
      { method: 'DELETE', path: '/contacts/:id', description: 'Permanently delete a contact' },
    ],
  },
  {
    id: 'companies',
    label: 'Companies',
    description:
      'Manage companies (accounts). Companies are the core entity for PLG signal tracking and PQA scoring.',
    endpoints: [
      { method: 'GET', path: '/companies', description: 'List companies with search, industry filter' },
      { method: 'GET', path: '/companies/:id', description: 'Get company details with contacts, deals, tags' },
      { method: 'POST', path: '/companies', description: 'Create a new company' },
      { method: 'PUT', path: '/companies/:id', description: 'Update an existing company' },
      { method: 'DELETE', path: '/companies/:id', description: 'Delete a company' },
    ],
  },
  {
    id: 'deals',
    label: 'Deals',
    description:
      'PLG-native deal pipeline with stages from ANONYMOUS_USAGE through CLOSED_WON. Filter by stage, owner, or company.',
    endpoints: [
      { method: 'GET', path: '/deals', description: 'List deals with stage, owner, company filters' },
      { method: 'GET', path: '/deals/:id', description: 'Get deal with contact, company, owner, activities' },
      { method: 'POST', path: '/deals', description: 'Create a deal in the PLG pipeline' },
      { method: 'PUT', path: '/deals/:id', description: 'Update deal stage, amount, or metadata' },
      { method: 'DELETE', path: '/deals/:id', description: 'Delete a deal' },
    ],
  },
  {
    id: 'activities',
    label: 'Activities',
    description:
      'Track tasks, calls, meetings, emails, and notes linked to contacts, companies, or deals.',
    endpoints: [
      { method: 'GET', path: '/activities', description: 'List activities with type, status, entity filters' },
      { method: 'GET', path: '/activities/:id', description: 'Get an activity with related entities' },
      { method: 'POST', path: '/activities', description: 'Create a task, call, meeting, email, or note' },
      { method: 'PUT', path: '/activities/:id', description: 'Update activity status, priority, or details' },
      { method: 'DELETE', path: '/activities/:id', description: 'Delete an activity' },
    ],
  },
  {
    id: 'signals',
    label: 'Signals',
    description:
      'Ingest product usage signals, query signal history, view account timelines, and compute PQA scores. The core of DevSignal\'s PLG intelligence.',
    endpoints: [
      { method: 'POST', path: '/signals', description: 'Ingest a single signal event' },
      { method: 'POST', path: '/signals/batch', description: 'Ingest up to 1,000 signals in one request' },
      { method: 'GET', path: '/signals', description: 'Query signals with type, source, date filters' },
      { method: 'GET', path: '/signals/accounts/top', description: 'Get top accounts by PQA score' },
      { method: 'GET', path: '/signals/accounts/:accountId/timeline', description: 'Merged signal + activity timeline' },
      { method: 'GET', path: '/signals/accounts/:accountId/score', description: 'Get account PQA score' },
      { method: 'POST', path: '/signals/accounts/:accountId/score', description: 'Recompute PQA score for account' },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    description:
      'Full-text search across contacts, companies, deals, and signals using PostgreSQL tsvector with weighted relevance scoring.',
    endpoints: [
      { method: 'GET', path: '/search?q=...', description: 'Global search with prefix matching and type filters' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    description:
      'AI-powered account briefs, next-best-action suggestions, and contact enrichment powered by LLMs.',
    endpoints: [
      { method: 'GET', path: '/ai/brief/:accountId', description: 'Get the cached AI brief for an account' },
      { method: 'POST', path: '/ai/brief/:accountId', description: 'Generate a new AI account brief' },
      { method: 'POST', path: '/ai/suggest/:accountId', description: 'Get AI-suggested next-best-actions' },
      { method: 'POST', path: '/ai/enrich/:contactId', description: 'Enrich a contact with AI' },
    ],
  },
  {
    id: 'webhooks',
    label: 'Webhooks',
    description:
      'Register HTTPS webhook endpoints to receive real-time notifications when signals are ingested or platform events occur.',
    endpoints: [
      { method: 'GET', path: '/webhooks', description: 'List webhook endpoints with delivery counts' },
      { method: 'POST', path: '/webhooks', description: 'Register a new webhook endpoint (HTTPS only)' },
      { method: 'DELETE', path: '/webhooks/:id', description: 'Delete a webhook endpoint' },
    ],
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    description:
      'Manage API keys for programmatic access. Keys use scoped permissions and the ds_live_ prefix.',
    endpoints: [
      { method: 'GET', path: '/api-keys', description: 'List API keys (key prefix only)' },
      { method: 'POST', path: '/api-keys', description: 'Create a new API key with scopes' },
      { method: 'PUT', path: '/api-keys/:id/revoke', description: 'Revoke an API key' },
      { method: 'DELETE', path: '/api-keys/:id', description: 'Permanently delete an API key' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const METHOD_STYLES: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PUT: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold font-mono border ${METHOD_STYLES[method] ?? 'bg-gray-700 text-gray-300'}`}
      style={{ minWidth: '3.5rem' }}
    >
      {method}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Code block component with manual syntax colouring via CSS classes
// ---------------------------------------------------------------------------

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
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
  const mainRef = useRef<HTMLDivElement>(null);

  // Track which section is visible via IntersectionObserver
  useEffect(() => {
    const ids = ['overview', 'authentication', 'quick-start', ...API_CATEGORIES.map((c) => c.id)];
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
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                Docs
              </button>
              <button
                onClick={() => scrollTo('auth')}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                API Reference
              </button>
              <a
                href="https://www.npmjs.com/package/@devsignal/node"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors rounded-md hover:bg-gray-800/50"
              >
                SDK
              </a>
            </nav>
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
          <nav className="p-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  activeSection === item.id
                    ? 'bg-indigo-600/10 text-indigo-400 font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                }`}
              >
                {item.label}
              </button>
            ))}

            <div className="pt-4 mt-4 border-t border-gray-800">
              <a
                href="/api-docs"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Swagger / OpenAPI
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

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                  <h3 className="text-sm font-semibold text-gray-300">Base URL</h3>
                  <code className="mt-2 block text-sm text-indigo-400 font-mono">
                    https://api.devsignal.io/api
                  </code>
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                  <h3 className="text-sm font-semibold text-gray-300">Content Type</h3>
                  <code className="mt-2 block text-sm text-indigo-400 font-mono">
                    application/json
                  </code>
                </div>
              </div>

              <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900/50 p-5">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Organization Context</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Most endpoints require an organization context. Pass the organization ID via the{' '}
                  <code className="text-indigo-400 text-xs bg-gray-800 px-1.5 py-0.5 rounded">x-organization-id</code>{' '}
                  header with every request.
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
                      Pass the access token in the Authorization header.
                    </p>
                    <CodeBlock
                      language="http"
                      code='Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'
                    />
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
                      and support scoped permissions.
                    </p>
                    <CodeBlock
                      language="http"
                      code='Authorization: Bearer ds_live_a1b2c3d4e5...'
                    />
                  </div>
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
                    code={`curl -X POST https://api.devsignal.io/api/signals \\
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
              </div>
            </Section>

            {/* -------------------------------------------------------------- */}
            {/* Endpoint categories */}
            {/* -------------------------------------------------------------- */}
            {API_CATEGORIES.map((category) => (
              <Section key={category.id} id={category.id}>
                <div className="mt-16 border-t border-gray-800 pt-10">
                  <h2 className="text-2xl font-bold text-white">{category.label}</h2>
                  <p className="mt-3 text-gray-400 leading-relaxed">{category.description}</p>

                  <div className="mt-6 space-y-2">
                    {category.endpoints.map((ep, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 px-4 py-3 rounded-lg border border-gray-800 bg-gray-900/40 hover:bg-gray-900/70 transition-colors"
                      >
                        <MethodBadge method={ep.method} />
                        <div className="min-w-0">
                          <code className="text-sm font-mono text-gray-200">{ep.path}</code>
                          <p className="text-sm text-gray-500 mt-0.5">{ep.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inline code examples for select categories */}
                  {category.id === 'contacts' && (
                    <div className="mt-6 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-300">Example: Create a contact</h4>
                      <CodeBlock
                        language="typescript"
                        code={`<span class="text-blue-400">const</span> res = <span class="text-blue-400">await</span> <span class="text-yellow-300">fetch</span>(<span class="text-emerald-400">'https://api.devsignal.io/api/contacts'</span>, {
  <span class="text-gray-300">method</span>: <span class="text-emerald-400">'POST'</span>,
  <span class="text-gray-300">headers</span>: {
    <span class="text-emerald-400">'Authorization'</span>: <span class="text-emerald-400">\`Bearer \${apiKey}\`</span>,
    <span class="text-emerald-400">'x-organization-id'</span>: orgId,
    <span class="text-emerald-400">'Content-Type'</span>: <span class="text-emerald-400">'application/json'</span>,
  },
  <span class="text-gray-300">body</span>: <span class="text-yellow-300">JSON.stringify</span>({
    <span class="text-gray-300">firstName</span>: <span class="text-emerald-400">'Jane'</span>,
    <span class="text-gray-300">lastName</span>: <span class="text-emerald-400">'Doe'</span>,
    <span class="text-gray-300">email</span>: <span class="text-emerald-400">'jane@acme.com'</span>,
    <span class="text-gray-300">title</span>: <span class="text-emerald-400">'Staff Engineer'</span>,
    <span class="text-gray-300">github</span>: <span class="text-emerald-400">'janedoe'</span>,
  }),
});

<span class="text-blue-400">const</span> contact = <span class="text-blue-400">await</span> res.<span class="text-yellow-300">json</span>();`}
                      />
                    </div>
                  )}

                  {category.id === 'signals' && (
                    <div className="mt-6 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-300">Example: Query signals by date range</h4>
                      <CodeBlock
                        language="bash"
                        code={`curl "https://api.devsignal.io/api/signals?type=repo_clone&from=2025-01-01T00:00:00Z&limit=50" \\
  -H "Authorization: Bearer ds_live_YOUR_KEY" \\
  -H "x-organization-id: YOUR_ORG_ID"`}
                      />
                    </div>
                  )}

                  {category.id === 'deals' && (
                    <div className="mt-6 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-300">PLG Pipeline Stages</h4>
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

                  {category.id === 'webhooks' && (
                    <div className="mt-6 space-y-4">
                      <h4 className="text-sm font-semibold text-gray-300">Example: Register a webhook</h4>
                      <CodeBlock
                        language="bash"
                        code={`curl -X POST https://api.devsignal.io/api/webhooks \\
  -H "Authorization: Bearer ds_live_YOUR_KEY" \\
  -H "x-organization-id: YOUR_ORG_ID" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-app.com/webhooks/devsignal",
    "events": ["signal.created", "deal.stage_changed"]
  }'`}
                      />
                    </div>
                  )}
                </div>
              </Section>
            ))}

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
                <a
                  href="/api-docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                >
                  Open Swagger Docs
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
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
