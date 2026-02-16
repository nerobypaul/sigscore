/**
 * Load Test Configuration for DevSignal — Show HN Traffic Simulation
 *
 * Models a realistic Hacker News front-page traffic pattern:
 * - 2,000-5,000 unique visitors over 4 hours
 * - Traffic ramps up quickly, peaks at hour 1-2, then tapers
 * - Most visitors hit the landing page, a fraction explore deeper
 *
 * Rate limit awareness (from backend/src/middleware/rate-limit.ts):
 *   - /api/*          : 100 req/min/IP
 *   - /api/v1/signals : 500 req/min/IP
 *   - /api/v1/demo/*  : 3 req/min/IP
 *   - /api/v1/auth/*  : 5 req/min/IP
 */

'use strict';

const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Traffic distribution (must sum to 1.0)
// ---------------------------------------------------------------------------
const ENDPOINTS = [
  {
    name: 'Landing Page',
    method: 'GET',
    path: '/',
    weight: 0.40,
    auth: false,
    description: 'SPA index.html — the first thing every HN visitor hits',
  },
  {
    name: 'Health Check',
    method: 'GET',
    path: '/health',
    weight: 0.10,
    auth: false,
    description: 'Monitors / uptime checkers / bots',
  },
  {
    name: 'API Docs',
    method: 'GET',
    path: '/api-docs.json',
    weight: 0.10,
    auth: false,
    description: 'Devs checking the OpenAPI spec',
  },
  {
    name: 'Demo Status',
    method: 'GET',
    path: '/api/v1/demo/status',
    weight: 0.10,
    auth: false,
    description: 'Visitors checking if demo is available',
  },
  {
    name: 'Demo Seed',
    method: 'POST',
    path: '/api/v1/demo/seed',
    weight: 0.05,
    auth: false,
    description: 'Curious visitors creating a demo environment',
    body: null,
    rateNote: '3 req/min — will get rate-limited under load (expected)',
  },
  {
    name: 'Company List',
    method: 'GET',
    path: '/api/v1/companies',
    weight: 0.10,
    auth: true,
    description: 'Authenticated users browsing companies',
  },
  {
    name: 'Signal Ingest',
    method: 'POST',
    path: '/api/v1/signals',
    weight: 0.05,
    auth: true,
    description: 'SDK test — signal ingestion pipeline',
    body: {
      sourceId: 'load-test',
      type: 'page_view',
      anonymousId: 'load-test-anon-{id}',
      metadata: { url: '/docs', source: 'load-test' },
    },
  },
  {
    name: 'Auth Login',
    method: 'POST',
    path: '/api/v1/auth/login',
    weight: 0.05,
    auth: false,
    description: 'Visitors attempting login (will fail with invalid creds — tests error path)',
    body: {
      email: 'loadtest@example.com',
      password: 'loadtest123456',
    },
    rateNote: '5 req/min — will get rate-limited under load (expected)',
  },
  {
    name: 'Contact List',
    method: 'GET',
    path: '/api/v1/contacts',
    weight: 0.05,
    auth: true,
    description: 'Authenticated users browsing contacts',
  },
];

// ---------------------------------------------------------------------------
// Show HN traffic shape: 4 phases over 4 hours
// ---------------------------------------------------------------------------
// Phase durations in minutes. Concurrency = simulated parallel connections.
const PHASES = [
  { name: 'ramp-up',   durationMin: 15,  startConcurrency: 2,   endConcurrency: 30  },
  { name: 'peak',      durationMin: 90,  startConcurrency: 30,  endConcurrency: 50  },
  { name: 'sustained', durationMin: 60,  startConcurrency: 50,  endConcurrency: 20  },
  { name: 'tail',      durationMin: 75,  startConcurrency: 20,  endConcurrency: 2   },
];

// ---------------------------------------------------------------------------
// Quick-test profile (for CI / local validation — runs in ~60 seconds)
// ---------------------------------------------------------------------------
const QUICK_PHASES = [
  { name: 'ramp-up',   durationMin: 0.25, startConcurrency: 1,  endConcurrency: 10 },
  { name: 'peak',      durationMin: 0.5,  startConcurrency: 10, endConcurrency: 20 },
  { name: 'sustained', durationMin: 0.25, startConcurrency: 20, endConcurrency: 5  },
];

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  BASE_URL,
  ENDPOINTS,
  PHASES,
  QUICK_PHASES,
};
