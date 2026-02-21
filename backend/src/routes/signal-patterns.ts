import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import {
  buildSignalProfile,
  findLookalikes,
  matchICP,
  detectSignalSequences,
  getICPDefinitions,
  createICPDefinition,
  deleteICPDefinition,
} from '../services/signal-patterns';
import type { ICPDefinition } from '../services/signal-patterns';

const router = Router();

// All signal pattern routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// GET /profile/:accountId — Get signal profile for a specific account
// ---------------------------------------------------------------------------

router.get(
  '/profile/:accountId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { accountId } = req.params;

      const profile = await buildSignalProfile(accountId, organizationId);

      if (!profile) {
        res.status(404).json({ error: 'Account not found or has no signal data' });
        return;
      }

      res.json({ data: profile });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /lookalikes/:accountId — Find lookalike accounts
// ---------------------------------------------------------------------------

router.get(
  '/lookalikes/:accountId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { accountId } = req.params;
      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string, 10) || 10, 1),
        50,
      );

      const lookalikes = await findLookalikes(accountId, organizationId, limit);

      res.json({
        data: lookalikes,
        meta: { referenceAccountId: accountId, count: lookalikes.length, limit },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /icp — Create an ICP definition
// ---------------------------------------------------------------------------

router.post(
  '/icp',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { name, description, criteria } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      if (!criteria || typeof criteria !== 'object') {
        res.status(400).json({ error: 'Criteria object is required' });
        return;
      }

      const definition = await createICPDefinition(organizationId, {
        name: name.trim(),
        description: (description || '').trim(),
        criteria,
      });

      res.status(201).json({ data: definition });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /icp — List all ICP definitions
// ---------------------------------------------------------------------------

router.get(
  '/icp',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const definitions = await getICPDefinitions(organizationId);

      res.json({ data: definitions, meta: { count: definitions.length } });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /icp/:id/matches — Get accounts matching an ICP
// ---------------------------------------------------------------------------

router.get(
  '/icp/:id/matches',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { id } = req.params;

      // Retrieve the ICP definition
      const definitions = await getICPDefinitions(organizationId);
      const icpDef = definitions.find((d: ICPDefinition) => d.id === id);

      if (!icpDef) {
        res.status(404).json({ error: 'ICP definition not found' });
        return;
      }

      const matches = await matchICP(icpDef, organizationId);

      res.json({
        data: matches,
        meta: { icpId: id, icpName: icpDef.name, count: matches.length },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /icp/:id — Delete an ICP definition
// ---------------------------------------------------------------------------

router.delete(
  '/icp/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { id } = req.params;

      const deleted = await deleteICPDefinition(organizationId, id);

      if (!deleted) {
        res.status(404).json({ error: 'ICP definition not found' });
        return;
      }

      res.json({ message: 'ICP definition deleted' });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /sequences — Detect signal sequences that predict high engagement
// ---------------------------------------------------------------------------

router.get(
  '/sequences',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const sequences = await detectSignalSequences(organizationId);

      res.json({ data: sequences, meta: { count: sequences.length } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
