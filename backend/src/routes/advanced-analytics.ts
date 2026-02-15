import { Router } from 'express';
import type { Request, Response } from 'express';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import * as advancedAnalytics from '../services/advanced-analytics';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('MEMBER'));

// ---------------------------------------------------------------------------
// GET /cohorts — Cohort analysis (account retention/engagement over time)
// ---------------------------------------------------------------------------

router.get('/cohorts', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) === 'week' ? 'week' : 'month';
    const metric = ['signals', 'score', 'contacts'].includes(req.query.metric as string)
      ? (req.query.metric as 'signals' | 'score' | 'contacts')
      : 'signals';
    const months = parseInt(req.query.months as string) || 6;

    const result = await advancedAnalytics.getAccountCohorts(req.organizationId!, {
      period,
      metric,
      months,
    });

    res.json(result);
  } catch (error) {
    logger.error('Advanced analytics cohorts error:', error);
    res.status(500).json({ error: 'Failed to fetch cohort analysis' });
  }
});

// ---------------------------------------------------------------------------
// GET /funnel — Signal funnel (conversion through signal stages)
// ---------------------------------------------------------------------------

router.get('/funnel', async (req: Request, res: Response) => {
  try {
    const stagesParam = req.query.stages as string | undefined;
    const stages = stagesParam
      ? stagesParam.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const result = await advancedAnalytics.getSignalFunnel(req.organizationId!, { stages });

    res.json(result);
  } catch (error) {
    logger.error('Advanced analytics funnel error:', error);
    res.status(500).json({ error: 'Failed to fetch funnel analysis' });
  }
});

// ---------------------------------------------------------------------------
// GET /trends — Signal trends by type over time
// ---------------------------------------------------------------------------

router.get('/trends', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const groupBy = (req.query.groupBy as string) === 'week' ? 'week' : 'day';

    const result = await advancedAnalytics.getSignalTrends(req.organizationId!, {
      days,
      groupBy,
    });

    res.json(result);
  } catch (error) {
    logger.error('Advanced analytics trends error:', error);
    res.status(500).json({ error: 'Failed to fetch signal trends' });
  }
});

// ---------------------------------------------------------------------------
// GET /tier-movement — Track accounts that changed tier
// ---------------------------------------------------------------------------

router.get('/tier-movement', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const result = await advancedAnalytics.getTierMovement(req.organizationId!, { days });

    res.json(result);
  } catch (error) {
    logger.error('Advanced analytics tier-movement error:', error);
    res.status(500).json({ error: 'Failed to fetch tier movement' });
  }
});

// ---------------------------------------------------------------------------
// GET /top-movers — Accounts with biggest score changes
// ---------------------------------------------------------------------------

router.get('/top-movers', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await advancedAnalytics.getTopMovers(req.organizationId!, { days, limit });

    res.json(result);
  } catch (error) {
    logger.error('Advanced analytics top-movers error:', error);
    res.status(500).json({ error: 'Failed to fetch top movers' });
  }
});

// ---------------------------------------------------------------------------
// GET /source-attribution — Which sources drive the most pipeline
// ---------------------------------------------------------------------------

router.get('/source-attribution', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    const result = await advancedAnalytics.getSourceAttribution(req.organizationId!, { days });

    res.json(result);
  } catch (error) {
    logger.error('Advanced analytics source-attribution error:', error);
    res.status(500).json({ error: 'Failed to fetch source attribution' });
  }
});

export default router;
