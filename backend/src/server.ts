/**
 * Production server entry point.
 *
 * This module boots the Express application, mounts the GraphQL endpoint,
 * initialises WebSocket support, and -- in production -- serves the pre-built
 * frontend SPA as static files from the `public/` directory adjacent to the
 * compiled backend output.
 *
 * BullMQ workers are started only when ENABLE_WORKERS=true (they run as a
 * separate container in the Docker Compose stack).
 */

import { initSentry } from './utils/sentry';

// Initialise Sentry before any other imports so it can instrument them.
initSentry();

import path from 'path';
import express from 'express';
import app from './app';
import { config } from './config';
import { prisma } from './config/database';
import { setupGraphQL } from './graphql';
import { initWebSocket, shutdownWebSocket } from './services/websocket';
import { startWorkers, stopWorkers, closeAllQueues, setupScheduler } from './jobs';
import { logger } from './utils/logger';

const PORT = config.port;
const ENABLE_WORKERS = process.env.ENABLE_WORKERS === 'true';

(async () => {
  // ---- GraphQL ----
  await setupGraphQL(app);

  // ---- Serve the static frontend in production ----
  // In the Docker image the Vite build output is copied to /app/public.
  // The path resolves relative to the compiled JS in /app/dist/.
  if (config.nodeEnv === 'production') {
    const publicDir = path.resolve(__dirname, '..', 'public');
    logger.info('Serving static frontend', { path: publicDir });

    // Serve static assets with aggressive caching
    app.use(
      express.static(publicDir, {
        maxAge: '1y',
        immutable: true,
        index: false, // We handle index.html via the SPA fallback below
      }),
    );

    // SPA fallback: any request that did not match an API route or a static
    // file gets the index.html so client-side routing works correctly.
    app.get('*', (_req, res, next) => {
      // Skip routes that should be handled by existing Express middleware
      const skip = ['/api', '/health', '/graphql', '/api-docs', '/sitemap.xml', '/robots.txt'];
      if (skip.some((prefix) => _req.path.startsWith(prefix))) {
        return next();
      }
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  // ---- Start HTTP server ----
  const server = app.listen(PORT, () => {
    logger.info(`DevSignal running on port ${PORT}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    if (config.nodeEnv !== 'production') {
      logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
    }
  });

  // ---- WebSocket ----
  initWebSocket(server);

  // ---- BullMQ Workers ----
  if (ENABLE_WORKERS) {
    startWorkers();
    await setupScheduler();
    logger.info('BullMQ workers and scheduler started');
  } else {
    logger.info('BullMQ workers disabled (set ENABLE_WORKERS=true to enable)');
  }

  // ---- Graceful shutdown ----
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    shutdownWebSocket();
    if (ENABLE_WORKERS) {
      await stopWorkers();
      await closeAllQueues();
    }
    server.close(async () => {
      await prisma.$disconnect();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });

    // Force exit after 30 seconds if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Forced shutdown after 30s timeout');
      process.exit(1);
    }, 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
  });
})();
