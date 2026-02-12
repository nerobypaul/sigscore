import { Request, Response, NextFunction } from 'express';
import { importContacts, importCompanies } from '../services/csv-import';
import { logger } from '../utils/logger';

/**
 * POST /api/v1/import/contacts
 *
 * Accepts CSV content in two ways:
 * 1. Raw text body with Content-Type: text/csv
 * 2. JSON body with { csv: "...csv content..." }
 */
export const importContactsHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const csvContent = extractCSVContent(req);
    if (!csvContent) {
      res.status(400).json({
        error: 'No CSV content provided. Send raw text/csv body or JSON with { "csv": "..." }',
      });
      return;
    }

    logger.info(`Starting contact CSV import for org ${organizationId}`);
    const result = await importContacts(organizationId, csvContent);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/import/companies
 *
 * Accepts CSV content in two ways:
 * 1. Raw text body with Content-Type: text/csv
 * 2. JSON body with { csv: "...csv content..." }
 */
export const importCompaniesHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const csvContent = extractCSVContent(req);
    if (!csvContent) {
      res.status(400).json({
        error: 'No CSV content provided. Send raw text/csv body or JSON with { "csv": "..." }',
      });
      return;
    }

    logger.info(`Starting company CSV import for org ${organizationId}`);
    const result = await importCompanies(organizationId, csvContent);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Extract CSV string from the request. Supports:
 * - text/csv raw body (parsed as string by the raw text middleware)
 * - JSON body with a "csv" field
 */
function extractCSVContent(req: Request): string | null {
  // If the body is a string (text/csv raw body middleware parsed it)
  if (typeof req.body === 'string' && req.body.length > 0) {
    return req.body;
  }

  // If JSON body with a csv field
  if (req.body && typeof req.body.csv === 'string' && req.body.csv.length > 0) {
    return req.body.csv;
  }

  return null;
}
