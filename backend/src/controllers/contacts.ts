import { Request, Response, NextFunction } from 'express';
import * as contactService from '../services/contacts';
import { processEvent } from '../services/workflows';
import { notifyOrgUsers } from '../services/notifications';
import { logAudit } from '../services/audit';
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

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'create',
      entityType: 'contact',
      entityId: contact.id,
      entityName: `${contact.firstName} ${contact.lastName}`,
    }).catch(() => {});

    // Trigger workflow automations (fire-and-forget)
    processEvent(organizationId, 'contact_created', {
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      companyId: contact.companyId,
    }).catch((err) => logger.error('Workflow processing error:', err));

    // Notify org users (fire-and-forget)
    notifyOrgUsers(organizationId, {
      type: 'contact_created',
      title: `New contact: ${contact.firstName} ${contact.lastName}`,
      body: contact.email || undefined,
      entityType: 'contact',
      entityId: contact.id,
      excludeUserId: req.user?.id,
    }).catch((err) => logger.error('Notification error:', err));

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

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'update',
      entityType: 'contact',
      entityId: contact.id,
      entityName: `${contact.firstName} ${contact.lastName}`,
    }).catch(() => {});

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

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'delete',
      entityType: 'contact',
      entityId: id,
    }).catch(() => {});

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
