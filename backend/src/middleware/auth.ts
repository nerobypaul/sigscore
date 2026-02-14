import { Request, Response, NextFunction } from 'express';
import { OrgRole } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

/** Role hierarchy: OWNER > ADMIN > MEMBER > VIEWER */
const ROLE_HIERARCHY: Record<OrgRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

/**
 * Middleware that requires the authenticated user to have at least the given
 * org role. Must be used after `requireOrganization` which sets `req.orgRole`.
 */
export const requireOrgRole = (minimumRole: OrgRole) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.orgRole) {
      res.status(403).json({ error: 'Organization context required' });
      return;
    }

    if (ROLE_HIERARCHY[req.orgRole] < ROLE_HIERARCHY[minimumRole]) {
      res.status(403).json({ error: 'Insufficient organization permissions' });
      return;
    }

    next();
  };
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export const requireOrganization = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const orgId = req.headers['x-organization-id'] as string;

    if (!orgId) {
      res.status(400).json({ error: 'Organization ID required' });
      return;
    }

    const userOrg = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: orgId,
        },
      },
    });

    if (!userOrg) {
      res.status(403).json({ error: 'Access to organization denied' });
      return;
    }

    req.organizationId = orgId;
    req.orgRole = userOrg.role;
    next();
  } catch (error) {
    logger.error('Organization check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
