import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

// Mock the database module
const mockPrismaUser = {
  findUnique: jest.fn(),
};
const mockPrismaUserOrganization = {
  findUnique: jest.fn(),
};

jest.mock('../../config/database', () => ({
  prisma: {
    user: mockPrismaUser,
    userOrganization: mockPrismaUserOrganization,
  },
}));

jest.mock('../../utils/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

import { authenticate, requireRole, requireOrganization } from '../../middleware/auth';
import { verifyAccessToken } from '../../utils/jwt';

describe('Auth Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // authenticate
  // ================================================================
  describe('authenticate', () => {
    it('should authenticate a valid Bearer token and attach user to request', async () => {
      const user = testData.user();
      const payload = { userId: user.id, email: user.email, role: user.role };

      (verifyAccessToken as jest.Mock).mockReturnValue(payload);
      mockPrismaUser.findUnique.mockResolvedValue(user);

      const req = mockRequest({
        headers: { authorization: 'Bearer valid-token' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: user.id },
      });
      expect(req.user).toEqual(user);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 when no authorization header is present', async () => {
      const req = mockRequest({ headers: {} } as any);
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header lacks Bearer prefix', async () => {
      const req = mockRequest({
        headers: { authorization: 'Token abc123' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      });
    });

    it('should return 401 when token verification fails', async () => {
      (verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      const req = mockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
    });

    it('should return 401 when user is not found in database', async () => {
      const payload = { userId: 'deleted-user', email: 'gone@example.com', role: 'USER' };
      (verifyAccessToken as jest.Mock).mockReturnValue(payload);
      mockPrismaUser.findUnique.mockResolvedValue(null);

      const req = mockRequest({
        headers: { authorization: 'Bearer valid-token-but-no-user' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });
  });

  // ================================================================
  // requireRole
  // ================================================================
  describe('requireRole', () => {
    it('should call next() when user has the required role', () => {
      const user = testData.user({ role: 'ADMIN' });
      const middleware = requireRole(['ADMIN', 'SUPER_ADMIN']);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 403 when user lacks the required role', () => {
      const user = testData.user({ role: 'USER' });
      const middleware = requireRole(['ADMIN']);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when no user is attached to request', () => {
      const middleware = requireRole(['ADMIN']);

      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should accept any of multiple allowed roles', () => {
      const user = testData.user({ role: 'MANAGER' });
      const middleware = requireRole(['ADMIN', 'MANAGER', 'USER']);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ================================================================
  // requireOrganization
  // ================================================================
  describe('requireOrganization', () => {
    it('should set organizationId on request when user belongs to the organization', async () => {
      const user = testData.user();
      const userOrg = {
        userId: user.id,
        organizationId: 'org-1',
        role: 'MEMBER',
      };

      mockPrismaUserOrganization.findUnique.mockResolvedValue(userOrg);

      const req = mockRequest({
        user,
        headers: { 'x-organization-id': 'org-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await requireOrganization(req, res, next);

      expect(mockPrismaUserOrganization.findUnique).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: 'org-1',
          },
        },
      });
      expect(req.organizationId).toBe('org-1');
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 when no user is attached', async () => {
      const req = mockRequest({
        headers: { 'x-organization-id': 'org-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await requireOrganization(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 400 when no x-organization-id header is provided', async () => {
      const user = testData.user();

      const req = mockRequest({
        user,
        headers: {},
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await requireOrganization(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Organization ID required' });
    });

    it('should return 403 when user does not belong to the organization', async () => {
      const user = testData.user();
      mockPrismaUserOrganization.findUnique.mockResolvedValue(null);

      const req = mockRequest({
        user,
        headers: { 'x-organization-id': 'org-unauthorized' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await requireOrganization(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access to organization denied' });
    });

    it('should return 500 on database failure', async () => {
      const user = testData.user();
      mockPrismaUserOrganization.findUnique.mockRejectedValue(new Error('DB down'));

      const req = mockRequest({
        user,
        headers: { 'x-organization-id': 'org-1' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await requireOrganization(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });
  });
});
