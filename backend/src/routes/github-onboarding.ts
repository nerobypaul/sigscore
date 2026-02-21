import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import {
  runGitHubOnboarding,
  getCrawlProgress,
  listUserRepos,
} from '../services/github-onboarding';

const router = Router();

// All onboarding routes require authentication + org context
router.use(authenticate);
router.use(requireOrganization);

// Stricter rate limit for the crawl endpoint (expensive operation)
const crawlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many onboarding attempts. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const reposSchema = z.object({
  token: z.string().min(1, 'GitHub token is required'),
});

const connectSchema = z.object({
  token: z.string().min(1, 'GitHub token is required'),
  repos: z
    .array(z.string().min(1))
    .max(10, 'Maximum 10 repos per onboarding')
    .optional(),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/onboarding/github/repos
 *
 * Lists the authenticated user's GitHub repos so they can pick which ones
 * to scan. Lightweight — no database writes.
 *
 * Body: { token: string }
 */
router.post('/github/repos', validate(reposSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body as z.infer<typeof reposSchema>;

    const repos = await listUserRepos(token);
    res.json({ repos });
  } catch (err: unknown) {
    logger.error('GitHub onboarding repos error', { error: err });
    res.status(500).json({ error: 'Failed to list repositories. Please check your GitHub token and try again.' });
  }
});

/**
 * POST /api/v1/onboarding/github/connect
 *
 * Takes a GitHub PAT and optional repo list, crawls stargazers/forkers/authors,
 * resolves companies, creates records, and returns a summary.
 *
 * Body: { token: string, repos?: string[] }
 */
router.post(
  '/github/connect',
  crawlLimiter,
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { token, repos } = req.body as z.infer<typeof connectSchema>;

      // Run the crawl (this is intentionally synchronous for the onboarding
      // experience — it should complete in < 60s for repos with < 1000 stars)
      const summary = await runGitHubOnboarding(organizationId, token, repos);

      res.json(summary);
    } catch (err: unknown) {
      logger.error('GitHub onboarding connect error', { error: err });
      res.status(500).json({ error: 'GitHub onboarding failed. Please check your token and try again.' });
    }
  },
);

/**
 * GET /api/v1/onboarding/github/status
 *
 * Returns the current crawl progress for the organization.
 * Used for polling during the onboarding flow.
 */
router.get('/github/status', (req: Request, res: Response): void => {
  const organizationId = req.organizationId!;
  const progress = getCrawlProgress(organizationId);
  res.json(progress);
});

export default router;
