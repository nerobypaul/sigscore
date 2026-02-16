import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import {
  getUsageSummary,
  getUsageTimeSeries,
  getEndpointBreakdown,
  getRateLimitStatus,
} from '../services/api-usage';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET /api/v1/api-usage/summary
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api-usage/summary:
 *   get:
 *     tags: [API Usage]
 *     summary: Get API usage summary
 *     description: |
 *       Returns total request counts for today/week/month, average response
 *       time, error rate, and top endpoints.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: API usage summary
 */
router.get('/summary', (req: Request, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const summary = getUsageSummary(orgId);
    res.json(summary);
  } catch (error) {
    logger.error('Failed to fetch API usage summary:', error);
    res.status(500).json({ error: 'Failed to fetch API usage summary' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/api-usage/timeseries?hours=24
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api-usage/timeseries:
 *   get:
 *     tags: [API Usage]
 *     summary: Get hourly request time series
 *     description: |
 *       Returns hourly request counts, error counts, and average response
 *       times for the specified number of hours.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *           minimum: 1
 *           maximum: 168
 *         description: Number of hours to look back (max 168 = 7 days)
 *     responses:
 *       200:
 *         description: Hourly time series data
 */
router.get('/timeseries', (req: Request, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const hours = Math.min(Math.max(parseInt(req.query.hours as string) || 24, 1), 168);
    const timeseries = getUsageTimeSeries(orgId, hours);
    res.json({ hours, data: timeseries });
  } catch (error) {
    logger.error('Failed to fetch API usage timeseries:', error);
    res.status(500).json({ error: 'Failed to fetch API usage timeseries' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/api-usage/endpoints
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api-usage/endpoints:
 *   get:
 *     tags: [API Usage]
 *     summary: Get endpoint breakdown
 *     description: |
 *       Returns top 20 endpoints by request count with average latency
 *       and error rate.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Endpoint breakdown
 */
router.get('/endpoints', (req: Request, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const endpoints = getEndpointBreakdown(orgId);
    res.json({ endpoints });
  } catch (error) {
    logger.error('Failed to fetch endpoint breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch endpoint breakdown' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/api-usage/rate-limits
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /api-usage/rate-limits:
 *   get:
 *     tags: [API Usage]
 *     summary: Get rate limit status
 *     description: |
 *       Returns current rate limit consumption vs tier limits for all
 *       rate-limited endpoint groups.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Rate limit status
 */
router.get('/rate-limits', async (req: Request, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const status = await getRateLimitStatus(orgId);
    res.json(status);
  } catch (error) {
    logger.error('Failed to fetch rate limit status:', error);
    res.status(500).json({ error: 'Failed to fetch rate limit status' });
  }
});

export default router;
