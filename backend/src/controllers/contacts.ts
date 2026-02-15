import { Request, Response, NextFunction } from 'express';
import * as contactService from '../services/contacts';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { notifyOrgUsers } from '../services/notifications';
import { sendSignupAlert } from '../services/slack-notifications';
import { logAudit } from '../services/audit';
import { fireContactCreated, fireContactUpdated } from '../services/webhook-events';
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

    // Enqueue workflow processing via BullMQ (async with retries)
    enqueueWorkflowExecution(organizationId, 'contact_created', {
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      companyId: contact.companyId,
    }).catch((err) => logger.error('Workflow enqueue error:', err));

    // Notify org users (fire-and-forget)
    notifyOrgUsers(organizationId, {
      type: 'contact_created',
      title: `New contact: ${contact.firstName} ${contact.lastName}`,
      body: contact.email || undefined,
      entityType: 'contact',
      entityId: contact.id,
      excludeUserId: req.user?.id,
    }).catch((err) => logger.error('Notification error:', err));

    // Rich Slack signup alert (fire-and-forget)
    sendSignupAlert(organizationId, contact.id)
      .catch((err) => logger.error('Slack signup alert failed', { err }));

    // Webhook event to Zapier/Make subscribers (fire-and-forget)
    fireContactCreated(organizationId, contact as unknown as Record<string, unknown>)
      .catch((err) => logger.error('Webhook fire error (contact.created):', err));

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

    // Webhook event to Zapier/Make subscribers (fire-and-forget)
    fireContactUpdated(organizationId, contact as unknown as Record<string, unknown>)
      .catch((err) => logger.error('Webhook fire error (contact.updated):', err));

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
