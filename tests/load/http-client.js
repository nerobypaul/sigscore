/**
 * Minimal HTTP client built on Node.js built-in `http` / `https` modules.
 * No external dependencies.
 *
 * Returns { statusCode, headers, body, latencyMs, error? }
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

// Reuse TCP connections aggressively
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 256,
  maxFreeSockets: 64,
  timeout: 30_000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 256,
  maxFreeSockets: 64,
  timeout: 30_000,
});

/**
 * @param {string} method
 * @param {string} url
 * @param {object} [options]
 * @param {Record<string, string>} [options.headers]
 * @param {string|null} [options.body]
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<{statusCode: number, headers: object, body: string, latencyMs: number, error?: string}>}
 */
function request(method, url, options = {}) {
  const { headers = {}, body = null, timeoutMs = 15_000 } = options;

  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const reqOptions = {
      method,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: { ...headers },
      agent: isHttps ? httpsAgent : httpAgent,
      timeout: timeoutMs,
    };

    if (body) {
      const encoded = typeof body === 'string' ? body : JSON.stringify(body);
      reqOptions.headers['content-type'] = reqOptions.headers['content-type'] || 'application/json';
      reqOptions.headers['content-length'] = Buffer.byteLength(encoded);
    }

    const req = lib.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          latencyMs,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ statusCode: 0, headers: {}, body: '', latencyMs, error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({
        statusCode: 0,
        headers: {},
        body: '',
        latencyMs,
        error: err.code || err.message,
      });
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Destroy keep-alive agents to allow process to exit cleanly.
 */
function destroy() {
  httpAgent.destroy();
  httpsAgent.destroy();
}

module.exports = { request, destroy };
