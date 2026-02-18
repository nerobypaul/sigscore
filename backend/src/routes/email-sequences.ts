import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { parsePageInt } from '../utils/pagination';
import * as sequenceService from '../services/email-sequences';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createSequenceSchema = z.object({
  name: z.string().min(1).max(200),
  triggerType: z.string().min(1),
  description: z.string().max(2000).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  fromName: z.string().max(200).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
});

const updateSequenceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.string().optional(),
  triggerType: z.string().min(1).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  fromName: z.string().max(200).optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional(),
});

const createStepSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  delayDays: z.number().int().min(0).optional(),
  delayHours: z.number().int().min(0).max(23).optional(),
});

const updateStepSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  delayDays: z.number().int().min(0).optional(),
  delayHours: z.number().int().min(0).max(23).optional(),
});

const reorderStepsSchema = z.object({
  stepIds: z.array(z.string()).min(1),
});

const enrollContactsSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(500),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET / — List sequences
 * Query: status, page, limit
 */
router.get(
  '/',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = req.query.status as string | undefined;
      const page = parsePageInt(req.query.page);
      const limit = parsePageInt(req.query.limit);

      const result = await sequenceService.getSequences(organizationId, {
        status,
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST / — Create a new sequence
 */
router.post(
  '/',
  requireOrgRole('ADMIN'),
  validate(createSequenceSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const sequence = await sequenceService.createSequence(
        organizationId,
        req.body,
        userId,
      );

      res.status(201).json({ sequence });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /:id — Get a sequence with steps and stats
 */
router.get(
  '/:id',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const sequence = await sequenceService.getSequence(
        organizationId,
        req.params.id,
      );
      res.json({ sequence });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /:id — Update a sequence
 */
router.put(
  '/:id',
  requireOrgRole('ADMIN'),
  validate(updateSequenceSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      const sequence = await sequenceService.updateSequence(
        organizationId,
        req.params.id,
        req.body,
        userId,
      );

      res.json({ sequence });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /:id — Archive a sequence
 */
router.delete(
  '/:id',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const userId = req.user!.id;

      await sequenceService.deleteSequence(
        organizationId,
        req.params.id,
        userId,
      );

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /:id/steps — Add a step to a sequence
 */
router.post(
  '/:id/steps',
  requireOrgRole('ADMIN'),
  validate(createStepSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org first
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const step = await sequenceService.addStep(req.params.id, req.body);
      res.status(201).json({ step });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /:id/steps/:stepId — Update a step
 */
router.put(
  '/:id/steps/:stepId',
  requireOrgRole('ADMIN'),
  validate(updateStepSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const step = await sequenceService.updateStep(req.params.id, req.params.stepId, req.body);
      res.json({ step });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /:id/steps/:stepId — Delete a step
 */
router.delete(
  '/:id/steps/:stepId',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      await sequenceService.deleteStep(req.params.id, req.params.stepId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /:id/steps/reorder — Reorder steps
 */
router.put(
  '/:id/steps/reorder',
  requireOrgRole('ADMIN'),
  validate(reorderStepsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const { stepIds } = req.body as z.infer<typeof reorderStepsSchema>;
      const steps = await sequenceService.reorderSteps(req.params.id, stepIds);
      res.json({ steps });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /:id/enroll — Enroll contacts in a sequence
 */
router.post(
  '/:id/enroll',
  requireOrgRole('MEMBER'),
  validate(enrollContactsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const { contactIds } = req.body as z.infer<typeof enrollContactsSchema>;
      const results = await sequenceService.enrollContacts(
        req.params.id,
        contactIds,
      );
      res.json({ results });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /:id/enrollments — List enrollments for a sequence
 * Query: status, page, limit
 */
router.get(
  '/:id/enrollments',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const status = req.query.status as string | undefined;
      const page = parsePageInt(req.query.page);
      const limit = parsePageInt(req.query.limit);

      const result = await sequenceService.getEnrollments(req.params.id, {
        status,
        page,
        limit,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /:id/enrollments/:enrollmentId/pause — Pause an enrollment
 */
router.put(
  '/:id/enrollments/:enrollmentId/pause',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const enrollment = await sequenceService.pauseEnrollment(
        req.params.id,
        req.params.enrollmentId,
      );
      res.json({ enrollment });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /:id/enrollments/:enrollmentId/resume — Resume an enrollment
 */
router.put(
  '/:id/enrollments/:enrollmentId/resume',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const enrollment = await sequenceService.resumeEnrollment(
        req.params.id,
        req.params.enrollmentId,
      );
      res.json({ enrollment });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /:id/enrollments/:enrollmentId — Unenroll a contact
 */
router.delete(
  '/:id/enrollments/:enrollmentId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      // unenrollContact expects (sequenceId, contactId), so we look up the
      // enrollment to extract the contactId.
      const { prisma } = await import('../config/database');
      const enrollment = await prisma.emailEnrollment.findFirst({
        where: { id: req.params.enrollmentId, sequenceId: req.params.id },
        select: { contactId: true },
      });

      if (!enrollment) {
        res.status(404).json({ error: 'Enrollment not found' });
        return;
      }

      await sequenceService.unenrollContact(req.params.id, enrollment.contactId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /:id/stats — Get aggregate stats for a sequence
 */
router.get(
  '/:id/stats',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Verify the sequence belongs to this org
      const organizationId = req.organizationId!;
      await sequenceService.getSequence(organizationId, req.params.id);

      const stats = await sequenceService.getSequenceStats(req.params.id);
      res.json({ stats });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
