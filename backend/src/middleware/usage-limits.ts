import { Request, Response, NextFunction } from 'express';
import { checkLimit, Resource } from '../services/usage';
import { logger } from '../utils/logger';

/** Human-readable labels for each resource, used in 402 error messages. */
const RESOURCE_LABELS: Record<Resource, string> = {
  contacts: 'Contact limit reached',
  signals: 'Signal limit reached',
  users: 'User limit reached',
};

/**
 * Factory that produces middleware enforcing a plan limit for the given resource.
 * Returns 402 Payment Required when the limit has been reached.
 */
function enforcePlanLimit(resource: Resource) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId;

      if (!organizationId) {
        // Should never happen if auth middleware runs first -- fail safe.
        res.status(400).json({ error: 'Organization context required' });
        return;
      }

      const result = await checkLimit(organizationId, resource);

      if (!result.allowed) {
        res.status(402).json({
          error: RESOURCE_LABELS[resource],
          limit: result.limit,
          current: result.current,
          tier: result.plan.toUpperCase(),
          upgradeUrl: '/billing',
        });
        return;
      }

      next();
    } catch (error) {
      logger.error(`Usage limit check failed for ${resource}:`, error);
      // Fail open -- do not block requests if the limit check itself errors.
      next();
    }
  };
}

export const enforceContactLimit = enforcePlanLimit('contacts');
export const enforceSignalLimit = enforcePlanLimit('signals');
export const enforceUserLimit = enforcePlanLimit('users');
