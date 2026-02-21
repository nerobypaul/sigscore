import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import * as scoringRules from '../services/scoring-rules';
import {
  SIGNAL_HALF_LIVES,
  DEFAULT_HALF_LIFE,
  computeDecayWeight,
} from '../services/account-scores';

const router = Router();

// Authentication + organization required for all scoring routes
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET /decay-config — Return signal decay half-life configuration
// Available to all authenticated users (not admin-only) so the frontend
// can display decay parameters on score detail views.
// ---------------------------------------------------------------------------

router.get(
  '/decay-config',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Build a response that includes the half-life map, the default, and
      // example decay curves so the frontend can render explanatory charts.
      const exampleDays = [0, 1, 3, 7, 14, 21, 30, 60, 90];
      const exampleCurves: Record<string, { day: number; weight: number }[]> = {};

      // Pick a few representative signal types for the example curves
      const representativeTypes = [
        'signup',        // very durable (60d half-life)
        'repo_fork',     // durable (28d)
        'api_call',      // medium (14d)
        'page_view',     // transient (5d)
      ];

      for (const signalType of representativeTypes) {
        exampleCurves[signalType] = exampleDays.map((day) => ({
          day,
          weight: Math.round(computeDecayWeight(signalType, day) * 1000) / 1000,
        }));
      }

      res.json({
        halfLives: SIGNAL_HALF_LIVES,
        defaultHalfLife: DEFAULT_HALF_LIFE,
        decayFormula: 'weight = e^(-ln(2) / halfLife * daysOld)',
        windowDays: 90,
        exampleCurves,
      });
    } catch (error) {
      next(error);
    }
  },
);

// --- All routes below require ADMIN role ---
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['gt', 'lt', 'eq', 'contains']),
  value: z.string(),
});

const scoringRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  signalType: z.string().min(1).default('*'),
  weight: z.number().min(0).max(100),
  decay: z.enum(['none', '7d', '14d', '30d', '90d']),
  conditions: z.array(conditionSchema).default([]),
  enabled: z.boolean(),
});

const tierThresholdsSchema = z.object({
  HOT: z.number().min(0).max(100),
  WARM: z.number().min(0).max(100),
  COLD: z.number().min(0).max(100),
});

const scoringConfigSchema = z.object({
  rules: z.array(scoringRuleSchema).min(1).max(50),
  tierThresholds: tierThresholdsSchema,
  maxScore: z.number().min(1).max(1000).default(100),
});

// ---------------------------------------------------------------------------
// GET /config — Get current scoring config
// ---------------------------------------------------------------------------

router.get(
  '/config',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const config = await scoringRules.getScoringConfig(organizationId);
      res.json(config);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /config — Update scoring config
// ---------------------------------------------------------------------------

router.put(
  '/config',
  validate(scoringConfigSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const config = req.body as scoringRules.ScoringConfig;
      const saved = await scoringRules.updateScoringConfig(organizationId, config);
      logger.info('Scoring config updated via API', { organizationId });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /preview — Preview scores with proposed config
// ---------------------------------------------------------------------------

router.post(
  '/preview',
  validate(scoringConfigSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const proposedConfig = req.body as scoringRules.ScoringConfig;
      const previews = await scoringRules.previewScores(organizationId, proposedConfig);
      res.json({ previews });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /recompute — Force recompute all scores with current (or provided) config
// ---------------------------------------------------------------------------

router.post(
  '/recompute',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      // If a config is provided in the body, use it; otherwise use current config
      let config: scoringRules.ScoringConfig;
      if (req.body && req.body.rules) {
        const parsed = scoringConfigSchema.safeParse(req.body);
        if (parsed.success) {
          config = parsed.data as scoringRules.ScoringConfig;
        } else {
          config = await scoringRules.getScoringConfig(organizationId);
        }
      } else {
        config = await scoringRules.getScoringConfig(organizationId);
      }

      const result = await scoringRules.applyAndRecompute(organizationId, config);
      logger.info('Scores recomputed via API', { organizationId, updated: result.updated });
      res.json({ updated: result.updated, config: result.config });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /reset — Reset to defaults
// ---------------------------------------------------------------------------

router.post(
  '/reset',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const config = await scoringRules.resetToDefaults(organizationId);
      logger.info('Scoring config reset to defaults via API', { organizationId });
      res.json(config);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
