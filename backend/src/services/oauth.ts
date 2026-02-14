import { randomBytes, createHash } from 'crypto';
import { config } from '../config';
import { redis } from '../config/redis';
import { prisma } from '../config/database';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { logger } from '../utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OAuthProfile {
  firstName: string;
  lastName: string;
  avatar: string | null;
}

interface OAuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar: string | null;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

// ─── State Management ────────────────────────────────────────────────────────

const STATE_PREFIX = 'oauth:state:';
const STATE_TTL_SECONDS = 600; // 10 minutes

export function generateOAuthState(): string {
  return randomBytes(32).toString('hex');
}

export async function storeOAuthState(state: string): Promise<void> {
  await redis.set(`${STATE_PREFIX}${state}`, '1', 'EX', STATE_TTL_SECONDS);
}

export async function validateOAuthState(state: string): Promise<boolean> {
  const value = await redis.get(`${STATE_PREFIX}${state}`);
  if (!value) return false;
  // Delete after validation (single-use)
  await redis.del(`${STATE_PREFIX}${state}`);
  return true;
}

// ─── Token Generation ────────────────────────────────────────────────────────

/** SHA-256 hash for refresh token storage (same pattern as auth controller). */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function generateOAuthTokens(userId: string, email: string, role: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = generateAccessToken(userId, email, role);
  const refreshToken = generateRefreshToken(userId);

  // Store hashed refresh token in DB (same as auth controller pattern)
  await prisma.user.update({
    where: { id: userId },
    data: {
      refreshToken: hashToken(refreshToken),
      lastLoginAt: new Date(),
    },
  });

  return { accessToken, refreshToken };
}

// ─── User Management ─────────────────────────────────────────────────────────

async function findOrCreateOAuthUser(
  email: string,
  profile: OAuthProfile,
  providerField?: { githubId?: string; googleId?: string }
): Promise<OAuthResult['user']> {
  let user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Update avatar if changed, and set provider ID if not yet linked
    const updateData: Record<string, unknown> = {};
    if (profile.avatar && profile.avatar !== user.avatar) {
      updateData.avatar = profile.avatar;
    }
    if (providerField?.githubId && !user.githubId) {
      updateData.githubId = providerField.githubId;
    }
    if (providerField?.googleId && !user.googleId) {
      updateData.googleId = providerField.googleId;
    }

    if (Object.keys(updateData).length > 0) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }
  } else {
    // Create new user (no password — OAuth-only account)
    user = await prisma.user.create({
      data: {
        email,
        firstName: profile.firstName || 'User',
        lastName: profile.lastName || '',
        avatar: profile.avatar,
        ...providerField,
      },
    });

    logger.info(`OAuth user created: ${email}`);
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    role: user.role,
  };
}

// ─── GitHub OAuth ────────────────────────────────────────────────────────────

export function getGitHubAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.oauth.github.clientId,
    redirect_uri: config.oauth.github.callbackUrl,
    scope: 'user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function handleGitHubCallback(code: string): Promise<OAuthResult> {
  // 1. Exchange code for access token
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: config.oauth.github.clientId,
      client_secret: config.oauth.github.clientSecret,
      code,
      redirect_uri: config.oauth.github.callbackUrl,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

  if (!tokenData.access_token) {
    throw new Error('GitHub token exchange did not return an access token');
  }

  // 2. Fetch user profile
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json',
    },
  });

  if (!userResponse.ok) {
    throw new Error(`GitHub user fetch failed: ${userResponse.status}`);
  }

  const githubUser = (await userResponse.json()) as GitHubUser;

  // 3. Fetch user emails (to get primary verified email)
  const emailsResponse = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/json',
    },
  });

  if (!emailsResponse.ok) {
    throw new Error(`GitHub emails fetch failed: ${emailsResponse.status}`);
  }

  const githubEmails = (await emailsResponse.json()) as GitHubEmail[];
  const primaryEmail = githubEmails.find((e) => e.primary && e.verified);

  if (!primaryEmail) {
    throw new Error('No verified primary email found on GitHub account');
  }

  // 4. Parse name into firstName / lastName
  const nameParts = (githubUser.name || githubUser.login || '').split(' ');
  const firstName = nameParts[0] || githubUser.login;
  const lastName = nameParts.slice(1).join(' ') || '';

  // 5. Find or create user
  const user = await findOrCreateOAuthUser(
    primaryEmail.email,
    { firstName, lastName, avatar: githubUser.avatar_url },
    { githubId: String(githubUser.id) }
  );

  // 6. Generate tokens
  const tokens = await generateOAuthTokens(user.id, user.email, user.role);

  logger.info(`GitHub OAuth login: ${user.email}`);

  return { user, ...tokens };
}

// ─── Google OAuth ────────────────────────────────────────────────────────────

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: config.oauth.google.callbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleGoogleCallback(code: string): Promise<OAuthResult> {
  // 1. Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      redirect_uri: config.oauth.google.callbackUrl,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenData.id_token) {
    throw new Error('Google token exchange did not return an id_token');
  }

  // 2. Decode id_token (base64 payload — no signature verification needed,
  //    the token came from Google over TLS)
  const idTokenParts = tokenData.id_token.split('.');
  if (idTokenParts.length < 2) {
    throw new Error('Invalid Google id_token format');
  }

  const payloadBase64 = idTokenParts[1];
  const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  const claims = JSON.parse(payloadJson) as GoogleIdTokenPayload;

  if (!claims.email) {
    throw new Error('No email claim in Google id_token');
  }

  // 3. Parse profile
  const firstName = claims.given_name || claims.name?.split(' ')[0] || 'User';
  const lastName = claims.family_name || claims.name?.split(' ').slice(1).join(' ') || '';
  const avatar = claims.picture || null;

  // 4. Find or create user
  const user = await findOrCreateOAuthUser(
    claims.email,
    { firstName, lastName, avatar },
    { googleId: claims.sub }
  );

  // 5. Generate tokens
  const tokens = await generateOAuthTokens(user.id, user.email, user.role);

  logger.info(`Google OAuth login: ${user.email}`);

  return { user, ...tokens };
}
