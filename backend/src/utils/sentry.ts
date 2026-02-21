import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';

let initialized = false;

/**
 * Initialize Sentry error monitoring for the backend.
 * Skips initialization if SENTRY_DSN is not set (dev mode).
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No SENTRY_DSN found, skipping initialization');
    return;
  }

  // Read version from package.json at build time
  let release = process.env.SIGSCORE_VERSION;
  if (!release) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require('../../package.json');
      release = `sigscore-backend@${pkg.version}`;
    } catch (_e) {
      release = 'sigscore-backend@unknown';
    }
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    release,
  });

  initialized = true;
  console.log(`[Sentry] Initialized (environment: ${process.env.NODE_ENV || 'development'})`);
}

/**
 * Capture an exception and send it to Sentry.
 * Falls back to console.error if Sentry is not initialized.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (initialized) {
    Sentry.captureException(error, { extra: context });
  } else {
    console.error('[Sentry] Not initialized, logging error locally:', error, context);
  }
}

/**
 * Returns the Sentry request handler middleware if initialized,
 * otherwise returns a no-op passthrough middleware.
 */
export function sentryRequestHandler(): (_req: Request, _res: Response, next: NextFunction) => void {
  if (initialized) {
    // In Sentry v10, request isolation is automatic via the Node SDK.
    // Return a no-op since Sentry.init() handles request instrumentation.
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  return (_req: Request, _res: Response, next: NextFunction) => next();
}

/**
 * Returns the Sentry error handler middleware if initialized,
 * otherwise returns a no-op error-handling middleware.
 */
export function sentryErrorHandler(): (err: Error, _req: Request, _res: Response, next: NextFunction) => void {
  if (initialized) {
    return Sentry.expressErrorHandler();
  }
  return (err: Error, _req: Request, _res: Response, next: NextFunction) => next(err);
}
