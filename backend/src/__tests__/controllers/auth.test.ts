import '../setup';
import { createHash } from 'crypto';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

/** Mirror the hashToken function from auth controller for test assertions */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---- Prisma mock ----
const mockPrismaUser = {
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

jest.mock('../../config/database', () => ({
  prisma: {
    user: mockPrismaUser,
  },
}));

// ---- Utility mocks ----
jest.mock('../../utils/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2b$10$hashed'),
  comparePassword: jest.fn(),
}));

jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access-token-123'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh-token-456'),
  verifyRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
}));

import { register, login, refresh, logout, me } from '../../controllers/auth';
import { comparePassword } from '../../utils/password';
import { verifyRefreshToken } from '../../utils/jwt';

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // REGISTER
  // ================================================================
  describe('register', () => {
    const validBody = {
      email: 'new@example.com',
      password: 'securepass123',
      firstName: 'New',
      lastName: 'User',
    };

    it('should register a new user and return 201 with tokens', async () => {
      const createdUser = {
        id: 'user-new',
        email: validBody.email,
        firstName: validBody.firstName,
        lastName: validBody.lastName,
        role: 'USER',
        createdAt: new Date(),
      };

      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue(createdUser);
      mockPrismaUser.update.mockResolvedValue(createdUser);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await register(req, res, next);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { email: validBody.email },
      });
      expect(mockPrismaUser.create).toHaveBeenCalledWith({
        data: {
          email: validBody.email,
          password: '$2b$10$hashed',
          firstName: validBody.firstName,
          lastName: validBody.lastName,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true,
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        user: createdUser,
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 409 if user already exists', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(testData.user({ email: validBody.email }));

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await register(req, res, next);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: 'An account with this email already exists. Try signing in instead.' });
      expect(mockPrismaUser.create).not.toHaveBeenCalled();
    });

    it('should store the refresh token after registration', async () => {
      const createdUser = {
        id: 'user-new',
        email: validBody.email,
        firstName: 'New',
        lastName: 'User',
        role: 'USER',
        createdAt: new Date(),
      };

      mockPrismaUser.findUnique.mockResolvedValue(null);
      mockPrismaUser.create.mockResolvedValue(createdUser);
      mockPrismaUser.update.mockResolvedValue(createdUser);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await register(req, res, next);

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: createdUser.id },
        data: { refreshToken: hashToken('refresh-token-456') },
      });
    });

    it('should call next(error) on database failure', async () => {
      const dbError = new Error('Connection refused');
      mockPrismaUser.findUnique.mockRejectedValue(dbError);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await register(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // ================================================================
  // LOGIN
  // ================================================================
  describe('login', () => {
    const validBody = { email: 'test@example.com', password: 'password123' };

    it('should login with valid credentials and return tokens', async () => {
      const user = testData.user();
      mockPrismaUser.findUnique.mockResolvedValue(user);
      (comparePassword as jest.Mock).mockResolvedValue(true);
      mockPrismaUser.update.mockResolvedValue(user);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await login(req, res, next);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { email: validBody.email },
      });
      expect(comparePassword).toHaveBeenCalledWith(validBody.password, user.password);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
    });

    it('should return 401 when user is not found', async () => {
      mockPrismaUser.findUnique.mockResolvedValue(null);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should return 401 when user has no password (OAuth-only user)', async () => {
      const oauthUser = testData.user({ password: null });
      mockPrismaUser.findUnique.mockResolvedValue(oauthUser);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
      expect(comparePassword).not.toHaveBeenCalled();
    });

    it('should return 401 when password is incorrect', async () => {
      const user = testData.user();
      mockPrismaUser.findUnique.mockResolvedValue(user);
      (comparePassword as jest.Mock).mockResolvedValue(false);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid credentials' });
    });

    it('should update refreshToken and lastLoginAt on successful login', async () => {
      const user = testData.user();
      mockPrismaUser.findUnique.mockResolvedValue(user);
      (comparePassword as jest.Mock).mockResolvedValue(true);
      mockPrismaUser.update.mockResolvedValue(user);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await login(req, res, next);

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: expect.objectContaining({
          refreshToken: hashToken('refresh-token-456'),
          lastLoginAt: expect.any(Date),
        }),
      });
    });

    it('should call next(error) on database failure', async () => {
      const dbError = new Error('DB down');
      mockPrismaUser.findUnique.mockRejectedValue(dbError);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // ================================================================
  // REFRESH
  // ================================================================
  describe('refresh', () => {
    it('should issue new tokens for a valid refresh token', async () => {
      const user = testData.user({ refreshToken: hashToken('old-refresh-token') });

      (verifyRefreshToken as jest.Mock).mockReturnValue({ userId: user.id });
      mockPrismaUser.findUnique.mockResolvedValue(user);
      mockPrismaUser.update.mockResolvedValue(user);

      const req = mockRequest({ body: { refreshToken: 'old-refresh-token' } });
      const res = mockResponse();
      const next = mockNext();

      await refresh(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      });
    });

    it('should return 401 when no refresh token is provided', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();
      const next = mockNext();

      await refresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Refresh token required' });
    });

    it('should return 401 when refresh token verification fails', async () => {
      (verifyRefreshToken as jest.Mock).mockReturnValue(null);

      const req = mockRequest({ body: { refreshToken: 'invalid-token' } });
      const res = mockResponse();
      const next = mockNext();

      await refresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });

    it('should return 401 when user is not found', async () => {
      (verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 'nonexistent' });
      mockPrismaUser.findUnique.mockResolvedValue(null);

      const req = mockRequest({ body: { refreshToken: 'some-token' } });
      const res = mockResponse();
      const next = mockNext();

      await refresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });

    it('should return 401 when stored refresh token does not match', async () => {
      const user = testData.user({ refreshToken: hashToken('stored-token') });
      (verifyRefreshToken as jest.Mock).mockReturnValue({ userId: user.id });
      mockPrismaUser.findUnique.mockResolvedValue(user);

      const req = mockRequest({ body: { refreshToken: 'different-token' } });
      const res = mockResponse();
      const next = mockNext();

      await refresh(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid refresh token' });
    });

    it('should rotate the refresh token on success', async () => {
      const user = testData.user({ refreshToken: hashToken('old-refresh-token') });
      (verifyRefreshToken as jest.Mock).mockReturnValue({ userId: user.id });
      mockPrismaUser.findUnique.mockResolvedValue(user);
      mockPrismaUser.update.mockResolvedValue(user);

      const req = mockRequest({ body: { refreshToken: 'old-refresh-token' } });
      const res = mockResponse();
      const next = mockNext();

      await refresh(req, res, next);

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { refreshToken: hashToken('refresh-token-456') },
      });
    });
  });

  // ================================================================
  // LOGOUT
  // ================================================================
  describe('logout', () => {
    it('should clear refresh token and return success message', async () => {
      const user = testData.user();
      mockPrismaUser.update.mockResolvedValue(user);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      await logout(req, res, next);

      expect(mockPrismaUser.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
    });

    it('should return success even if no user is attached (edge case)', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      await logout(req, res, next);

      expect(mockPrismaUser.update).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ message: 'Logged out successfully' });
    });

    it('should call next(error) on database failure', async () => {
      const user = testData.user();
      const dbError = new Error('DB failure');
      mockPrismaUser.update.mockRejectedValue(dbError);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      await logout(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  // ================================================================
  // ME
  // ================================================================
  describe('me', () => {
    it('should return the current user profile', async () => {
      const user = testData.user();
      const userWithOrgs = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: null,
        role: user.role,
        createdAt: user.createdAt,
        organizations: [],
      };

      mockPrismaUser.findUnique.mockResolvedValue(userWithOrgs);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      await me(req, res, next);

      expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
          role: true,
          createdAt: true,
          organizations: {
            include: { organization: true },
          },
        },
      });
      expect(res.json).toHaveBeenCalledWith(userWithOrgs);
    });

    it('should return 404 if user not found in database', async () => {
      const user = testData.user({ id: 'deleted-user' });
      mockPrismaUser.findUnique.mockResolvedValue(null);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      await me(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should call next(error) on database failure', async () => {
      const user = testData.user();
      const dbError = new Error('Query failed');
      mockPrismaUser.findUnique.mockRejectedValue(dbError);

      const req = mockRequest({ user } as any);
      const res = mockResponse();
      const next = mockNext();

      await me(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
