import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import * as playbookService from '../services/playbooks';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('MEMBER'));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET / - List all available playbook templates (with activation status)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const playbooks = await playbookService.listPlaybooks(organizationId);
    res.json({ playbooks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /active - List currently active playbooks for the org
 */
router.get('/active', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const active = await playbookService.getActivePlaybooks(organizationId);
    res.json({ playbooks: active });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/activate - Activate a playbook template
 */
router.post(
  '/:id/activate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const playbookId = req.params.id;
      const { workflow, warnings } = await playbookService.activatePlaybook(organizationId, playbookId);
      logger.info(`Playbook activated: ${playbookId} -> workflow ${workflow.id}`);
      res.status(201).json({
        ok: true,
        playbookId,
        workflowId: workflow.id,
        warnings,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /:id - Deactivate a playbook
 */
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const playbookId = req.params.id;
      await playbookService.deactivatePlaybook(organizationId, playbookId);
      logger.info(`Playbook deactivated: ${playbookId}`);
      res.json({ ok: true, playbookId });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
