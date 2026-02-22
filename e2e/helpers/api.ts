import { APIRequestContext } from '@playwright/test';

// Derive API base from E2E_BASE_URL (production SPA serves API at same origin)
// or fall back to E2E_API_URL / localhost for local dev
const API_BASE = process.env.E2E_API_URL
  || (process.env.E2E_BASE_URL ? `${process.env.E2E_BASE_URL}/api/v1` : 'http://localhost:4000/api/v1');

export interface TestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  accessToken: string;
  refreshToken: string;
  userId: string;
  organizationId: string;
}

let userCounter = 0;

/**
 * Registers a new user, creates an organization, and returns full auth context.
 * Each call produces a unique user to avoid collisions across test files.
 */
export async function createTestUser(request: APIRequestContext): Promise<TestUser> {
  const id = ++userCounter;
  const timestamp = Date.now();
  const email = `e2e-${id}-${timestamp}@test.sigscore.dev`;
  const password = 'TestPass123!';
  const firstName = `Test${id}`;
  const lastName = 'User';

  // Register
  const regRes = await request.post(`${API_BASE}/auth/register`, {
    data: { email, password, firstName, lastName },
  });
  if (!regRes.ok()) {
    throw new Error(`Registration failed: ${regRes.status()} ${await regRes.text()}`);
  }
  const regData = await regRes.json();
  const accessToken = regData.accessToken;
  const refreshToken = regData.refreshToken;
  const userId = regData.user.id;

  // Create organization
  const orgRes = await request.post(`${API_BASE}/organizations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: `E2E Org ${id}` },
  });
  if (!orgRes.ok()) {
    throw new Error(`Org creation failed: ${orgRes.status()} ${await orgRes.text()}`);
  }
  const orgData = await orgRes.json();
  const organizationId = orgData.id;

  return { email, password, firstName, lastName, accessToken, refreshToken, userId, organizationId };
}

/**
 * Makes an authenticated API call with the given user's token and org.
 */
export function authHeaders(user: TestUser) {
  return {
    Authorization: `Bearer ${user.accessToken}`,
    'X-Organization-Id': user.organizationId,
    'Content-Type': 'application/json',
  };
}
