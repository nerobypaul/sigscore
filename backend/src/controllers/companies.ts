import { Request, Response, NextFunction } from 'express';
import * as companyService from '../services/companies';
import { logger } from '../utils/logger';

export const getCompanies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const filters = {
      search: req.query.search as string,
      industry: req.query.industry as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
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

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
