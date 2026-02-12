/**
 * Shared integration test setup.
 *
 * Mocks logger, config and Prisma at the module level so that importing the
 * Express app (via ../../app) works without a real database or environment.
 *
 * Every integration test file should `import './setup'` BEFORE importing the app.
 */

// ---- Silence logger ----
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---- Config with test-safe defaults ----
jest.mock('../../config', () => ({
  config: {
    nodeEnv: 'test',
    env: 'test',
    port: 3000,
    apiUrl: 'http://localhost:3000',
    corsOrigin: 'http://localhost:5173',
    database: { url: 'test://db' },
    jwt: {
      secret: 'test-jwt-secret-for-integration',
      refreshSecret: 'test-refresh-secret-for-integration',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    oauth: {
      google: { clientId: '', clientSecret: '', callbackUrl: '' },
      github: { clientId: '', clientSecret: '', callbackUrl: '' },
    },
    frontend: { url: 'http://localhost:5173' },
    redis: { host: 'localhost', port: 6379, password: undefined },
    anthropic: { apiKey: '', model: 'claude-sonnet-4-5-20250929' },
    rateLimit: {
      // Very high limits so rate limiting never interferes with tests
      windowMs: 60 * 60 * 1000,
      max: 10000,
    },
  },
}));

// ---- Prisma mock ----
// Build a deeply-mockable prisma singleton that all services/controllers import.
export const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  contact: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  deal: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  activity: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  apiKey: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  userOrganization: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  $on: jest.fn(),
};

jest.mock('../../config/database', () => ({
  prisma: mockPrisma,
}));
