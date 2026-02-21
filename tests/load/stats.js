/**
 * Statistics collector for load test results.
 *
 * Tracks per-endpoint and aggregate metrics:
 *   - Request count, success/error counts
 *   - Latency percentiles (P50, P95, P99, min, max, mean)
 *   - Status code distribution
 *   - Requests per second
 *   - Max concurrent connections
 */

'use strict';

class StatsCollector {
  constructor() {
    /** @type {Map<string, number[]>} endpoint -> latencies */
    this.latencies = new Map();
    /** @type {Map<string, Map<number, number>>} endpoint -> statusCode -> count */
    this.statusCodes = new Map();
    /** @type {Map<string, number>} endpoint -> error count */
    this.errors = new Map();
    /** @type {Map<string, number>} endpoint -> total requests */
    this.counts = new Map();

    this.startTime = Date.now();
    this.endTime = Date.now();
    this.maxConcurrent = 0;
    this._activeConcurrent = 0;

    // Per-second tracking for RPS calculation
    this._secondBuckets = new Map(); // second -> count
  }

  /** Call before sending a request */
  onRequestStart() {
    this._activeConcurrent++;
    if (this._activeConcurrent > this.maxConcurrent) {
      this.maxConcurrent = this._activeConcurrent;
    }
  }

  /** Call after a request completes */
  onRequestEnd() {
    this._activeConcurrent--;
  }

  /**
   * Record a completed request.
   * @param {string} name - endpoint name
   * @param {number} statusCode - HTTP status (0 = network error)
   * @param {number} latencyMs
   * @param {string} [error]
   */
  record(name, statusCode, latencyMs, error) {
    // Latencies
    if (!this.latencies.has(name)) this.latencies.set(name, []);
    this.latencies.get(name).push(latencyMs);

    // Status codes
    if (!this.statusCodes.has(name)) this.statusCodes.set(name, new Map());
    const codes = this.statusCodes.get(name);
    codes.set(statusCode, (codes.get(statusCode) || 0) + 1);

    // Counts
    this.counts.set(name, (this.counts.get(name) || 0) + 1);

    // Errors (non-2xx or network error)
    if (error || statusCode === 0 || statusCode >= 500) {
      this.errors.set(name, (this.errors.get(name) || 0) + 1);
    }

    // RPS buckets
    const second = Math.floor(Date.now() / 1000);
    this._secondBuckets.set(second, (this._secondBuckets.get(second) || 0) + 1);

    this.endTime = Date.now();
  }

  /** Compute a percentile from a sorted array */
  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /** Get the sustained RPS (median of per-second counts) */
  _sustainedRps() {
    const values = Array.from(this._secondBuckets.values()).sort((a, b) => a - b);
    if (values.length === 0) return 0;
    return this._percentile(values, 50);
  }

  /** Get peak RPS */
  _peakRps() {
    const values = Array.from(this._secondBuckets.values());
    if (values.length === 0) return 0;
    return Math.max(...values);
  }

  /**
   * Build the final report object.
   * @returns {object}
   */
  report() {
    const durationSec = (this.endTime - this.startTime) / 1000;
    let totalRequests = 0;
    let totalErrors = 0;
    const allLatencies = [];

    const endpoints = [];
    for (const [name, lats] of this.latencies) {
      const sorted = lats.slice().sort((a, b) => a - b);
      const count = this.counts.get(name) || 0;
      const errs = this.errors.get(name) || 0;
      const codes = Object.fromEntries(this.statusCodes.get(name) || new Map());

      totalRequests += count;
      totalErrors += errs;
      allLatencies.push(...sorted);

      endpoints.push({
        name,
        requests: count,
        errors: errs,
        errorRate: count > 0 ? ((errs / count) * 100).toFixed(2) + '%' : '0.00%',
        latency: {
          min: sorted.length > 0 ? sorted[0].toFixed(1) : '0.0',
          p50: this._percentile(sorted, 50).toFixed(1),
          p95: this._percentile(sorted, 95).toFixed(1),
          p99: this._percentile(sorted, 99).toFixed(1),
          max: sorted.length > 0 ? sorted[sorted.length - 1].toFixed(1) : '0.0',
          mean: sorted.length > 0
            ? (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1)
            : '0.0',
        },
        statusCodes: codes,
      });
    }

    allLatencies.sort((a, b) => a - b);

    return {
      summary: {
        durationSec: durationSec.toFixed(1),
        totalRequests,
        totalErrors,
        errorRate: totalRequests > 0
          ? ((totalErrors / totalRequests) * 100).toFixed(2) + '%'
          : '0.00%',
        sustainedRps: this._sustainedRps(),
        peakRps: this._peakRps(),
        avgRps: durationSec > 0 ? (totalRequests / durationSec).toFixed(1) : '0.0',
        maxConcurrentConnections: this.maxConcurrent,
        latency: {
          p50: this._percentile(allLatencies, 50).toFixed(1),
          p95: this._percentile(allLatencies, 95).toFixed(1),
          p99: this._percentile(allLatencies, 99).toFixed(1),
          min: allLatencies.length > 0 ? allLatencies[0].toFixed(1) : '0.0',
          max: allLatencies.length > 0 ? allLatencies[allLatencies.length - 1].toFixed(1) : '0.0',
        },
      },
      endpoints,
    };
  }

  /**
   * Format and print the report to stdout.
   */
  print() {
    const r = this.report();

    console.log('\n' + '='.repeat(78));
    console.log('  SIGSCORE LOAD TEST REPORT — Show HN Traffic Simulation');
    console.log('='.repeat(78));

    console.log('\n  SUMMARY');
    console.log('  ' + '-'.repeat(74));
    console.log(`  Duration:                ${r.summary.durationSec}s`);
    console.log(`  Total Requests:          ${r.summary.totalRequests}`);
    console.log(`  Total Errors (5xx/net):  ${r.summary.totalErrors}`);
    console.log(`  Error Rate:              ${r.summary.errorRate}`);
    console.log(`  Sustained RPS (median):  ${r.summary.sustainedRps}`);
    console.log(`  Peak RPS:                ${r.summary.peakRps}`);
    console.log(`  Avg RPS:                 ${r.summary.avgRps}`);
    console.log(`  Max Concurrent:          ${r.summary.maxConcurrentConnections}`);
    console.log(`  Latency P50:             ${r.summary.latency.p50}ms`);
    console.log(`  Latency P95:             ${r.summary.latency.p95}ms`);
    console.log(`  Latency P99:             ${r.summary.latency.p99}ms`);
    console.log(`  Latency Min:             ${r.summary.latency.min}ms`);
    console.log(`  Latency Max:             ${r.summary.latency.max}ms`);

    console.log('\n  PER-ENDPOINT BREAKDOWN');
    console.log('  ' + '-'.repeat(74));

    for (const ep of r.endpoints) {
      console.log(`\n  [${ep.name}]`);
      console.log(`    Requests:    ${ep.requests}`);
      console.log(`    Errors:      ${ep.errors} (${ep.errorRate})`);
      console.log(`    Latency:     P50=${ep.latency.p50}ms  P95=${ep.latency.p95}ms  P99=${ep.latency.p99}ms`);
      console.log(`                 Min=${ep.latency.min}ms  Max=${ep.latency.max}ms  Mean=${ep.latency.mean}ms`);
      const codeStr = Object.entries(ep.statusCodes)
        .map(([code, count]) => `${code}:${count}`)
        .join('  ');
      console.log(`    Status:      ${codeStr}`);
    }

    console.log('\n' + '='.repeat(78));
    console.log('  END OF REPORT');
    console.log('='.repeat(78) + '\n');

    return r;
  }
}

module.exports = { StatsCollector };
