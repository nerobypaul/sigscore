import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn', (e) => {
  logger.warn('Prisma warning:', e);
});

prisma.$on('error', (e) => {
  logger.error('Prisma error:', e);
});

export { prisma };
