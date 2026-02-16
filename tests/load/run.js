#!/usr/bin/env node

/**
 * DevSignal Load Test — Show HN Traffic Simulator
 *
 * Pure Node.js (zero external dependencies). Simulates the traffic pattern of
 * a Hacker News front-page post: 2,000-5,000 visitors over 4 hours with a
 * realistic ramp-up / peak / tail distribution.
 *
 * Usage:
 *   node tests/load/run.js                       # Full 4-hour simulation
 *   node tests/load/run.js --quick               # Quick ~60s smoke test
 *   node tests/load/run.js --duration 5          # Custom duration in minutes
 *   LOAD_TEST_URL=https://app.devsignal.dev node tests/load/run.js
 *
 * Environment variables:
 *   LOAD_TEST_URL      Target URL (default: http://localhost:3000)
 *   LOAD_TEST_TOKEN    JWT token for authenticated endpoints (optional)
 *   LOAD_TEST_ORG_ID   Organization ID header (optional)
 *
 * Output: Full report with RPS, latency percentiles, error rate, and
 * per-endpoint breakdown printed to stdout. JSON report saved to
 * tests/load/results/report-<timestamp>.json
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { request, destroy } = require('./http-client');
const { StatsCollector } = require('./stats');
const { BASE_URL, ENDPOINTS, PHASES, QUICK_PHASES } = require('./config');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const isQuick = args.includes('--quick') || args.includes('-q');
const durationIdx = args.indexOf('--duration');
const customDurationMin = durationIdx !== -1 ? parseFloat(args[durationIdx + 1]) : null;

// ---------------------------------------------------------------------------
// Auth tokens (from env or will be obtained via demo/seed)
// ---------------------------------------------------------------------------
let authToken = process.env.LOAD_TEST_TOKEN || null;
let orgId = process.env.LOAD_TEST_ORG_ID || null;

// ---------------------------------------------------------------------------
// Weighted random endpoint selection
// ---------------------------------------------------------------------------
function pickEndpoint() {
  const rand = Math.random();
  let cumulative = 0;
  for (const ep of ENDPOINTS) {
    cumulative += ep.weight;
    if (rand <= cumulative) return ep;
  }
  return ENDPOINTS[0]; // fallback
}

// ---------------------------------------------------------------------------
// Build a request body with dynamic substitution
// ---------------------------------------------------------------------------
function buildBody(ep) {
  if (!ep.body) return null;
  const body = JSON.parse(JSON.stringify(ep.body));
  // Replace {id} placeholders with unique values
  for (const key of Object.keys(body)) {
    if (typeof body[key] === 'string' && body[key].includes('{id}')) {
      body[key] = body[key].replace('{id}', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    }
  }
  return body;
}

// ---------------------------------------------------------------------------
// Attempt to obtain auth credentials via demo/seed
// ---------------------------------------------------------------------------
async function obtainAuthCredentials() {
  if (authToken && orgId) {
    console.log('  Using provided auth token and org ID');
    return;
  }

  console.log('  Obtaining auth credentials via POST /api/v1/demo/seed ...');
  const res = await request('POST', `${BASE_URL}/api/v1/demo/seed`, {
    headers: { 'content-type': 'application/json' },
    timeoutMs: 30_000,
  });

  if (res.statusCode === 200 || res.statusCode === 201) {
    try {
      const data = JSON.parse(res.body);
      authToken = data.accessToken;
      orgId = data.organizationId;
      console.log(`  Auth obtained: org=${orgId}`);
      return;
    } catch (_e) {
      // fall through
    }
  }

  console.log(`  Warning: Could not obtain auth (status=${res.statusCode}).`);
  console.log('  Authenticated endpoints will return 401 (this is OK for load testing).');
  console.log('  To test authenticated routes, set LOAD_TEST_TOKEN and LOAD_TEST_ORG_ID env vars.');
}

// ---------------------------------------------------------------------------
// Fire a single request
// ---------------------------------------------------------------------------
async function fireRequest(stats) {
  const ep = pickEndpoint();

  // Skip authenticated endpoints if we have no token
  if (ep.auth && !authToken) {
    // Still fire to test the 401 path under load
  }

  const headers = {};
  if (ep.auth && authToken) {
    headers['authorization'] = `Bearer ${authToken}`;
  }
  if (ep.auth && orgId) {
    headers['x-organization-id'] = orgId;
  }

  const body = buildBody(ep);
  const url = `${BASE_URL}${ep.path}`;

  stats.onRequestStart();
  const res = await request(ep.method, url, { headers, body, timeoutMs: 15_000 });
  stats.onRequestEnd();

  stats.record(ep.name, res.statusCode, res.latencyMs, res.error);
}

// ---------------------------------------------------------------------------
// Sleep utility
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Interpolate concurrency within a phase
// ---------------------------------------------------------------------------
function getConcurrency(phase, elapsed) {
  const phaseMs = phase.durationMin * 60 * 1000;
  const progress = Math.min(elapsed / phaseMs, 1);
  return Math.round(
    phase.startConcurrency + (phase.endConcurrency - phase.startConcurrency) * progress,
  );
}

// ---------------------------------------------------------------------------
// Run a single phase
// ---------------------------------------------------------------------------
async function runPhase(phase, stats) {
  const phaseMs = phase.durationMin * 60 * 1000;
  const phaseStart = Date.now();
  let phaseElapsed = 0;
  let requestsFired = 0;

  console.log(
    `\n  Phase: ${phase.name} (${phase.durationMin}min, ` +
    `${phase.startConcurrency}->${phase.endConcurrency} concurrent)`
  );

  while (phaseElapsed < phaseMs) {
    const concurrency = getConcurrency(phase, phaseElapsed);

    // Fire `concurrency` requests in parallel
    const batch = [];
    for (let i = 0; i < concurrency; i++) {
      batch.push(fireRequest(stats));
    }
    await Promise.all(batch);
    requestsFired += batch.length;

    // Brief pause between batches to spread load evenly.
    // At high concurrency, reduce pause to maintain RPS.
    const pauseMs = Math.max(50, 1000 / Math.max(concurrency, 1));
    await sleep(pauseMs);

    phaseElapsed = Date.now() - phaseStart;

    // Progress indicator every 10 seconds
    if (requestsFired % 100 < concurrency) {
      const phasePct = Math.min(100, (phaseElapsed / phaseMs * 100)).toFixed(0);
      process.stdout.write(
        `\r    ${phase.name}: ${phasePct}% | ` +
        `${requestsFired} reqs | ` +
        `concurrent=${concurrency} | ` +
        `elapsed=${(phaseElapsed / 1000).toFixed(0)}s   `
      );
    }
  }

  process.stdout.write('\n');
  console.log(`    Completed: ${requestsFired} requests in ${phase.durationMin}min`);
}

// ---------------------------------------------------------------------------
// Scale phases to custom duration
// ---------------------------------------------------------------------------
function scalePhases(phases, targetDurationMin) {
  const totalMin = phases.reduce((sum, p) => sum + p.durationMin, 0);
  const scale = targetDurationMin / totalMin;
  return phases.map((p) => ({
    ...p,
    durationMin: Math.max(0.1, p.durationMin * scale),
  }));
}

// ---------------------------------------------------------------------------
// Save JSON report
// ---------------------------------------------------------------------------
function saveReport(reportData) {
  const resultsDir = path.join(__dirname, 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(resultsDir, `report-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
  return filePath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('==============================================================================');
  console.log('  DEVSIGNAL LOAD TEST — Show HN Traffic Simulator');
  console.log('==============================================================================');
  console.log(`  Target:    ${BASE_URL}`);
  console.log(`  Mode:      ${isQuick ? 'QUICK (smoke test)' : 'FULL (4-hour simulation)'}`);

  // Select phases
  let phases = isQuick ? QUICK_PHASES : PHASES;
  if (customDurationMin) {
    phases = scalePhases(phases, customDurationMin);
    console.log(`  Duration:  ${customDurationMin} minutes (custom)`);
  } else {
    const totalMin = phases.reduce((sum, p) => sum + p.durationMin, 0);
    console.log(`  Duration:  ${totalMin} minutes`);
  }

  console.log(`  Endpoints: ${ENDPOINTS.length}`);
  console.log('');

  // Connectivity check
  console.log('  Pre-flight: checking connectivity...');
  const probe = await request('GET', `${BASE_URL}/health`, { timeoutMs: 10_000 });
  if (probe.error || probe.statusCode === 0) {
    console.error(`\n  ERROR: Cannot reach ${BASE_URL}/health`);
    console.error(`  Status: ${probe.statusCode}, Error: ${probe.error}`);
    console.error('  Make sure the server is running: npm run dev --workspace=backend');
    console.error('  Or set LOAD_TEST_URL to a reachable target.\n');
    process.exit(1);
  }
  console.log(`  Pre-flight: OK (status=${probe.statusCode}, latency=${probe.latencyMs.toFixed(0)}ms)`);

  // Obtain auth for authenticated endpoints
  await obtainAuthCredentials();

  // Run phases
  const stats = new StatsCollector();

  console.log('\n  Starting load test...');
  for (const phase of phases) {
    await runPhase(phase, stats);
  }

  // Print report
  const reportData = stats.print();

  // Save JSON report
  const reportPath = saveReport(reportData);
  console.log(`  JSON report saved: ${reportPath}`);

  // Interpretation guidance
  console.log('\n  INTERPRETATION GUIDE:');
  console.log('  ' + '-'.repeat(74));
  console.log('  - 429 status codes on /demo/seed and /auth/login are EXPECTED');
  console.log('    (rate limiters working correctly: 3/min and 5/min respectively)');
  console.log('  - 401 on authenticated endpoints without a token is EXPECTED');
  console.log('  - P95 latency < 500ms under load = production ready');
  console.log('  - P99 latency < 2000ms under load = acceptable');
  console.log('  - Error rate (5xx) > 5% = needs investigation');
  console.log('  - Error rate (5xx) < 1% = excellent');
  console.log('');

  // Clean up connections
  destroy();
}

main().catch((err) => {
  console.error('Load test failed:', err);
  destroy();
  process.exit(1);
});
