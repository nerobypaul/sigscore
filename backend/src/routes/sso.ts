import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  createSsoConnection,
  getSsoConnection,
  updateSsoConnection,
  deleteSsoConnection,
  toggleSsoConnection,
  initiateSamlLogin,
  handleSamlCallback,
  initiateOidcLogin,
  handleOidcCallback,
  discoverOidcConfig,
} from '../services/sso';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createSsoSchema = z.object({
  provider: z.enum(['SAML', 'OIDC']),
  name: z.string().min(1).max(100),
  entityId: z.string().optional(),
  ssoUrl: z.string().url().optional(),
  certificate: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  issuer: z.string().optional(),
  discoveryUrl: z.string().url().optional(),
});

const updateSsoSchema = z.object({
  provider: z.enum(['SAML', 'OIDC']).optional(),
  name: z.string().min(1).max(100).optional(),
  entityId: z.string().optional(),
  ssoUrl: z.string().url().optional(),
  certificate: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  issuer: z.string().optional(),
  discoveryUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
});

const discoverSchema = z.object({
  discoveryUrl: z.string().url(),
});

// ---------------------------------------------------------------------------
// Authenticated CRUD routes (require ADMIN role + Scale plan)
// ---------------------------------------------------------------------------

/**
 * POST /sso/connections — Create SSO connection
 */
router.post(
  '/connections',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  validate(createSsoSchema),
  async (req, res, next) => {
    try {
      const connection = await createSsoConnection(req.organizationId!, req.body);
      res.status(201).json(connection);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /sso/connections — Get current SSO connection
 */
router.get(
  '/connections',
  authenticate,
  requireOrganization,
  async (req, res, next) => {
    try {
      const connection = await getSsoConnection(req.organizationId!);
      if (!connection) {
        res.json(null);
        return;
      }
      // Mask sensitive fields for non-admins
      const masked = {
        ...connection,
        clientSecret: connection.clientSecret ? '********' : null,
        certificate: connection.certificate ? '[configured]' : null,
      };
      res.json(masked);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /sso/connections — Update SSO connection
 */
router.put(
  '/connections',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  validate(updateSsoSchema),
  async (req, res, next) => {
    try {
      // Handle enabled toggle separately
      if (req.body.enabled !== undefined && Object.keys(req.body).length === 1) {
        const connection = await toggleSsoConnection(req.organizationId!, req.body.enabled);
        res.json(connection);
        return;
      }

      const connection = await updateSsoConnection(req.organizationId!, req.body);
      res.json(connection);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /sso/connections — Disable SSO connection
 */
router.delete(
  '/connections',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  async (req, res, next) => {
    try {
      const result = await deleteSsoConnection(req.organizationId!);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// SAML Login / Callback routes (no auth — they ARE the auth flow)
// ---------------------------------------------------------------------------

/**
 * GET /sso/saml/login/:orgSlug — Initiate SAML login
 */
router.get('/saml/login/:orgSlug', async (req, res, next) => {
  try {
    const redirectUrl = await initiateSamlLogin(req.params.orgSlug);
    res.redirect(redirectUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /sso/saml/callback — Handle SAML response from IdP
 */
router.post('/saml/callback', async (req, res) => {
  try {
    const samlResponse = req.body.SAMLResponse as string;
    const relayState = req.body.RelayState as string;

    if (!samlResponse || !relayState) {
      throw new AppError('Missing SAMLResponse or RelayState', 400);
    }

    const result = await handleSamlCallback(samlResponse, relayState);

    // Redirect to frontend with tokens
    const frontendUrl = config.frontend.url;
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      organizationId: result.organizationId,
    });
    res.redirect(`${frontendUrl}/sso/callback?${params.toString()}`);
  } catch (error) {
    logger.error('SAML callback error', { error });
    const frontendUrl = config.frontend.url;
    const message = error instanceof AppError ? error.message : 'SSO authentication failed';
    res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent(message)}`);
  }
});

// ---------------------------------------------------------------------------
// OIDC Login / Callback routes (no auth — they ARE the auth flow)
// ---------------------------------------------------------------------------

/**
 * GET /sso/oidc/login/:orgSlug — Initiate OIDC login
 */
router.get('/oidc/login/:orgSlug', async (req, res, next) => {
  try {
    const redirectUrl = await initiateOidcLogin(req.params.orgSlug);
    res.redirect(redirectUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /sso/oidc/callback — Handle OIDC callback
 */
router.get('/oidc/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      throw new AppError('Missing code or state parameter', 400);
    }

    const result = await handleOidcCallback(code, state);

    // Redirect to frontend with tokens
    const frontendUrl = config.frontend.url;
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      organizationId: result.organizationId,
    });
    res.redirect(`${frontendUrl}/sso/callback?${params.toString()}`);
  } catch (error) {
    logger.error('OIDC callback error', { error });
    const frontendUrl = config.frontend.url;
    const message = error instanceof AppError ? error.message : 'SSO authentication failed';
    res.redirect(`${frontendUrl}/login?sso_error=${encodeURIComponent(message)}`);
  }
});

// ---------------------------------------------------------------------------
// OIDC Discovery test (authenticated, ADMIN only)
// ---------------------------------------------------------------------------

/**
 * POST /sso/oidc/discover — Test OIDC discovery URL
 */
router.post(
  '/oidc/discover',
  authenticate,
  requireOrganization,
  requireOrgRole('ADMIN'),
  validate(discoverSchema),
  async (req, res, next) => {
    try {
      const oidcConfig = await discoverOidcConfig(req.body.discoveryUrl);
      res.json(oidcConfig);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
