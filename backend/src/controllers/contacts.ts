import { Request, Response, NextFunction } from 'express';
import { Prisma, DealStage } from '@prisma/client';
import * as contactService from '../services/contacts';
import { findDuplicates, mergeContacts } from '../services/identity-resolution';
import { enqueueWorkflowExecution } from '../jobs/producers';
import { notifyOrgUsers } from '../services/notifications';
import { sendSignupAlert } from '../services/slack-notifications';
import { logAudit } from '../services/audit';
import { fireContactCreated, fireContactUpdated } from '../services/webhook-events';
import { logger } from '../utils/logger';
import { parsePageInt } from '../utils/pagination';
import { prisma } from '../config/database';

// Valid DealStage values for bulk update_stage validation
const VALID_DEAL_STAGES: string[] = Object.values(DealStage);

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
 * GET /contacts/export
 * Streams a CSV of contacts filtered by the same params as the list endpoint.
 */
export const exportContacts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const search = req.query.search as string | undefined;
    const companyId = req.query.companyId as string | undefined;
    const sortField = (req.query.sortField as string) || 'createdAt';
    const sortDirection = (req.query.sortDirection as string) || 'desc';

    const where: Prisma.ContactWhereInput = {
      organizationId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(companyId ? { companyId } : {}),
    };

    // Build orderBy from query params
    const allowedSortFields = ['createdAt', 'firstName', 'lastName', 'email', 'title'];
    const orderField = allowedSortFields.includes(sortField) ? sortField : 'createdAt';
    const orderDir = sortDirection === 'asc' ? 'asc' : 'desc';

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        company: {
          select: { name: true, score: { select: { score: true, tier: true } } },
        },
        tags: {
          include: { tag: { select: { name: true } } },
        },
        _count: {
          select: { signals: true },
        },
      },
      orderBy: { [orderField]: orderDir },
      take: 10_000,
    });

    const header = 'Name,Email,Company,Title,PQA Score,Signal Count,Last Signal Date,Created Date,Tags';
    const rows = contacts.map((c) => {
      const name = `${c.firstName} ${c.lastName}`;
      const companyName = c.company?.name ?? '';
      const pqaScore = c.company?.score?.score ?? '';
      const signalCount = c._count.signals;
      const tagNames = c.tags.map((t) => t.tag.name).join('; ');
      return [
        escapeCsvField(name),
        escapeCsvField(c.email),
        escapeCsvField(companyName),
        escapeCsvField(c.title),
        escapeCsvField(pqaScore),
        escapeCsvField(signalCount),
        escapeCsvField(''), // last signal date populated below
        escapeCsvField(c.createdAt.toISOString().slice(0, 10)),
        escapeCsvField(tagNames),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    logger.info(`Exported ${contacts.length} contacts as CSV`, { organizationId });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=contacts-export-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /contacts/duplicates
 * Returns groups of potential duplicate contacts, matched by email or shared identities.
 */
export const getDuplicates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const groups = await findDuplicates(organizationId);
    res.json({ groups });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /contacts/:id/merge
 * Merges one or more source contacts into the target (primary) contact.
 * Body: { duplicateIds: string[] }
 */
export const mergeContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const organizationId = req.organizationId!;
    const { duplicateIds } = req.body as { duplicateIds: string[] };

    if (!Array.isArray(duplicateIds) || duplicateIds.length === 0) {
      res.status(400).json({ error: 'duplicateIds must be a non-empty array' });
      return;
    }

    const result = await mergeContacts(organizationId, id, duplicateIds);

    // Audit log (fire-and-forget)
    logAudit({
      organizationId,
      userId: req.user?.id,
      action: 'merge',
      entityType: 'contact',
      entityId: id,
      entityName: `Merged ${result.merged} contact(s) into ${id}`,
      metadata: { duplicateIds, merged: result.merged, errors: result.errors } as unknown as Record<string, unknown>,
    }).catch(() => {});

    logger.info(`Contact merge: ${result.merged} merged into ${id}`, { organizationId });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Bulk Actions
// ---------------------------------------------------------------------------

interface BulkActionBody {
  contactIds: string[];
  action: string;
  params: Record<string, unknown>;
}

function escapeCsvFieldBulk(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * POST /contacts/bulk-action
 * Perform a bulk action on a set of contacts by their IDs.
 * Supported actions: add_tag, remove_tag, update_stage, assign_owner, export
 */
export const bulkAction = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { contactIds, action, params } = req.body as BulkActionBody;

    // Validate required fields
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: 'contactIds must be a non-empty array' });
      return;
    }
    if (!action) {
      res.status(400).json({ error: 'action is required' });
      return;
    }

    // Verify all contacts belong to this organization
    const validContacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, organizationId },
      select: { id: true },
    });
    const validIds = validContacts.map((c) => c.id);

    if (validIds.length === 0) {
      res.status(404).json({ error: 'No valid contacts found for the given IDs' });
      return;
    }

    switch (action) {
      case 'add_tag': {
        const tagName = params?.tag as string;
        if (!tagName || typeof tagName !== 'string') {
          res.status(400).json({ error: 'params.tag is required for add_tag action' });
          return;
        }

        // Find or create the tag
        const tag = await prisma.tag.upsert({
          where: { organizationId_name: { organizationId, name: tagName.trim() } },
          create: { organizationId, name: tagName.trim() },
          update: {},
        });

        // Add tag to all contacts (skip existing via skipDuplicates)
        const created = await prisma.contactTag.createMany({
          data: validIds.map((contactId) => ({ contactId, tagId: tag.id })),
          skipDuplicates: true,
        });

        logAudit({
          organizationId,
          userId: req.user?.id,
          action: 'bulk_add_tag',
          entityType: 'contact',
          metadata: { contactCount: validIds.length, tag: tagName },
        }).catch(() => {});

        logger.info(`Bulk add_tag: ${created.count} contacts tagged with "${tagName}"`, { organizationId });
        res.json({ success: true, affected: created.count, action: 'add_tag' });
        return;
      }

      case 'remove_tag': {
        const tagName = params?.tag as string;
        if (!tagName || typeof tagName !== 'string') {
          res.status(400).json({ error: 'params.tag is required for remove_tag action' });
          return;
        }

        // Find the tag
        const tag = await prisma.tag.findUnique({
          where: { organizationId_name: { organizationId, name: tagName.trim() } },
        });

        if (!tag) {
          res.json({ success: true, affected: 0, action: 'remove_tag' });
          return;
        }

        const deleted = await prisma.contactTag.deleteMany({
          where: { contactId: { in: validIds }, tagId: tag.id },
        });

        logAudit({
          organizationId,
          userId: req.user?.id,
          action: 'bulk_remove_tag',
          entityType: 'contact',
          metadata: { contactCount: validIds.length, tag: tagName },
        }).catch(() => {});

        logger.info(`Bulk remove_tag: ${deleted.count} tag links removed for "${tagName}"`, { organizationId });
        res.json({ success: true, affected: deleted.count, action: 'remove_tag' });
        return;
      }

      case 'update_stage': {
        const stage = params?.stage as string;
        if (!stage || typeof stage !== 'string') {
          res.status(400).json({ error: 'params.stage is required for update_stage action' });
          return;
        }

        if (!VALID_DEAL_STAGES.includes(stage)) {
          res.status(400).json({ error: `Invalid stage. Must be one of: ${VALID_DEAL_STAGES.join(', ')}` });
          return;
        }

        // Update all deals associated with these contacts
        const updated = await prisma.deal.updateMany({
          where: { contactId: { in: validIds }, organizationId },
          data: { stage: stage as DealStage },
        });

        logAudit({
          organizationId,
          userId: req.user?.id,
          action: 'bulk_update_stage',
          entityType: 'deal',
          metadata: { contactCount: validIds.length, stage },
        }).catch(() => {});

        logger.info(`Bulk update_stage: ${updated.count} deals updated to "${stage}"`, { organizationId });
        res.json({ success: true, affected: updated.count, action: 'update_stage' });
        return;
      }

      case 'assign_owner': {
        const ownerId = params?.ownerId as string;
        if (!ownerId || typeof ownerId !== 'string') {
          res.status(400).json({ error: 'params.ownerId is required for assign_owner action' });
          return;
        }

        // Verify the owner belongs to this organization
        const membership = await prisma.userOrganization.findFirst({
          where: { userId: ownerId, organizationId },
        });

        if (!membership) {
          res.status(400).json({ error: 'Owner must be a member of this organization' });
          return;
        }

        // Assign owner on deals linked to the selected contacts
        const updated = await prisma.deal.updateMany({
          where: { contactId: { in: validIds }, organizationId },
          data: { ownerId },
        });

        logAudit({
          organizationId,
          userId: req.user?.id,
          action: 'bulk_assign_owner',
          entityType: 'deal',
          metadata: { contactCount: validIds.length, ownerId },
        }).catch(() => {});

        logger.info(`Bulk assign_owner: ${updated.count} deals assigned to owner ${ownerId}`, { organizationId });
        res.json({ success: true, affected: updated.count, action: 'assign_owner' });
        return;
      }

      case 'export': {
        const contacts = await prisma.contact.findMany({
          where: { id: { in: validIds }, organizationId },
          include: {
            company: { select: { name: true, score: { select: { score: true, tier: true } } } },
            tags: { include: { tag: { select: { name: true } } } },
            _count: { select: { signals: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        const header = 'Name,Email,Company,Title,PQA Score,Signal Count,Created Date,Tags';
        const rows = contacts.map((c) => {
          const name = `${c.firstName} ${c.lastName}`;
          const companyName = c.company?.name ?? '';
          const pqaScore = c.company?.score?.score ?? '';
          const signalCount = c._count.signals;
          const tagNames = c.tags.map((t) => t.tag.name).join('; ');
          return [
            escapeCsvFieldBulk(name),
            escapeCsvFieldBulk(c.email),
            escapeCsvFieldBulk(companyName),
            escapeCsvFieldBulk(c.title),
            escapeCsvFieldBulk(pqaScore),
            escapeCsvFieldBulk(signalCount),
            escapeCsvFieldBulk(c.createdAt.toISOString().slice(0, 10)),
            escapeCsvFieldBulk(tagNames),
          ].join(',');
        });

        const csv = [header, ...rows].join('\n');

        logAudit({
          organizationId,
          userId: req.user?.id,
          action: 'bulk_export',
          entityType: 'contact',
          metadata: { contactCount: contacts.length },
        }).catch(() => {});

        logger.info(`Bulk export: ${contacts.length} contacts exported as CSV`, { organizationId });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=contacts-bulk-export-${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(csv);
        return;
      }

      default:
        res.status(400).json({ error: `Unknown action: ${action}. Supported: add_tag, remove_tag, update_stage, assign_owner, export` });
        return;
    }
  } catch (error) {
    next(error);
  }
};
