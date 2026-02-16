import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import * as companyService from '../services/companies';
import { logAudit } from '../services/audit';
import { fireCompanyCreated } from '../services/webhook-events';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';
import { prisma } from '../config/database';

export const getCompanies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const filters = {
      search: req.query.search as string,
      industry: req.query.industry as string,
      page: parsePageInt(req.query.page),
      limit: parsePageInt(req.query.limit),
    };

    const result = await companyService.getCompanies(organizationId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const company = await companyService.getCompanyById(id, organizationId);
    if (!company) {
      res.status(404).json({ error: 'Company not found' });
      return;
    }

    res.json(company);
  } catch (error) {
    next(error);
  }
};

export const createCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const company = await companyService.createCompany(organizationId, req.body);
    logger.info(`Company created: ${company.id}`);

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'create',
      entityType: 'company',
      entityId: company.id,
      entityName: company.name,
    }).catch(() => {});

    // Webhook event to Zapier/Make subscribers (fire-and-forget)
    fireCompanyCreated(organizationId, company as unknown as Record<string, unknown>)
      .catch((err) => logger.error('Webhook fire error (company.created):', err));

    res.status(201).json(company);
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const company = await companyService.updateCompany(id, organizationId, req.body);
    logger.info(`Company updated: ${company.id}`);

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'update',
      entityType: 'company',
      entityId: company.id,
      entityName: company.name,
    }).catch(() => {});

    res.json(company);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// CSV Export helpers
// ---------------------------------------------------------------------------

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /companies/export
 * Streams a CSV of companies filtered by the same params as the list endpoint.
 */
export const exportCompanies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const search = req.query.search as string | undefined;
    const industry = req.query.industry as string | undefined;
    const sortField = (req.query.sortField as string) || 'createdAt';
    const sortDirection = (req.query.sortDirection as string) || 'desc';

    const where: Prisma.CompanyWhereInput = {
      organizationId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { domain: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(industry ? { industry } : {}),
    };

    // Build orderBy from query params
    const allowedSortFields = ['createdAt', 'name', 'domain', 'industry'];
    const orderField = allowedSortFields.includes(sortField) ? sortField : 'createdAt';
    const orderDir = sortDirection === 'asc' ? 'asc' : 'desc';

    const companies = await prisma.company.findMany({
      where,
      include: {
        score: {
          select: { score: true, tier: true, signalCount: true, lastSignalAt: true },
        },
        _count: {
          select: { contacts: true, signals: true },
        },
        tags: {
          include: { tag: { select: { name: true } } },
        },
      },
      orderBy: { [orderField]: orderDir },
      take: 10_000,
    });

    const header = 'Name,Domain,PQA Score,Contact Count,Signal Count,Tier,Industry,Last Signal Date,Created Date,Tags';
    const rows = companies.map((c) => {
      const pqaScore = c.score?.score ?? '';
      const tier = c.score?.tier ?? '';
      const signalCount = c.score?.signalCount ?? c._count.signals;
      const lastSignalAt = c.score?.lastSignalAt
        ? c.score.lastSignalAt.toISOString().slice(0, 10)
        : '';
      const tagNames = c.tags.map((t) => t.tag.name).join('; ');
      return [
        escapeCsvField(c.name),
        escapeCsvField(c.domain),
        escapeCsvField(pqaScore),
        escapeCsvField(c._count.contacts),
        escapeCsvField(signalCount),
        escapeCsvField(tier),
        escapeCsvField(c.industry),
        escapeCsvField(lastSignalAt),
        escapeCsvField(c.createdAt.toISOString().slice(0, 10)),
        escapeCsvField(tagNames),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    logger.info(`Exported ${companies.length} companies as CSV`, { organizationId });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=companies-export-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

export const deleteCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    await companyService.deleteCompany(id, organizationId);
    logger.info(`Company deleted: ${id}`);

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'delete',
      entityType: 'company',
      entityId: id,
    }).catch(() => {});

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
