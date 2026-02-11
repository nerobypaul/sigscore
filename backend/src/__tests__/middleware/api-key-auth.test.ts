import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

jest.mock('../../services/api-keys', () => ({
  validateApiKey: jest.fn(),
}));

import { apiKeyAuth, requireScope } from '../../middleware/api-key-auth';
import { validateApiKey } from '../../services/api-keys';

describe('API Key Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // apiKeyAuth
  // ================================================================
  describe('apiKeyAuth', () => {
    it('should authenticate via x-api-key header', async () => {
      const apiKey = testData.apiKey();
      (validateApiKey as jest.Mock).mockResolvedValue(apiKey);

      const req = mockRequest({
        headers: { 'x-api-key': 'ds_live_abc123def456' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(validateApiKey).toHaveBeenCalledWith('ds_live_abc123def456');
      expect(req.organizationId).toBe('org-1');
      expect((req as any).apiKeyAuth).toBe(true);
      expect((req as any).apiKeyScopes).toEqual(['contacts:read', 'contacts:write']);
      expect(next).toHaveBeenCalled();
    });

    it('should authenticate via Authorization: Bearer ds_live_* header', async () => {
      const apiKey = testData.apiKey();
      (validateApiKey as jest.Mock).mockResolvedValue(apiKey);

      const req = mockRequest({
        headers: { authorization: 'Bearer ds_live_abc123def456' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(validateApiKey).toHaveBeenCalledWith('ds_live_abc123def456');
      expect(req.organizationId).toBe('org-1');
      expect(next).toHaveBeenCalled();
    });

    it('should fall through to next middleware when no API key is present', async () => {
      const req = mockRequest({ headers: {} } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(validateApiKey).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
      expect(req.organizationId).toBeUndefined();
    });

    it('should fall through when Bearer token is a JWT (no ds_live_ prefix)', async () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(validateApiKey).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when API key is invalid', async () => {
      (validateApiKey as jest.Mock).mockResolvedValue(null);

      const req = mockRequest({
        headers: { 'x-api-key': 'ds_live_invalidkey' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired API key' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      (validateApiKey as jest.Mock).mockRejectedValue(new Error('DB timeout'));

      const req = mockRequest({
        headers: { 'x-api-key': 'ds_live_somekey' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should ignore x-api-key header without ds_live_ prefix', async () => {
      const req = mockRequest({
        headers: { 'x-api-key': 'some-other-key-format' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await apiKeyAuth(req, res, next);

      expect(validateApiKey).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // ================================================================
  // requireScope
  // ================================================================
  describe('requireScope', () => {
    it('should pass through for non-API-key auth (JWT users)', () => {
      const middleware = requireScope('contacts:write');

      const req = mockRequest();
      (req as any).apiKeyAuth = undefined;
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access when API key has the required scope', () => {
      const middleware = requireScope('contacts:read');

      const req = mockRequest();
      (req as any).apiKeyAuth = true;
      (req as any).apiKeyScopes = ['contacts:read', 'contacts:write'];
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access when API key has wildcard scope', () => {
      const middleware = requireScope('deals:write');

      const req = mockRequest();
      (req as any).apiKeyAuth = true;
      (req as any).apiKeyScopes = ['*'];
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when API key lacks the required scope', () => {
      const middleware = requireScope('deals:write');

      const req = mockRequest();
      (req as any).apiKeyAuth = true;
      (req as any).apiKeyScopes = ['contacts:read'];
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Insufficient scope',
        required: 'deals:write',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when API key has empty scopes array', () => {
      const middleware = requireScope('contacts:read');

      const req = mockRequest();
      (req as any).apiKeyAuth = true;
      (req as any).apiKeyScopes = [];
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
