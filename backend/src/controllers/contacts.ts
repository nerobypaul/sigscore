import { Request, Response, NextFunction } from 'express';
import * as contactService from '../services/contacts';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';

export const getContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const filters = {
      search: req.query.search as string,
      companyId: req.query.companyId as string,
      page: parsePageInt(req.query.page),
      limit: parsePageInt(req.query.limit),
    };

    const result = await contactService.getContacts(organizationId, filters);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const contact = await contactService.getContactById(id, organizationId);
    if (!contact) {
      res.status(404).json({ error: 'Contact not found' });
      return;
    }

    res.json(contact);
  } catch (error) {
    next(error);
  }
};

export const createContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const contact = await contactService.createContact(organizationId, req.body);
    logger.info(`Contact created: ${contact.id}`);

    res.status(201).json(contact);
  } catch (error) {
    next(error);
  }
};

export const updateContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    const contact = await contactService.updateContact(id, organizationId, req.body);
    logger.info(`Contact updated: ${contact.id}`);

    res.json(contact);
  } catch (error) {
    next(error);
  }
};

export const deleteContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;

    await contactService.deleteContact(id, organizationId);
    logger.info(`Contact deleted: ${id}`);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
