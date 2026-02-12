import { Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/api-keys';
import { logger } from '../utils/logger';

const API_KEY_PREFIX = 'ds_live_';

/**
 * Extracts an API key from the request headers.
 * Checks `x-api-key` header first, then `Authorization: Bearer ds_live_*`.
 */
function extractApiKey(req: Request): string | null {
  // Check x-api-key header
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.startsWith(API_KEY_PREFIX)) {
    return xApiKey;
  }

  // Check Authorization: Bearer ds_live_*
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token.startsWith(API_KEY_PREFIX)) {
      return token;
    }
  }

  return null;
}

/**
 * API key authentication middleware.
 * If an API key is found and valid, sets req.organizationId and req.apiKeyAuth.
 * If no API key is present, falls through to allow JWT auth to handle it.
 */
export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawKey = extractApiKey(req);

    if (!rawKey) {
      // No API key found — fall through to JWT auth
      next();
      return;
    }

    const apiKey = await validateApiKey(rawKey);

    if (!apiKey) {
      res.status(401).json({ error: 'Invalid or expired API key' });
      return;
    }

    req.organizationId = apiKey.organizationId;
    req.apiKeyAuth = true;
    req.apiKeyScopes = apiKey.scopes;

    next();
  } catch (error) {
    logger.error('API key auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Scope-checking middleware factory.
 * Requires that the authenticated API key has the specified scope.
 * If the request was authenticated via JWT (not API key), it passes through
 * (JWT users are assumed to have full access through their org role).
 */
export const requireScope = (scope: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // If not API key auth, let it through (JWT users have full access)
    if (!req.apiKeyAuth) {
      next();
      return;
    }

    const scopes: string[] = req.apiKeyScopes || [];

    if (!scopes.includes(scope) && !scopes.includes('*')) {
      res.status(403).json({
        error: 'Insufficient scope',
        required: scope,
      });
      return;
    }

    next();
  };
};
