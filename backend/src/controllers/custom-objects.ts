import { Request, Response, NextFunction } from 'express';
import * as customObjectService from '../services/custom-objects';
import {
  SchemaNotFoundError,
  SchemaConflictError,
  RecordValidationError,
} from '../services/custom-objects';
import { logger } from '../utils/logger';

// ============================================================
// Schema Handlers
// ============================================================

export const getSchemas = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const schemas = await customObjectService.getSchemas(organizationId);
    res.json({ schemas });
  } catch (error) {
    next(error);
  }
};

export const getSchema = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug } = req.params;

    const schema = await customObjectService.getSchemaBySlug(organizationId, slug);
    if (!schema) {
      res.status(404).json({ error: 'Custom object schema not found' });
      return;
    }

    res.json(schema);
  } catch (error) {
    next(error);
  }
};

export const createSchema = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const schema = await customObjectService.createSchema(organizationId, req.body);
    logger.info(`Custom object schema created: ${schema.id}`);
    res.status(201).json(schema);
  } catch (error) {
    if (error instanceof SchemaConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const updateSchema = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug } = req.params;

    const schema = await customObjectService.updateSchema(organizationId, slug, req.body);
    if (!schema) {
      res.status(404).json({ error: 'Custom object schema not found' });
      return;
    }

    logger.info(`Custom object schema updated: ${schema.id}`);
    res.json(schema);
  } catch (error) {
    next(error);
  }
};

export const deleteSchema = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug } = req.params;

    const schema = await customObjectService.deleteSchema(organizationId, slug);
    if (!schema) {
      res.status(404).json({ error: 'Custom object schema not found' });
      return;
    }

    logger.info(`Custom object schema deleted: ${schema.id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Record Handlers
// ============================================================

export const getRecords = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug } = req.params;

    const { page, limit, ...fieldFilters } = req.query;

    const filters: customObjectService.RecordFilters = {
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      ...fieldFilters,
    };

    const result = await customObjectService.getRecords(organizationId, slug, filters);
    res.json(result);
  } catch (error) {
    if (error instanceof SchemaNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const getRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug, id } = req.params;

    const record = await customObjectService.getRecordById(organizationId, slug, id);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    res.json(record);
  } catch (error) {
    if (error instanceof SchemaNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const createRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug } = req.params;

    const record = await customObjectService.createRecord(organizationId, slug, req.body);
    logger.info(`Custom object record created: ${record.id}`);
    res.status(201).json(record);
  } catch (error) {
    if (error instanceof SchemaNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof RecordValidationError) {
      res.status(400).json({ error: error.message, details: error.details });
      return;
    }
    next(error);
  }
};

export const updateRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug, id } = req.params;

    const record = await customObjectService.updateRecord(organizationId, slug, id, req.body);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    logger.info(`Custom object record updated: ${record.id}`);
    res.json(record);
  } catch (error) {
    if (error instanceof SchemaNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof RecordValidationError) {
      res.status(400).json({ error: error.message, details: error.details });
      return;
    }
    next(error);
  }
};

export const deleteRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { slug, id } = req.params;

    const record = await customObjectService.deleteRecord(organizationId, slug, id);
    if (!record) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    logger.info(`Custom object record deleted: ${record.id}`);
    res.status(204).send();
  } catch (error) {
    if (error instanceof SchemaNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};
