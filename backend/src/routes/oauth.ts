import { Router } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import {
  generateOAuthState,
  storeOAuthState,
  validateOAuthState,
  getGitHubAuthUrl,
  handleGitHubCallback,
  getGoogleAuthUrl,
  handleGoogleCallback,
} from '../services/oauth';

const router = Router();
const FRONTEND_URL = config.frontend.url;

// ─── GitHub ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /oauth/github:
 *   get:
 *     tags: [OAuth]
 *     summary: Initiate GitHub OAuth login
 *     description: Generates a CSRF state token, stores it in Redis, and redirects to GitHub's authorization page.
 *     responses:
 *       302:
 *         description: Redirect to GitHub OAuth
 */
router.get('/github', async (_req, res) => {
  try {
    const state = generateOAuthState();
    await storeOAuthState(state);
    const url = getGitHubAuthUrl(state);
    res.redirect(url);
  } catch (error) {
    logger.error('GitHub OAuth init error:', error);
    res.redirect(`${FRONTEND_URL}/login?oauth_error=Failed to initiate GitHub login`);
  }
});

/**
 * @openapi
 * /oauth/github/callback:
 *   get:
 *     tags: [OAuth]
 *     summary: GitHub OAuth callback
 *     description: Handles the OAuth callback from GitHub, validates state, exchanges code for tokens, and redirects to frontend.
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens
 */
router.get('/github/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // GitHub may redirect with an error (user denied access, etc.)
    if (oauthError) {
      logger.warn(`GitHub OAuth denied: ${oauthError}`);
      res.redirect(
        `${FRONTEND_URL}/login?oauth_error=${encodeURIComponent(String(oauthError))}`
      );
      return;
    }

    if (!code || !state) {
      res.redirect(`${FRONTEND_URL}/login?oauth_error=Missing code or state parameter`);
      return;
    }

    // Validate CSRF state token
    const isValidState = await validateOAuthState(String(state));
    if (!isValidState) {
      res.redirect(`${FRONTEND_URL}/login?oauth_error=Invalid or expired state token`);
      return;
    }

    const result = await handleGitHubCallback(String(code));

    // Redirect to frontend with tokens
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    res.redirect(`${FRONTEND_URL}/oauth/callback?${params.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('GitHub OAuth callback error:', error);
    res.redirect(
      `${FRONTEND_URL}/login?oauth_error=${encodeURIComponent(message)}`
    );
  }
});

// ─── Google ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /oauth/google:
 *   get:
 *     tags: [OAuth]
 *     summary: Initiate Google OAuth login
 *     description: Generates a CSRF state token, stores it in Redis, and redirects to Google's authorization page.
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
router.get('/google', async (_req, res) => {
  try {
    const state = generateOAuthState();
    await storeOAuthState(state);
    const url = getGoogleAuthUrl(state);
    res.redirect(url);
  } catch (error) {
    logger.error('Google OAuth init error:', error);
    res.redirect(`${FRONTEND_URL}/login?oauth_error=Failed to initiate Google login`);
  }
});

/**
 * @openapi
 * /oauth/google/callback:
 *   get:
 *     tags: [OAuth]
 *     summary: Google OAuth callback
 *     description: Handles the OAuth callback from Google, validates state, exchanges code for tokens, and redirects to frontend.
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       302:
 *         description: Redirect to frontend with tokens
 */
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      logger.warn(`Google OAuth denied: ${oauthError}`);
      res.redirect(
        `${FRONTEND_URL}/login?oauth_error=${encodeURIComponent(String(oauthError))}`
      );
      return;
    }

    if (!code || !state) {
      res.redirect(`${FRONTEND_URL}/login?oauth_error=Missing code or state parameter`);
      return;
    }

    // Validate CSRF state token
    const isValidState = await validateOAuthState(String(state));
    if (!isValidState) {
      res.redirect(`${FRONTEND_URL}/login?oauth_error=Invalid or expired state token`);
      return;
    }

    const result = await handleGoogleCallback(String(code));

    // Redirect to frontend with tokens
    const params = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    res.redirect(`${FRONTEND_URL}/oauth/callback?${params.toString()}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Google OAuth callback error:', error);
    res.redirect(
      `${FRONTEND_URL}/login?oauth_error=${encodeURIComponent(message)}`
    );
  }
});

export default router;
