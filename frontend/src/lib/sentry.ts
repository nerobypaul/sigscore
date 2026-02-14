import * as Sentry from '@sentry/react';
import React from 'react';

/**
 * Initialize Sentry error monitoring for the frontend.
 * Skips initialization if VITE_SENTRY_DSN is not set (dev mode).
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) {
    console.log('[Sentry] No VITE_SENTRY_DSN found, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    release: `devsignal-frontend@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
  });

  console.log(`[Sentry] Initialized (environment: ${import.meta.env.MODE})`);
}

/**
 * Capture an exception and send it to Sentry.
 * Falls back to console.error if Sentry is not initialized.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, { extra: context });
}

/**
 * Error boundary component that reports errors to Sentry.
 * Wraps Sentry.ErrorBoundary with a user-friendly fallback UI.
 */
export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  return React.createElement(
    Sentry.ErrorBoundary,
    {
      fallback: ({ error, resetError }: { error: unknown; resetError: () => void }) =>
        React.createElement(
          'div',
          {
            style: {
              padding: '2rem',
              textAlign: 'center' as const,
              fontFamily: 'system-ui, sans-serif',
            },
          },
          React.createElement('h2', null, 'Something went wrong'),
          React.createElement(
            'p',
            { style: { color: '#666', marginTop: '0.5rem' } },
            error instanceof Error ? error.message : 'An unexpected error occurred'
          ),
          React.createElement(
            'button',
            {
              onClick: resetError,
              style: {
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              },
            },
            'Try again'
          )
        ),
    },
    children
  );
}
