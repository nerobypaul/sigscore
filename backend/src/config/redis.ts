import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

/**
 * Shared Redis connection for general use (pub/sub, caching, etc.)
 */
export const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redis.on('connect', () => {
  logger.info('Redis connected', { host: config.redis.host, port: config.redis.port });
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

/**
 * BullMQ connection config — passed to Queue and Worker constructors.
 * BullMQ manages its own connections internally, so we provide the raw
 * connection options rather than an existing ioredis instance.
 */
export const bullConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
};
