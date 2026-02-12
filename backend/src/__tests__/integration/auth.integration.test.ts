import './setup';
import { mockPrisma } from './setup';
import request from 'supertest';
import { createHash } from 'crypto';
import app from '../../app';
import {
  generateTestAccessToken,
  generateTestRefreshToken,
  generateExpiredAccessToken,
  mockUserRow,
  TEST_USER_ID,
  TEST_EMAIL,
} from './helpers';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('Auth Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // POST /api/v1/auth/register
  // ================================================================
  describe('POST /api/v1/auth/register', () => {
    const validPayload = {
      email: 'newuser@example.com',
      password: 'securepass123',
      firstName: 'New',
      lastName: 'User',
    };

    it('should register a new user and return 201 with tokens', async () => {
      const createdUser = {
        id: 'user-new',
        email: validPayload.email,
        firstName: validPayload.firstName,
        lastName: validPayload.lastName,
        role: 'USER',
        createdAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(createdUser);
      mockPrisma.user.update.mockResolvedValue(createdUser);

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe(validPayload.email);
    });

    it('should return 400 for duplicate email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUserRow({ email: validPayload.email }));

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send(validPayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validPayload, email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for password shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validPayload, password: 'short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  // ================================================================
  // POST /api/v1/auth/login
  // ================================================================
  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials and return tokens', async () => {
      // We need to use a real bcrypt hash for the password since we are NOT
      // mocking the password utility — we exercise the real middleware chain.
      // However, bcrypt.hash is slow. Instead we mock comparePassword at the
      // integration level via the user row + the actual bcrypt call.
      // The simplest approach: mock at the prisma level so the controller's
      // comparePassword call works. But comparePassword uses the real bcrypt
      // which is expensive.  For speed we'll mock the password util too.
      // Actually, for a true integration test we want real middleware running.
      // The auth controller imports comparePassword directly — we cannot mock
      // it without jest.mock. Let's keep it real and use a pre-hashed password.
      const bcrypt = require('bcrypt');
      const realHash = await bcrypt.hash('testpassword', 10);

      const user = mockUserRow({ password: realHash });
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: TEST_EMAIL, password: 'testpassword' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe(TEST_EMAIL);
    });

    it('should return 401 for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 400 for missing password field', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  // ================================================================
  // POST /api/v1/auth/refresh
  // ================================================================
  describe('POST /api/v1/auth/refresh', () => {
    it('should issue new tokens for a valid refresh token', async () => {
      const refreshToken = generateTestRefreshToken();
      const user = mockUserRow({ refreshToken: hashToken(refreshToken) });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue(user);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('should return 400 when refreshToken field is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 when refresh token does not match stored hash', async () => {
      const refreshToken = generateTestRefreshToken();
      const user = mockUserRow({ refreshToken: hashToken('different-token') });

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid refresh token');
    });
  });

  // ================================================================
  // GET /api/v1/auth/me  (protected route)
  // ================================================================
  describe('GET /api/v1/auth/me', () => {
    it('should return current user profile with valid token', async () => {
      const token = generateTestAccessToken();
      const userProfile = {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        firstName: 'Integration',
        lastName: 'Tester',
        avatar: null,
        role: 'USER',
        createdAt: new Date('2024-01-01'),
        organizations: [],
      };

      // First call from authenticate middleware, second from me controller
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockUserRow())  // authenticate
        .mockResolvedValueOnce(userProfile);    // me controller

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(TEST_EMAIL);
    });

    it('should return 401 without authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or invalid authorization header');
    });

    it('should return 401 with expired token', async () => {
      const expiredToken = generateExpiredAccessToken();
      // Small delay to ensure token is expired
      await new Promise(resolve => setTimeout(resolve, 50));

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should return 401 with malformed token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt');

      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // POST /api/v1/auth/logout  (protected route)
  // ================================================================
  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully and clear refresh token', async () => {
      const token = generateTestAccessToken();
      mockPrisma.user.findUnique.mockResolvedValue(mockUserRow());
      mockPrisma.user.update.mockResolvedValue(mockUserRow());

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: TEST_USER_ID },
        data: { refreshToken: null },
      });
    });
  });
});
