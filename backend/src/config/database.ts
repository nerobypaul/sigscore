import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Connection pool size: Railway containers default to shared vCPUs.
// 20 connections per instance provides headroom for concurrent demo seeds
// during launches (2 instances × 20 = 40 total, well under PostgreSQL's default 100).
const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
  datasources: {
    db: {
      url: appendPoolParams(process.env.DATABASE_URL || ''),
    },
  },
});

function appendPoolParams(url: string): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  // connection_limit and pool_timeout are Prisma-specific query params
  // that work regardless of whether the URL already has params
  if (url.includes('connection_limit')) return url;
  return `${url}${sep}connection_limit=20&pool_timeout=30`;
}

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning:', e);
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

export { prisma };
