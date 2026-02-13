import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import * as analyticsService from '../services/analytics';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET / — Overview stats (contacts, companies, deals, signals, pipeline)
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response) => {
  try {
    const overview = await analyticsService.getOverview(req.organizationId!);
    res.json(overview);
  } catch (error) {
    logger.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

// ---------------------------------------------------------------------------
// GET /signal-trends — Daily signal counts over a configurable window
// ---------------------------------------------------------------------------

router.get('/signal-trends', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const trends = await analyticsService.getSignalTrends(req.organizationId!, days);
    res.json({ trends, days });
  } catch (error) {
    logger.error('Signal trends error:', error);
    res.status(500).json({ error: 'Failed to fetch signal trends' });
  }
});

// ---------------------------------------------------------------------------
// GET /pqa-distribution — Account scores grouped by tier
// ---------------------------------------------------------------------------

router.get('/pqa-distribution', async (req: Request, res: Response) => {
  try {
    const distribution = await analyticsService.getPqaDistribution(req.organizationId!);
    res.json(distribution);
  } catch (error) {
    logger.error('PQA distribution error:', error);
    res.status(500).json({ error: 'Failed to fetch PQA distribution' });
  }
});

// ---------------------------------------------------------------------------
// GET /pipeline — Deal funnel in PLG stage order
// ---------------------------------------------------------------------------

router.get('/pipeline', async (req: Request, res: Response) => {
  try {
    const pipeline = await analyticsService.getPipelineFunnel(req.organizationId!);
    res.json({ stages: pipeline });
  } catch (error) {
    logger.error('Pipeline funnel error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline funnel' });
  }
});

// ---------------------------------------------------------------------------
// GET /top-signals — Most common signal types this month
// ---------------------------------------------------------------------------

router.get('/top-signals', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const topSignals = await analyticsService.getTopSignalTypes(req.organizationId!, limit);
    res.json({ signals: topSignals, limit });
  } catch (error) {
    logger.error('Top signal types error:', error);
    res.status(500).json({ error: 'Failed to fetch top signal types' });
  }
});

export default router;
