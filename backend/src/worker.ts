/**
 * Standalone BullMQ worker entry point.
 *
 * This process runs only the background job workers and scheduler --
 * no HTTP server, no WebSocket, no static file serving. It is meant to
 * be started in a dedicated container alongside the main app service.
 *
 * Usage:
 *   node dist/worker.js
 */

import { initSentry } from './utils/sentry';

// Initialise Sentry before any other imports.
initSentry();

import http from 'http';
import { prisma } from './config/database';
import { startWorkers, stopWorkers, closeAllQueues, setupScheduler } from './jobs';
import { logger } from './utils/logger';

const HEALTH_PORT = parseInt(process.env.WORKER_HEALTH_PORT || '3001', 10);

(async () => {
  logger.info('Sigscore worker process starting...');

  // Start all BullMQ workers and the repeatable-job scheduler.
  startWorkers();
  await setupScheduler();

  logger.info('All BullMQ workers and scheduler running');

  // ---- Minimal health endpoint for orchestrators (Railway / Docker) ----
  const healthServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'worker', uptime: process.uptime() }));
  });
  healthServer.listen(HEALTH_PORT, () => {
    logger.info(`Worker health endpoint listening on :${HEALTH_PORT}/`);
  });

  // ---- Graceful shutdown ----
  const shutdown = async (signal: string) => {
    logger.info(`Worker received ${signal}. Shutting down gracefully...`);
    healthServer.close();
    await stopWorkers();
    await closeAllQueues();
    await prisma.$disconnect();
    logger.info('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception in worker', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection in worker', { reason: String(reason) });
  });
})();
