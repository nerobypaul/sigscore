/**
 * Initialize Sentry error monitoring for the frontend.
 * Dynamically imports @sentry/react only when VITE_SENTRY_DSN is set,
 * keeping the critical path ~35KB lighter for builds without Sentry.
 */
export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  // Only load Sentry if the user has consented to all cookies
  const consent = localStorage.getItem('sigscore-cookie-consent');
  if (consent !== 'all') return;

  const Sentry = await import('@sentry/react');

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    release: `sigscore-frontend@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
  });
}
