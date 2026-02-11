// Silence logger output during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config with test-safe defaults
jest.mock('../config', () => ({
  config: {
    nodeEnv: 'test',
    env: 'test',
    port: 3000,
    apiUrl: 'http://localhost:3000',
    corsOrigin: 'http://localhost:5173',
    database: { url: 'test://db' },
    jwt: {
      secret: 'test-jwt-secret',
      refreshSecret: 'test-refresh-secret',
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
    rateLimit: { windowMs: 900000, max: 100 },
  },
}));
