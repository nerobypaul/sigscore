import { Request, Response, NextFunction } from 'express';
import * as companyService from '../services/companies';
import { logAudit } from '../services/audit';
import { fireCompanyCreated } from '../services/webhook-events';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';

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
