import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Public router — shared report access (no auth)
// ---------------------------------------------------------------------------

export const accountReportsPublicRouter = Router();

// GET /api/v1/account-reports/shared/:shareToken — PUBLIC
accountReportsPublicRouter.get(
  '/shared/:shareToken',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await prisma.accountReport.findUnique({
        where: { shareToken: req.params.shareToken },
      });

      if (!report) {
        throw new AppError('Report not found', 404);
      }

      if (!report.isPublic) {
        throw new AppError('This report is no longer available', 403);
      }

      if (report.expiresAt && new Date(report.expiresAt) < new Date()) {
        throw new AppError('This report has expired', 410);
      }

      // Increment view count (fire-and-forget)
      prisma.accountReport
        .update({
          where: { id: report.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch((err) => {
          logger.error('Failed to increment report view count', { reportId: report.id, error: err });
        });

      res.json({
        report: {
          id: report.id,
          title: report.title,
          content: report.content,
          viewCount: report.viewCount + 1,
          createdAt: report.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Authenticated router — CRUD operations
// ---------------------------------------------------------------------------

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const createReportSchema = z.object({
  companyId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
});

const updateReportSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isPublic: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/account-reports — Generate a report
// ---------------------------------------------------------------------------

router.post(
  '/',
  validate(createReportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { companyId, title: customTitle } = req.body;

      // Fetch company with score, contacts, and recent signals
      const company = await prisma.company.findFirst({
        where: {
          id: companyId,
          organizationId: req.organizationId!,
        },
        include: {
          score: true,
          contacts: {
            take: 20,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              title: true,
              linkedIn: true,
              github: true,
            },
          },
          signals: {
            take: 50,
            orderBy: { timestamp: 'desc' },
            select: {
              id: true,
              type: true,
              metadata: true,
              timestamp: true,
            },
          },
          tags: {
            include: {
              tag: { select: { id: true, name: true, color: true } },
            },
          },
        },
      });

      if (!company) {
        throw new AppError('Company not found', 404);
      }

      // Build the content snapshot
      const content = {
        company: {
          id: company.id,
          name: company.name,
          domain: company.domain,
          industry: company.industry,
          size: company.size,
          logo: company.logo,
          website: company.website,
          description: company.description,
          linkedIn: company.linkedIn,
          twitter: company.twitter,
          githubOrg: company.githubOrg,
          city: company.city,
          state: company.state,
          country: company.country,
        },
        score: company.score
          ? {
              score: company.score.score,
              tier: company.score.tier,
              factors: company.score.factors,
              signalCount: company.score.signalCount,
              userCount: company.score.userCount,
              trend: company.score.trend,
              lastSignalAt: company.score.lastSignalAt,
            }
          : null,
        contacts: company.contacts,
        signals: company.signals,
        tags: company.tags.map((ct) => ct.tag),
        generatedAt: new Date().toISOString(),
      };

      const title = customTitle || `Account Report: ${company.name}`;

      const report = await prisma.accountReport.create({
        data: {
          organizationId: req.organizationId!,
          companyId,
          createdById: req.user!.id,
          title,
          content: content as unknown as Prisma.InputJsonValue,
        },
        include: {
          company: {
            select: { id: true, name: true, domain: true, logo: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      logger.info('Account report created', {
        reportId: report.id,
        companyId,
        orgId: req.organizationId,
      });

      res.status(201).json({ report });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/v1/account-reports — List reports for org
// ---------------------------------------------------------------------------

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reports = await prisma.accountReport.findMany({
      where: { organizationId: req.organizationId! },
      orderBy: { createdAt: 'desc' },
      include: {
        company: {
          select: { id: true, name: true, domain: true, logo: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.json({ reports });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/account-reports/:id — Get report detail
// ---------------------------------------------------------------------------

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const report = await prisma.accountReport.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organizationId!,
      },
      include: {
        company: {
          select: { id: true, name: true, domain: true, logo: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!report) {
      throw new AppError('Report not found', 404);
    }

    res.json({ report });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/v1/account-reports/:id — Update report
// ---------------------------------------------------------------------------

router.put(
  '/:id',
  validate(updateReportSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.accountReport.findFirst({
        where: {
          id: req.params.id,
          organizationId: req.organizationId!,
        },
      });

      if (!existing) {
        throw new AppError('Report not found', 404);
      }

      const updateData: Record<string, unknown> = {};
      if (req.body.title !== undefined) updateData.title = req.body.title;
      if (req.body.isPublic !== undefined) updateData.isPublic = req.body.isPublic;
      if (req.body.expiresAt !== undefined) {
        updateData.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      }

      const report = await prisma.accountReport.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          company: {
            select: { id: true, name: true, domain: true, logo: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });

      logger.info('Account report updated', {
        reportId: report.id,
        orgId: req.organizationId,
      });

      res.json({ report });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/account-reports/:id — Delete report
// ---------------------------------------------------------------------------

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.accountReport.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.organizationId!,
      },
    });

    if (!existing) {
      throw new AppError('Report not found', 404);
    }

    await prisma.accountReport.delete({
      where: { id: req.params.id },
    });

    logger.info('Account report deleted', {
      reportId: req.params.id,
      orgId: req.organizationId,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
