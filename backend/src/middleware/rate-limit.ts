import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';

// ---------------------------------------------------------------------------
// Redis-backed store for production (shared across instances).
// Falls back to in-memory in development/test.
// ---------------------------------------------------------------------------

function getStore(): Options['store'] | undefined {
  if (process.env.NODE_ENV === 'production') {
    return new RedisStore({
      sendCommand: (...args: string[]) =>
        redis.call(args[0], ...args.slice(1)) as Promise<never>,
      prefix: 'rl:',
    });
  }
  return undefined; // uses default in-memory store
}

/**
 * Auth limiter -- strict limit for authentication endpoints to prevent
 * brute-force and credential-stuffing attacks.
 *
 * 5 requests per 1-minute window per IP.
 * Applied to: /api/v1/auth/login, /api/v1/auth/register, /api/v1/auth/forgot-password
 */
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: {
    error: 'Too many authentication attempts. Please try again in a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
});

/**
 * General API limiter -- baseline protection for all API routes.
 *
 * 100 requests per 1-minute window per IP.
 * Applied to: /api/v1/*
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: 'Too many requests from this IP. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
});

/**
 * Webhook limiter -- higher throughput for inbound connector webhooks
 * (GitHub, Segment, Slack, etc.) which can legitimately burst.
 *
 * 200 requests per 1-minute window per IP.
 * Applied to: /api/v1/webhooks/*
 */
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,
  message: {
    error: 'Webhook rate limit exceeded. Please retry shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
});

/**
 * Demo limiter -- moderate limit for the demo seed endpoint to
 * prevent abuse while allowing reasonable traffic during launches.
 *
 * 25 requests per 1-minute window per IP.
 * Applied to: /api/v1/demo/*
 */
export const demoLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 25,
  message: {
    error: 'Demo seed rate limit exceeded. Please wait a minute before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
});

/**
 * GraphQL limiter -- stricter than general API to prevent batch
 * query abuse (a single HTTP request can contain multiple queries).
 *
 * 30 requests per 1-minute window per IP.
 * Applied to: /api/v1/graphql
 */
export const graphqlLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: {
    error: 'GraphQL rate limit exceeded. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
});

/**
 * Signal ingest limiter -- high throughput for the signal ingestion
 * pipeline which must handle bursts from SDK clients.
 *
 * 500 requests per 1-minute window per IP.
 * Applied to: /api/v1/signals
 */
export const signalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500,
  message: {
    error: 'Signal ingest rate limit exceeded.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getStore(),
});
