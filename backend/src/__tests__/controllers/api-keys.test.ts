import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

jest.mock('../../services/api-keys');

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
} from '../../controllers/api-keys';

import * as apiKeyService from '../../services/api-keys';

// Cast as any to avoid strict Prisma type requirements on mock data
const mockedService = apiKeyService as any;

describe('API Keys Controller', () => {
  const orgId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // POST /api-keys (create)
  // ================================================================
  describe('createApiKey', () => {
    it('should create an API key and return 201 with key and metadata', async () => {
      const apiKeyData = testData.apiKey();
      const generateResult = {
        key: 'ds_live_abc123def456',
        apiKey: apiKeyData,
      };

      mockedService.generateApiKey.mockResolvedValue(generateResult as any);

      const req = mockRequest({
        organizationId: orgId,
        body: {
          name: 'Production Key',
          scopes: ['contacts:read', 'contacts:write'],
        },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createApiKey(req, res, next);

      expect(mockedService.generateApiKey).toHaveBeenCalledWith(
        orgId,
        'Production Key',
        ['contacts:read', 'contacts:write'],
        undefined
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        key: 'ds_live_abc123def456',
        apiKey: apiKeyData,
      });
    });

    it('should pass expiresAt as a Date when provided', async () => {
      const apiKeyData = testData.apiKey({ expiresAt: new Date('2025-12-31') });
      const generateResult = {
        key: 'ds_live_abc123def456',
        apiKey: apiKeyData,
      };

      mockedService.generateApiKey.mockResolvedValue(generateResult as any);

      const req = mockRequest({
        organizationId: orgId,
        body: {
          name: 'Expiring Key',
          scopes: ['*'],
          expiresAt: '2025-12-31T00:00:00.000Z',
        },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createApiKey(req, res, next);

      expect(mockedService.generateApiKey).toHaveBeenCalledWith(
        orgId,
        'Expiring Key',
        ['*'],
        expect.any(Date)
      );

      // Verify the Date is constructed from the string
      const callArgs = mockedService.generateApiKey.mock.calls[0];
      expect(callArgs[3]!.toISOString()).toBe('2025-12-31T00:00:00.000Z');
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.generateApiKey.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        body: { name: 'Key', scopes: ['*'] },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // GET /api-keys (list)
  // ================================================================
  describe('listApiKeys', () => {
    it('should return all API keys for the organization', async () => {
      const keys = [
        testData.apiKey(),
        testData.apiKey({ id: 'apikey-2', name: 'Staging Key' }),
      ];

      mockedService.listApiKeys.mockResolvedValue(keys as any);

      const req = mockRequest({ organizationId: orgId } as any);
      const res = mockResponse();
      const next = mockNext();

      await listApiKeys(req, res, next);

      expect(mockedService.listApiKeys).toHaveBeenCalledWith(orgId);
      expect(res.json).toHaveBeenCalledWith({ apiKeys: keys });
    });

    it('should return empty array when no keys exist', async () => {
      mockedService.listApiKeys.mockResolvedValue([]);

      const req = mockRequest({ organizationId: orgId } as any);
      const res = mockResponse();
      const next = mockNext();

      await listApiKeys(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ apiKeys: [] });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.listApiKeys.mockRejectedValue(err);

      const req = mockRequest({ organizationId: orgId } as any);
      const res = mockResponse();
      const next = mockNext();

      await listApiKeys(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // PUT /api-keys/:id/revoke
  // ================================================================
  describe('revokeApiKey', () => {
    it('should revoke an API key and return the updated key', async () => {
      const revokedKey = testData.apiKey({ active: false });
      mockedService.revokeApiKey.mockResolvedValue(revokedKey as any);

      const req = mockRequest({
        organizationId: orgId,
        params: { id: 'apikey-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await revokeApiKey(req, res, next);

      expect(mockedService.revokeApiKey).toHaveBeenCalledWith(orgId, 'apikey-1');
      expect(res.json).toHaveBeenCalledWith({ apiKey: revokedKey });
    });

    it('should return 404 when API key is not found', async () => {
      mockedService.revokeApiKey.mockResolvedValue(null);

      const req = mockRequest({
        organizationId: orgId,
        params: { id: 'nonexistent' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await revokeApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key not found' });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.revokeApiKey.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        params: { id: 'apikey-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await revokeApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // DELETE /api-keys/:id
  // ================================================================
  describe('deleteApiKey', () => {
    it('should delete an API key and return 204', async () => {
      mockedService.deleteApiKey.mockResolvedValue(true);

      const req = mockRequest({
        organizationId: orgId,
        params: { id: 'apikey-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteApiKey(req, res, next);

      expect(mockedService.deleteApiKey).toHaveBeenCalledWith(orgId, 'apikey-1');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 404 when API key is not found', async () => {
      mockedService.deleteApiKey.mockResolvedValue(null);

      const req = mockRequest({
        organizationId: orgId,
        params: { id: 'nonexistent' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteApiKey(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'API key not found' });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.deleteApiKey.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        params: { id: 'apikey-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteApiKey(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
