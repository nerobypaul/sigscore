import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

const router = Router();

// All bulk routes require authentication + organization + ADMIN role
router.use(authenticate);
router.use(requireOrganization);
router.use(requireOrgRole('ADMIN'));

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(500),
});

const bulkTagSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(500),
  tagName: z.string().min(1).max(100),
  tagColor: z.string().max(20).optional(),
});

const bulkExportSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).optional(),
  filters: z
    .object({
      search: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Helper: escape a CSV field value
// ---------------------------------------------------------------------------

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Wrap in quotes if the field contains a comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ---------------------------------------------------------------------------
// POST /bulk/contacts/delete — Bulk delete contacts
// ---------------------------------------------------------------------------

router.post(
  '/contacts/delete',
  validate(bulkDeleteSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { ids } = req.body as z.infer<typeof bulkDeleteSchema>;

      const result = await prisma.contact.deleteMany({
        where: {
          id: { in: ids },
          organizationId,
        },
      });

      logger.info(`Bulk deleted ${result.count} contacts`, { organizationId, count: result.count });
      res.json({ deleted: result.count });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /bulk/contacts/tag — Bulk add tag to contacts
// ---------------------------------------------------------------------------

router.post(
  '/contacts/tag',
  validate(bulkTagSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { ids, tagName, tagColor } = req.body as z.infer<typeof bulkTagSchema>;

      // Upsert the tag (unique on [organizationId, name])
      const tag = await prisma.tag.upsert({
        where: {
          organizationId_name: {
            organizationId,
            name: tagName,
          },
        },
        update: tagColor !== undefined ? { color: tagColor } : {},
        create: {
          organizationId,
          name: tagName,
          color: tagColor ?? null,
        },
      });

      // Filter to only contacts that belong to this org
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: ids },
          organizationId,
        },
        select: { id: true },
      });

      const contactIds = contacts.map((c) => c.id);

      if (contactIds.length > 0) {
        // Create ContactTag entries, skipping duplicates
        await prisma.contactTag.createMany({
          data: contactIds.map((contactId) => ({
            contactId,
            tagId: tag.id,
          })),
          skipDuplicates: true,
        });
      }

      logger.info(`Bulk tagged ${contactIds.length} contacts with "${tagName}"`, {
        organizationId,
        tagId: tag.id,
        count: contactIds.length,
      });

      res.json({ tagged: contactIds.length });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /bulk/contacts/export — Export contacts as CSV
// ---------------------------------------------------------------------------

router.post(
  '/contacts/export',
  validate(bulkExportSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { ids, filters } = req.body as z.infer<typeof bulkExportSchema>;

      const where: Prisma.ContactWhereInput = {
        organizationId,
        ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
        ...(filters?.search
          ? {
              OR: [
                { firstName: { contains: filters.search, mode: 'insensitive' as const } },
                { lastName: { contains: filters.search, mode: 'insensitive' as const } },
                { email: { contains: filters.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };

      const contacts = await prisma.contact.findMany({
        where,
        include: {
          company: {
            select: { name: true, score: { select: { score: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10_000, // safety cap
      });

      // Build CSV
      const header = 'firstName,lastName,email,phone,title,company,pqaScore,createdAt';
      const rows = contacts.map((c) => {
        const companyName = c.company?.name ?? '';
        const pqaScore = c.company?.score?.score ?? '';
        return [
          escapeCsvField(c.firstName),
          escapeCsvField(c.lastName),
          escapeCsvField(c.email),
          escapeCsvField(c.phone),
          escapeCsvField(c.title),
          escapeCsvField(companyName),
          escapeCsvField(pqaScore),
          escapeCsvField(c.createdAt.toISOString()),
        ].join(',');
      });

      const csv = [header, ...rows].join('\n');

      logger.info(`Exported ${contacts.length} contacts as CSV`, { organizationId });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=contacts-export.csv');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /bulk/companies/delete — Bulk delete companies
// ---------------------------------------------------------------------------

router.post(
  '/companies/delete',
  validate(bulkDeleteSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { ids } = req.body as z.infer<typeof bulkDeleteSchema>;

      const result = await prisma.company.deleteMany({
        where: {
          id: { in: ids },
          organizationId,
        },
      });

      logger.info(`Bulk deleted ${result.count} companies`, { organizationId, count: result.count });
      res.json({ deleted: result.count });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /bulk/deals/delete — Bulk delete deals
// ---------------------------------------------------------------------------

router.post(
  '/deals/delete',
  validate(bulkDeleteSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { ids } = req.body as z.infer<typeof bulkDeleteSchema>;

      const result = await prisma.deal.deleteMany({
        where: {
          id: { in: ids },
          organizationId,
        },
      });

      logger.info(`Bulk deleted ${result.count} deals`, { organizationId, count: result.count });
      res.json({ deleted: result.count });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
