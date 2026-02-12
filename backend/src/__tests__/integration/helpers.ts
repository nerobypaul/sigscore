/**
 * Integration test helpers.
 *
 * Provides real JWT token generation (using the same secret as the mocked config),
 * supertest-wrapped app, and reusable auth header builders.
 */
import jwt from 'jsonwebtoken';

// Must match the secrets in setup.ts mock config
const JWT_SECRET = 'test-jwt-secret-for-integration';
const JWT_REFRESH_SECRET = 'test-refresh-secret-for-integration';

export const TEST_USER_ID = 'user-integration-1';
export const TEST_ORG_ID = 'org-integration-1';
export const TEST_EMAIL = 'integration@test.com';
export const TEST_ROLE = 'USER';

/**
 * Generate a valid access token that the real verifyAccessToken util will accept.
 */
export function generateTestAccessToken(
  userId: string = TEST_USER_ID,
  email: string = TEST_EMAIL,
  role: string = TEST_ROLE
): string {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '15m' });
}

/**
 * Generate a valid refresh token.
 */
export function generateTestRefreshToken(userId: string = TEST_USER_ID): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

/**
 * Generate an expired access token for negative testing.
 */
export function generateExpiredAccessToken(
  userId: string = TEST_USER_ID,
  email: string = TEST_EMAIL,
  role: string = TEST_ROLE
): string {
  return jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '0s' });
}

/**
 * Return headers object for an authenticated + organization-scoped request.
 */
export function authHeaders(
  token?: string,
  orgId: string = TEST_ORG_ID
): Record<string, string> {
  const t = token ?? generateTestAccessToken();
  return {
    Authorization: `Bearer ${t}`,
    'X-Organization-Id': orgId,
    'Content-Type': 'application/json',
  };
}

/**
 * Minimal user row that the auth middleware expects from prisma.user.findUnique.
 */
export function mockUserRow(overrides: Record<string, any> = {}) {
  return {
    id: TEST_USER_ID,
    email: TEST_EMAIL,
    password: '$2b$10$hashedpassword',
    firstName: 'Integration',
    lastName: 'Tester',
    avatar: null,
    role: TEST_ROLE,
    refreshToken: null,
    lastLoginAt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Minimal userOrganization row for requireOrganization middleware.
 */
export function mockUserOrgRow(overrides: Record<string, any> = {}) {
  return {
    userId: TEST_USER_ID,
    organizationId: TEST_ORG_ID,
    role: 'ADMIN',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

/**
 * Sets up the standard auth + org mocks on the prisma mock so that
 * authenticate + requireOrganization middleware pass for the default test user.
 */
export function setupAuthMocks(mockPrisma: any): void {
  mockPrisma.user.findUnique.mockResolvedValue(mockUserRow());
  mockPrisma.userOrganization.findUnique.mockResolvedValue(mockUserOrgRow());
}
