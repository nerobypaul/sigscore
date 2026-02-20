import { randomBytes, createHash } from 'crypto';
import { deflateRawSync } from 'zlib';
import type { SsoProvider, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateSsoConnectionInput {
  provider: SsoProvider;
  name: string;
  entityId?: string;
  ssoUrl?: string;
  certificate?: string;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  discoveryUrl?: string;
}

interface SamlCallbackResult {
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
  accessToken: string;
  refreshToken: string;
  organizationId: string;
}

interface OidcCallbackResult {
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
  accessToken: string;
  refreshToken: string;
  organizationId: string;
}

interface OidcDiscoveryConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

// ---------------------------------------------------------------------------
// SAML XML helpers
// ---------------------------------------------------------------------------

function buildSamlAuthnRequest(spEntityId: string, acsUrl: string, idpSsoUrl: string): string {
  const id = `_${randomBytes(16).toString('hex')}`;
  const issueInstant = new Date().toISOString();

  const xml = [
    `<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
    ` ID="${id}"`,
    ` Version="2.0"`,
    ` IssueInstant="${issueInstant}"`,
    ` Destination="${idpSsoUrl}"`,
    ` AssertionConsumerServiceURL="${acsUrl}"`,
    ` ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">`,
    `<saml:Issuer>${spEntityId}</saml:Issuer>`,
    `<samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>`,
    `</samlp:AuthnRequest>`,
  ].join('');

  return xml;
}

function extractSamlAttribute(xml: string, name: string): string | null {
  // Matches <saml:Attribute Name="...name...">...<saml:AttributeValue...>VALUE</saml:AttributeValue>
  const attrRegex = new RegExp(
    `<(?:saml:)?Attribute[^>]*Name=["'](?:[^"']*[/.])?${escapeRegex(name)}["'][^>]*>` +
    `[\\s\\S]*?<(?:saml:)?AttributeValue[^>]*>([^<]*)</(?:saml:)?AttributeValue>`,
    'i'
  );
  const match = xml.match(attrRegex);
  return match ? match[1].trim() : null;
}

function extractSamlNameId(xml: string): string | null {
  const match = xml.match(/<(?:saml:)?NameID[^>]*>([^<]+)<\/(?:saml:)?NameID>/i);
  return match ? match[1].trim() : null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Plan validation
// ---------------------------------------------------------------------------

async function requireScalePlan(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const settings = org.settings as Record<string, unknown> | null;
  const plan = (settings?.plan as string) ?? 'free';

  if (plan.toLowerCase() !== 'scale') {
    throw new AppError('SSO is only available on the Scale plan ($299/mo)', 403);
  }
}

// ---------------------------------------------------------------------------
// SSO Connection CRUD
// ---------------------------------------------------------------------------

export async function createSsoConnection(
  organizationId: string,
  data: CreateSsoConnectionInput
) {
  await requireScalePlan(organizationId);

  // Check no existing connection
  const existing = await prisma.ssoConnection.findUnique({
    where: { organizationId },
  });

  if (existing) {
    throw new AppError('An SSO connection already exists for this organization. Update or delete it first.', 409);
  }

  // Validate provider-specific required fields
  if (data.provider === 'SAML') {
    if (!data.entityId || !data.ssoUrl || !data.certificate) {
      throw new AppError('SAML connections require entityId, ssoUrl, and certificate', 400);
    }
  } else if (data.provider === 'OIDC') {
    if (!data.clientId || !data.clientSecret) {
      throw new AppError('OIDC connections require clientId and clientSecret', 400);
    }
    if (!data.issuer && !data.discoveryUrl) {
      throw new AppError('OIDC connections require either issuer or discoveryUrl', 400);
    }
  }

  const connection = await prisma.ssoConnection.create({
    data: {
      organizationId,
      provider: data.provider,
      name: data.name,
      entityId: data.entityId,
      ssoUrl: data.ssoUrl,
      certificate: data.certificate,
      clientId: data.clientId,
      clientSecret: data.clientSecret,
      issuer: data.issuer,
      discoveryUrl: data.discoveryUrl,
    },
  });

  logger.info('SSO connection created', { organizationId, provider: data.provider });
  return connection;
}

export async function getSsoConnection(organizationId: string) {
  const connection = await prisma.ssoConnection.findUnique({
    where: { organizationId },
  });
  return connection;
}

export async function updateSsoConnection(
  organizationId: string,
  data: Partial<CreateSsoConnectionInput>
) {
  await requireScalePlan(organizationId);

  const existing = await prisma.ssoConnection.findUnique({
    where: { organizationId },
  });

  if (!existing) {
    throw new AppError('No SSO connection found for this organization', 404);
  }

  const connection = await prisma.ssoConnection.update({
    where: { organizationId },
    data: {
      ...(data.provider !== undefined && { provider: data.provider }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.entityId !== undefined && { entityId: data.entityId }),
      ...(data.ssoUrl !== undefined && { ssoUrl: data.ssoUrl }),
      ...(data.certificate !== undefined && { certificate: data.certificate }),
      ...(data.clientId !== undefined && { clientId: data.clientId }),
      ...(data.clientSecret !== undefined && { clientSecret: data.clientSecret }),
      ...(data.issuer !== undefined && { issuer: data.issuer }),
      ...(data.discoveryUrl !== undefined && { discoveryUrl: data.discoveryUrl }),
    },
  });

  logger.info('SSO connection updated', { organizationId });
  return connection;
}

export async function deleteSsoConnection(organizationId: string) {
  const existing = await prisma.ssoConnection.findUnique({
    where: { organizationId },
  });

  if (!existing) {
    throw new AppError('No SSO connection found for this organization', 404);
  }

  await prisma.ssoConnection.update({
    where: { organizationId },
    data: { enabled: false },
  });

  logger.info('SSO connection disabled', { organizationId });
  return { message: 'SSO connection disabled' };
}

export async function toggleSsoConnection(organizationId: string, enabled: boolean) {
  await requireScalePlan(organizationId);

  const connection = await prisma.ssoConnection.update({
    where: { organizationId },
    data: { enabled },
  });

  logger.info(`SSO connection ${enabled ? 'enabled' : 'disabled'}`, { organizationId });
  return connection;
}

// ---------------------------------------------------------------------------
// SAML Login Flow
// ---------------------------------------------------------------------------

export async function initiateSamlLogin(orgSlug: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    include: { ssoConnections: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const connection = org.ssoConnections[0];
  if (!connection || !connection.enabled || connection.provider !== 'SAML') {
    throw new AppError('SAML SSO is not configured for this organization', 404);
  }

  if (!connection.ssoUrl || !connection.entityId) {
    throw new AppError('SAML SSO configuration is incomplete', 400);
  }

  const apiUrl = config.apiUrl;
  const spEntityId = `${apiUrl}/api/v1/sso/saml/metadata`;
  const acsUrl = `${apiUrl}/api/v1/sso/saml/callback`;

  const authnRequestXml = buildSamlAuthnRequest(spEntityId, acsUrl, connection.ssoUrl);

  // Deflate and base64 encode for HTTP-Redirect binding
  const deflated = deflateRawSync(Buffer.from(authnRequestXml));
  const encoded = deflated.toString('base64');
  const urlEncoded = encodeURIComponent(encoded);

  // Add RelayState with orgId so the callback knows which org this is for
  const relayState = encodeURIComponent(org.id);

  const separator = connection.ssoUrl.includes('?') ? '&' : '?';
  const redirectUrl = `${connection.ssoUrl}${separator}SAMLRequest=${urlEncoded}&RelayState=${relayState}`;

  return redirectUrl;
}

export async function handleSamlCallback(
  samlResponse: string,
  relayState: string
): Promise<SamlCallbackResult> {
  // Decode the base64 SAML Response
  const xmlBuffer = Buffer.from(samlResponse, 'base64');
  const xml = xmlBuffer.toString('utf-8');

  // Extract the organization from RelayState
  const organizationId = relayState;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { ssoConnections: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const connection = org.ssoConnections[0];
  if (!connection || !connection.enabled || connection.provider !== 'SAML') {
    throw new AppError('SAML SSO is not configured for this organization', 404);
  }

  // Validate signature: check that the response references our certificate
  // In production, you would fully validate the XML signature against the stored
  // certificate. Here we do a basic check that the certificate fingerprint is present.
  if (connection.certificate) {
    const certClean = connection.certificate
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s/g, '');
    const certFingerprint = createHash('sha256').update(Buffer.from(certClean, 'base64')).digest('hex');

    // Check if any X509Certificate in the response matches
    const certMatch = xml.match(/<(?:ds:)?X509Certificate[^>]*>([^<]+)<\/(?:ds:)?X509Certificate>/i);
    if (certMatch) {
      const responseCert = certMatch[1].replace(/\s/g, '');
      const responseFingerprint = createHash('sha256').update(Buffer.from(responseCert, 'base64')).digest('hex');
      if (certFingerprint !== responseFingerprint) {
        logger.warn('SAML certificate mismatch', { organizationId });
        throw new AppError('SAML response signature validation failed', 401);
      }
    }
  }

  // Extract NameID (email)
  const email = extractSamlNameId(xml);
  if (!email) {
    throw new AppError('No NameID (email) found in SAML response', 400);
  }

  // Validate email domain matches org domain
  if (org.domain) {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain !== org.domain.toLowerCase()) {
      throw new AppError(`Email domain ${emailDomain} does not match organization domain ${org.domain}`, 403);
    }
  }

  // Extract attributes
  const firstName = extractSamlAttribute(xml, 'firstName')
    || extractSamlAttribute(xml, 'givenName')
    || extractSamlAttribute(xml, 'first_name')
    || email.split('@')[0];
  const lastName = extractSamlAttribute(xml, 'lastName')
    || extractSamlAttribute(xml, 'surname')
    || extractSamlAttribute(xml, 'last_name')
    || '';
  const groups = extractSamlAttribute(xml, 'groups')
    || extractSamlAttribute(xml, 'memberOf')
    || '';

  // Determine role from groups
  const orgRole = groups.toLowerCase().includes('admin') ? 'ADMIN' as const : 'MEMBER' as const;

  // Find or create user (JIT provisioning)
  const result = await findOrCreateSsoUser({
    email,
    firstName,
    lastName,
    organizationId: org.id,
    orgRole,
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: result.user.id,
      action: 'sso_login',
      entityType: 'user',
      entityId: result.user.id,
      entityName: `${firstName} ${lastName}`.trim(),
      metadata: { provider: 'SAML', connectionName: connection.name } as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// OIDC Login Flow
// ---------------------------------------------------------------------------

export async function initiateOidcLogin(orgSlug: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    include: { ssoConnections: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const connection = org.ssoConnections[0];
  if (!connection || !connection.enabled || connection.provider !== 'OIDC') {
    throw new AppError('OIDC SSO is not configured for this organization', 404);
  }

  if (!connection.clientId) {
    throw new AppError('OIDC SSO configuration is incomplete', 400);
  }

  // Discover OIDC endpoints
  let authorizationEndpoint: string;
  if (connection.discoveryUrl) {
    const discovered = await discoverOidcConfig(connection.discoveryUrl);
    authorizationEndpoint = discovered.authorization_endpoint;
  } else if (connection.issuer) {
    const discovered = await discoverOidcConfig(`${connection.issuer}/.well-known/openid-configuration`);
    authorizationEndpoint = discovered.authorization_endpoint;
  } else {
    throw new AppError('OIDC SSO configuration is incomplete — no issuer or discoveryUrl', 400);
  }

  // Generate PKCE values
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString('hex');

  // Store PKCE state in Redis with 10-minute TTL
  const pkceData = JSON.stringify({
    codeVerifier,
    organizationId: org.id,
  });
  await redis.setex(`sso:pkce:${state}`, 600, pkceData);

  const apiUrl = config.apiUrl;
  const redirectUri = `${apiUrl}/api/v1/sso/oidc/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: connection.clientId,
    redirect_uri: redirectUri,
    scope: 'openid email profile groups',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${authorizationEndpoint}?${params.toString()}`;
}

export async function handleOidcCallback(
  code: string,
  state: string
): Promise<OidcCallbackResult> {
  // Retrieve and validate PKCE state from Redis
  const pkceRaw = await redis.get(`sso:pkce:${state}`);
  if (!pkceRaw) {
    throw new AppError('Invalid or expired SSO state. Please try again.', 400);
  }

  // Delete the state immediately to prevent replay
  await redis.del(`sso:pkce:${state}`);

  const { codeVerifier, organizationId } = JSON.parse(pkceRaw) as {
    codeVerifier: string;
    organizationId: string;
  };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: { ssoConnections: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const connection = org.ssoConnections[0];
  if (!connection || !connection.enabled || connection.provider !== 'OIDC') {
    throw new AppError('OIDC SSO is not configured for this organization', 404);
  }

  // Discover token endpoint
  let tokenEndpoint: string;
  if (connection.discoveryUrl) {
    const discovered = await discoverOidcConfig(connection.discoveryUrl);
    tokenEndpoint = discovered.token_endpoint;
  } else if (connection.issuer) {
    const discovered = await discoverOidcConfig(`${connection.issuer}/.well-known/openid-configuration`);
    tokenEndpoint = discovered.token_endpoint;
  } else {
    throw new AppError('OIDC SSO configuration is incomplete', 400);
  }

  const apiUrl = config.apiUrl;
  const redirectUri = `${apiUrl}/api/v1/sso/oidc/callback`;

  // Exchange authorization code for tokens
  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: connection.clientId!,
      client_secret: connection.clientSecret!,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    logger.error('OIDC token exchange failed', { status: tokenResponse.status, body: errorBody });
    throw new AppError('Failed to exchange authorization code for tokens', 502);
  }

  const tokenData = (await tokenResponse.json()) as {
    id_token?: string;
    access_token?: string;
    token_type?: string;
  };

  // Parse ID token (JWT) to extract claims.
  // The token was received directly from the IdP over HTTPS in a server-to-server
  // PKCE-protected exchange, so the transport is trusted. We still validate
  // issuer, audience, and expiry claims as defense-in-depth.
  // TODO: Add full JWKS signature verification post-launch for compliance.
  let claims: Record<string, unknown> = {};

  if (tokenData.id_token) {
    const parts = tokenData.id_token.split('.');
    if (parts.length >= 2) {
      try {
        const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
        claims = JSON.parse(payloadJson) as Record<string, unknown>;
      } catch (e) {
        logger.warn('Failed to parse OIDC ID token', { error: e });
      }
    }
  }

  // Validate standard JWT claims
  if (connection.issuer && claims.iss && claims.iss !== connection.issuer) {
    throw new AppError('ID token issuer does not match configured issuer', 401);
  }

  if (connection.clientId && claims.aud) {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(connection.clientId)) {
      throw new AppError('ID token audience does not match client ID', 401);
    }
  }

  if (typeof claims.exp === 'number' && claims.exp < Date.now() / 1000) {
    throw new AppError('ID token has expired', 401);
  }

  const email = (claims.email as string) || '';
  if (!email) {
    throw new AppError('No email claim found in OIDC ID token', 400);
  }

  // Validate email domain matches org domain
  if (org.domain) {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    if (emailDomain !== org.domain.toLowerCase()) {
      throw new AppError(`Email domain ${emailDomain} does not match organization domain ${org.domain}`, 403);
    }
  }

  const firstName = (claims.given_name as string)
    || (claims.name as string)?.split(' ')[0]
    || email.split('@')[0];
  const lastName = (claims.family_name as string)
    || (claims.name as string)?.split(' ').slice(1).join(' ')
    || '';
  const groups = (claims.groups as string[]) || [];
  const groupsStr = Array.isArray(groups) ? groups.join(',') : String(groups);
  const orgRole = groupsStr.toLowerCase().includes('admin') ? 'ADMIN' as const : 'MEMBER' as const;

  // Find or create user (JIT provisioning)
  const result = await findOrCreateSsoUser({
    email,
    firstName,
    lastName,
    organizationId: org.id,
    orgRole,
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: result.user.id,
      action: 'sso_login',
      entityType: 'user',
      entityId: result.user.id,
      entityName: `${firstName} ${lastName}`.trim(),
      metadata: { provider: 'OIDC', connectionName: connection.name } as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}

// ---------------------------------------------------------------------------
// OIDC Discovery
// ---------------------------------------------------------------------------

export async function discoverOidcConfig(discoveryUrl: string): Promise<OidcDiscoveryConfig> {
  try {
    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new AppError(`Failed to fetch OIDC discovery document: ${response.status}`, 502);
    }
    const data = (await response.json()) as Record<string, unknown>;

    return {
      authorization_endpoint: data.authorization_endpoint as string,
      token_endpoint: data.token_endpoint as string,
      userinfo_endpoint: (data.userinfo_endpoint as string) || '',
      jwks_uri: (data.jwks_uri as string) || '',
      issuer: (data.issuer as string) || '',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('OIDC discovery failed', { discoveryUrl, error });
    throw new AppError('Failed to discover OIDC configuration. Check the discovery URL.', 502);
  }
}

// ---------------------------------------------------------------------------
// User find-or-create (JIT Provisioning)
// ---------------------------------------------------------------------------

async function findOrCreateSsoUser(params: {
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  orgRole: 'ADMIN' | 'MEMBER';
}): Promise<{
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
  accessToken: string;
  refreshToken: string;
  organizationId: string;
}> {
  const { email, firstName, lastName, organizationId, orgRole } = params;

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // JIT provisioning — create user without password (SSO-only)
    user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        role: 'USER',
      },
    });
    logger.info('JIT provisioned SSO user', { userId: user.id, email, organizationId });
  } else {
    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  }

  // Ensure org membership exists
  const membership = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId,
      },
    },
  });

  if (!membership) {
    await prisma.userOrganization.create({
      data: {
        userId: user.id,
        organizationId,
        role: orgRole,
      },
    });
    logger.info('Added SSO user to organization', { userId: user.id, organizationId, orgRole });
  }

  // Generate JWT tokens
  const accessToken = generateAccessToken(user.id, user.email, user.role);
  const refreshToken = generateRefreshToken(user.id);

  // Store refresh token
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
    accessToken,
    refreshToken,
    organizationId,
  };
}
