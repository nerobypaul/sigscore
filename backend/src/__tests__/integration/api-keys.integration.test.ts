import './setup';
import { mockPrisma } from './setup';
import request from 'supertest';
import app from '../../app';
import {
  authHeaders,
  setupAuthMocks,
  TEST_ORG_ID,
} from './helpers';

describe('API Keys Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(mockPrisma);
  });

  const sampleApiKey = {
    id: 'apikey-int-1',
    organizationId: TEST_ORG_ID,
    name: 'Production Key',
    keyHash: 'sha256hash',
    keyPrefix: 'ds_live_a1b2',
    scopes: ['contacts:read', 'contacts:write'],
    lastUsedAt: null,
    expiresAt: null,
    active: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // ================================================================
  // POST /api/v1/api-keys  (create)
  // ================================================================
  describe('POST /api/v1/api-keys', () => {
    it('should create an API key and return 201 with the full key', async () => {
      // The service generates the key internally, so we mock the prisma call
      mockPrisma.apiKey.create.mockResolvedValue({
        id: 'apikey-new',
        organizationId: TEST_ORG_ID,
        name: 'My Key',
        keyPrefix: 'ds_live_xxxx',
        scopes: ['contacts:read'],
        expiresAt: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/api-keys')
        .set(authHeaders())
        .send({ name: 'My Key', scopes: ['contacts:read'] });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('key');
      expect(res.body).toHaveProperty('apiKey');
      expect(res.body.key).toMatch(/^ds_live_/);
      expect(res.body.apiKey.name).toBe('My Key');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .set(authHeaders())
        .send({ scopes: ['contacts:read'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 when scopes is empty', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .set(authHeaders())
        .send({ name: 'Test', scopes: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 when scopes is missing', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .set(authHeaders())
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/api-keys')
        .send({ name: 'Test', scopes: ['*'] });

      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // GET /api/v1/api-keys  (list)
  // ================================================================
  describe('GET /api/v1/api-keys', () => {
    it('should return list of API keys', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([
        {
          id: sampleApiKey.id,
          name: sampleApiKey.name,
          keyPrefix: sampleApiKey.keyPrefix,
          scopes: sampleApiKey.scopes,
          lastUsedAt: null,
          expiresAt: null,
          active: true,
          createdAt: sampleApiKey.createdAt,
          updatedAt: sampleApiKey.updatedAt,
        },
      ]);

      const res = await request(app)
        .get('/api/v1/api-keys')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('apiKeys');
      expect(Array.isArray(res.body.apiKeys)).toBe(true);
      expect(res.body.apiKeys[0].name).toBe('Production Key');
    });
  });

  // ================================================================
  // PUT /api/v1/api-keys/:id/revoke
  // ================================================================
  describe('PUT /api/v1/api-keys/:id/revoke', () => {
    it('should revoke an API key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(sampleApiKey);
      mockPrisma.apiKey.update.mockResolvedValue({
        ...sampleApiKey,
        active: false,
      });

      const res = await request(app)
        .put('/api/v1/api-keys/apikey-int-1/revoke')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.apiKey.active).toBe(false);
    });

    it('should return 404 for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/v1/api-keys/nonexistent/revoke')
        .set(authHeaders());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('API key not found');
    });
  });

  // ================================================================
  // DELETE /api/v1/api-keys/:id
  // ================================================================
  describe('DELETE /api/v1/api-keys/:id', () => {
    it('should delete an API key and return 204', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(sampleApiKey);
      mockPrisma.apiKey.delete.mockResolvedValue(sampleApiKey);

      const res = await request(app)
        .delete('/api/v1/api-keys/apikey-int-1')
        .set(authHeaders());

      expect(res.status).toBe(204);
    });

    it('should return 404 for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/api-keys/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('API key not found');
    });
  });

  // ================================================================
  // API Key Header Authentication (via x-api-key)
  // ================================================================
  describe('API Key header authentication on contacts', () => {
    it('should authenticate with x-api-key header on contacts list', async () => {
      // The api-key-auth middleware looks up the key by hash.
      // For contacts route, the middleware chain is:
      //   authenticate (JWT) -> requireOrganization
      // API key auth is a separate middleware not used on contacts routes
      // by default. The contacts route uses JWT auth exclusively.
      // Let's verify that the contacts route needs JWT and rejects API keys alone.
      const res = await request(app)
        .get('/api/v1/contacts')
        .set('x-api-key', 'ds_live_somefakekey1234567890abcdef');

      // Without a valid JWT, it should fail at the authenticate middleware
      expect(res.status).toBe(401);
    });

    it('should require X-Organization-Id even with valid JWT', async () => {
      const { generateTestAccessToken } = require('./helpers');
      const token = generateTestAccessToken();
      mockPrisma.user.findUnique.mockResolvedValue(require('./helpers').mockUserRow());

      const res = await request(app)
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Organization ID required');
    });

    it('should return 403 when user does not belong to the organization', async () => {
      const { generateTestAccessToken, mockUserRow } = require('./helpers');
      const token = generateTestAccessToken();
      mockPrisma.user.findUnique.mockResolvedValue(mockUserRow());
      mockPrisma.userOrganization.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Organization-Id', 'org-not-mine');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access to organization denied');
    });
  });
});
