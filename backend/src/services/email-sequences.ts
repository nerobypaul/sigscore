import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { enqueueEmailSend } from '../jobs/producers';
import { sendEmail } from './email-sender';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSequenceData {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface UpdateSequenceData {
  name?: string;
  description?: string;
  status?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown>;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface CreateStepData {
  subject: string;
  body: string;
  delayDays?: number;
  delayHours?: number;
}

export interface UpdateStepData {
  subject?: string;
  body?: string;
  delayDays?: number;
  delayHours?: number;
}

// ---------------------------------------------------------------------------
// Template variable rendering
// ---------------------------------------------------------------------------

const TEMPLATE_VARIABLES: Record<string, (contact: Record<string, unknown>) => string> = {
  firstName: (c) => String(c.firstName ?? ''),
  lastName: (c) => String(c.lastName ?? ''),
  email: (c) => String(c.email ?? ''),
  company: (c) => {
    const company = c.company as Record<string, unknown> | null;
    return company ? String(company.name ?? '') : '';
  },
  title: (c) => String(c.title ?? ''),
  signalCount: (c) => String(c._signalCount ?? '0'),
  pqaScore: (c) => String(c._pqaScore ?? '0'),
};

/**
 * Render template variables in a string, replacing {{variable}} tokens.
 * Sanitizes output to prevent XSS by escaping HTML special chars.
 */
export function renderTemplate(
  template: string,
  contact: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, variable: string) => {
    const resolver = TEMPLATE_VARIABLES[variable];
    if (!resolver) return `{{${variable}}}`;
    const value = resolver(contact);
    // Sanitize to prevent XSS
    return escapeHtml(value);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Sequence CRUD
// ---------------------------------------------------------------------------

export async function createSequence(
  organizationId: string,
  data: CreateSequenceData,
  userId: string,
) {
  const sequence = await prisma.emailSequence.create({
    data: {
      name: data.name,
      description: data.description,
      triggerType: data.triggerType,
      triggerConfig: (data.triggerConfig ?? {}) as unknown as Prisma.InputJsonValue,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
      replyTo: data.replyTo,
      createdById: userId,
      organization: { connect: { id: organizationId } },
    },
    include: { steps: true, _count: { select: { enrollments: true } } },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'create',
      entityType: 'email_sequence',
      entityId: sequence.id,
      entityName: sequence.name,
    },
  });

  logger.info(`Email sequence created: ${sequence.id}`, { organizationId });
  return sequence;
}

export async function getSequences(
  organizationId: string,
  filters?: { status?: string; page?: number; limit?: number },
) {
  const page = filters?.page ?? 1;
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.EmailSequenceWhereInput = {
    organizationId,
    status: { not: 'archived' },
    ...(filters?.status && { status: filters.status }),
  };

  const [sequences, total] = await Promise.all([
    prisma.emailSequence.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        _count: { select: { enrollments: true } },
      },
    }),
    prisma.emailSequence.count({ where }),
  ]);

  // Get aggregate stats for each sequence
  const sequencesWithStats = await Promise.all(
    sequences.map(async (seq) => {
      const stats = await getSequenceStats(seq.id);
      return { ...seq, stats };
    }),
  );

  return {
    sequences: sequencesWithStats,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getSequence(organizationId: string, sequenceId: string) {
  const sequence = await prisma.emailSequence.findFirst({
    where: { id: sequenceId, organizationId },
    include: {
      steps: { orderBy: { stepNumber: 'asc' } },
      _count: { select: { enrollments: true } },
    },
  });

  if (!sequence) {
    throw new AppError('Email sequence not found', 404);
  }

  const stats = await getSequenceStats(sequenceId);
  return { ...sequence, stats };
}

export async function updateSequence(
  organizationId: string,
  sequenceId: string,
  data: UpdateSequenceData,
  userId?: string,
) {
  const existing = await prisma.emailSequence.findFirst({
    where: { id: sequenceId, organizationId },
  });
  if (!existing) {
    throw new AppError('Email sequence not found', 404);
  }

  const sequence = await prisma.emailSequence.update({
    where: { id: sequenceId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.triggerType !== undefined && { triggerType: data.triggerType }),
      ...(data.triggerConfig !== undefined && {
        triggerConfig: data.triggerConfig as unknown as Prisma.InputJsonValue,
      }),
      ...(data.fromName !== undefined && { fromName: data.fromName }),
      ...(data.fromEmail !== undefined && { fromEmail: data.fromEmail }),
      ...(data.replyTo !== undefined && { replyTo: data.replyTo }),
    },
    include: { steps: { orderBy: { stepNumber: 'asc' } }, _count: { select: { enrollments: true } } },
  });

  // Audit log
  if (userId) {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'update',
        entityType: 'email_sequence',
        entityId: sequenceId,
        entityName: sequence.name,
        changes: data as unknown as Prisma.InputJsonValue,
      },
    });
  }

  logger.info(`Email sequence updated: ${sequenceId}`, { organizationId });
  return sequence;
}

export async function deleteSequence(
  organizationId: string,
  sequenceId: string,
  userId?: string,
) {
  const existing = await prisma.emailSequence.findFirst({
    where: { id: sequenceId, organizationId },
  });
  if (!existing) {
    throw new AppError('Email sequence not found', 404);
  }

  // Soft delete by archiving
  await prisma.emailSequence.update({
    where: { id: sequenceId },
    data: { status: 'archived' },
  });

  if (userId) {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'delete',
        entityType: 'email_sequence',
        entityId: sequenceId,
        entityName: existing.name,
      },
    });
  }

  logger.info(`Email sequence archived: ${sequenceId}`, { organizationId });
}

// ---------------------------------------------------------------------------
// Step management
// ---------------------------------------------------------------------------

export async function addStep(sequenceId: string, data: CreateStepData) {
  // Determine next step number
  const lastStep = await prisma.emailSequenceStep.findFirst({
    where: { sequenceId },
    orderBy: { stepNumber: 'desc' },
  });
  const nextStepNumber = (lastStep?.stepNumber ?? 0) + 1;

  return prisma.emailSequenceStep.create({
    data: {
      sequenceId,
      stepNumber: nextStepNumber,
      subject: data.subject,
      body: data.body,
      delayDays: data.delayDays ?? 1,
      delayHours: data.delayHours ?? 0,
    },
  });
}

export async function updateStep(stepId: string, data: UpdateStepData) {
  const existing = await prisma.emailSequenceStep.findUnique({ where: { id: stepId } });
  if (!existing) {
    throw new AppError('Email sequence step not found', 404);
  }

  return prisma.emailSequenceStep.update({
    where: { id: stepId },
    data: {
      ...(data.subject !== undefined && { subject: data.subject }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.delayDays !== undefined && { delayDays: data.delayDays }),
      ...(data.delayHours !== undefined && { delayHours: data.delayHours }),
    },
  });
}

export async function deleteStep(stepId: string) {
  const existing = await prisma.emailSequenceStep.findUnique({
    where: { id: stepId },
    include: { sequence: true },
  });
  if (!existing) {
    throw new AppError('Email sequence step not found', 404);
  }

  await prisma.emailSequenceStep.delete({ where: { id: stepId } });

  // Re-number remaining steps
  const remainingSteps = await prisma.emailSequenceStep.findMany({
    where: { sequenceId: existing.sequenceId },
    orderBy: { stepNumber: 'asc' },
  });

  for (let i = 0; i < remainingSteps.length; i++) {
    if (remainingSteps[i].stepNumber !== i + 1) {
      await prisma.emailSequenceStep.update({
        where: { id: remainingSteps[i].id },
        data: { stepNumber: i + 1 },
      });
    }
  }
}

export async function reorderSteps(sequenceId: string, stepIds: string[]) {
  // Validate that all step IDs belong to this sequence
  const steps = await prisma.emailSequenceStep.findMany({
    where: { sequenceId },
  });
  const existingIds = new Set(steps.map((s) => s.id));
  for (const id of stepIds) {
    if (!existingIds.has(id)) {
      throw new AppError(`Step ${id} does not belong to this sequence`, 400);
    }
  }

  // Use a transaction to update all step numbers atomically.
  // First set all to negative temp values to avoid unique constraint conflicts,
  // then set to the final values.
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < stepIds.length; i++) {
      await tx.emailSequenceStep.update({
        where: { id: stepIds[i] },
        data: { stepNumber: -(i + 1) },
      });
    }
    for (let i = 0; i < stepIds.length; i++) {
      await tx.emailSequenceStep.update({
        where: { id: stepIds[i] },
        data: { stepNumber: i + 1 },
      });
    }
  });

  return prisma.emailSequenceStep.findMany({
    where: { sequenceId },
    orderBy: { stepNumber: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// Enrollment management
// ---------------------------------------------------------------------------

export async function enrollContact(sequenceId: string, contactId: string) {
  // Check sequence exists and is active
  const sequence = await prisma.emailSequence.findUnique({
    where: { id: sequenceId },
    include: { steps: { orderBy: { stepNumber: 'asc' }, take: 1 } },
  });
  if (!sequence) {
    throw new AppError('Email sequence not found', 404);
  }
  if (sequence.status !== 'active' && sequence.status !== 'draft') {
    throw new AppError('Cannot enroll contacts in an inactive sequence', 400);
  }

  // Check contact exists
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    throw new AppError('Contact not found', 404);
  }

  // Check if already enrolled
  const existingEnrollment = await prisma.emailEnrollment.findUnique({
    where: { sequenceId_contactId: { sequenceId, contactId } },
  });
  if (existingEnrollment && existingEnrollment.status === 'active') {
    throw new AppError('Contact is already enrolled in this sequence', 409);
  }

  // If previously enrolled (completed/paused/etc), upsert to re-enroll
  const enrollment = await prisma.emailEnrollment.upsert({
    where: { sequenceId_contactId: { sequenceId, contactId } },
    create: {
      sequenceId,
      contactId,
      status: 'active',
      currentStep: 0,
    },
    update: {
      status: 'active',
      currentStep: 0,
      completedAt: null,
      enrolledAt: new Date(),
    },
  });

  // Queue the first step if exists
  if (sequence.steps.length > 0) {
    const firstStep = sequence.steps[0];
    const delayMs = (firstStep.delayDays * 24 * 60 + firstStep.delayHours * 60) * 60 * 1000;
    const scheduledFor = new Date(Date.now() + delayMs);

    await enqueueEmailSend(enrollment.id, firstStep.id, scheduledFor);
  }

  logger.info(`Contact ${contactId} enrolled in sequence ${sequenceId}`);
  return enrollment;
}

export async function enrollContacts(sequenceId: string, contactIds: string[]) {
  const results = [];
  for (const contactId of contactIds) {
    try {
      const enrollment = await enrollContact(sequenceId, contactId);
      results.push({ contactId, enrollment, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      results.push({ contactId, success: false, error: message });
    }
  }
  return results;
}

export async function pauseEnrollment(enrollmentId: string) {
  const enrollment = await prisma.emailEnrollment.findUnique({
    where: { id: enrollmentId },
  });
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }
  if (enrollment.status !== 'active') {
    throw new AppError('Can only pause active enrollments', 400);
  }

  return prisma.emailEnrollment.update({
    where: { id: enrollmentId },
    data: { status: 'paused' },
  });
}

export async function resumeEnrollment(enrollmentId: string) {
  const enrollment = await prisma.emailEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      sequence: {
        include: { steps: { orderBy: { stepNumber: 'asc' } } },
      },
    },
  });
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }
  if (enrollment.status !== 'paused') {
    throw new AppError('Can only resume paused enrollments', 400);
  }

  const updated = await prisma.emailEnrollment.update({
    where: { id: enrollmentId },
    data: { status: 'active' },
  });

  // Re-queue the current step
  const nextStep = enrollment.sequence.steps.find(
    (s) => s.stepNumber === enrollment.currentStep + 1,
  );
  if (nextStep) {
    const delayMs = (nextStep.delayDays * 24 * 60 + nextStep.delayHours * 60) * 60 * 1000;
    const scheduledFor = new Date(Date.now() + delayMs);
    await enqueueEmailSend(enrollmentId, nextStep.id, scheduledFor);
  }

  return updated;
}

export async function unenrollContact(sequenceId: string, contactId: string) {
  const enrollment = await prisma.emailEnrollment.findUnique({
    where: { sequenceId_contactId: { sequenceId, contactId } },
  });
  if (!enrollment) {
    throw new AppError('Enrollment not found', 404);
  }

  return prisma.emailEnrollment.update({
    where: { id: enrollment.id },
    data: { status: 'unsubscribed', completedAt: new Date() },
  });
}

export async function getEnrollments(
  sequenceId: string,
  filters?: { status?: string; page?: number; limit?: number },
) {
  const page = filters?.page ?? 1;
  const limit = Math.min(100, Math.max(1, filters?.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.EmailEnrollmentWhereInput = {
    sequenceId,
    ...(filters?.status && { status: filters.status }),
  };

  const [enrollments, total] = await Promise.all([
    prisma.emailEnrollment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { enrolledAt: 'desc' },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            title: true,
            companyId: true,
          },
        },
        sends: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, sentAt: true, openedAt: true, clickedAt: true },
        },
      },
    }),
    prisma.emailEnrollment.count({ where }),
  ]);

  return {
    enrollments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ---------------------------------------------------------------------------
// Email processing
// ---------------------------------------------------------------------------

export async function processEmailStep(enrollmentId: string, stepId: string) {
  const enrollment = await prisma.emailEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      contact: {
        include: {
          company: {
            include: {
              score: true,
            },
          },
          signals: { select: { id: true } },
        },
      },
      sequence: true,
    },
  });

  if (!enrollment) {
    logger.warn(`Email send skipped: enrollment ${enrollmentId} not found`);
    return;
  }

  if (enrollment.status !== 'active') {
    logger.info(`Email send skipped: enrollment ${enrollmentId} is ${enrollment.status}`);
    return;
  }

  const step = await prisma.emailSequenceStep.findUnique({ where: { id: stepId } });
  if (!step) {
    logger.warn(`Email send skipped: step ${stepId} not found`);
    return;
  }

  // Build contact context for template rendering
  const contact = enrollment.contact;
  const contactContext: Record<string, unknown> = {
    ...contact,
    _signalCount: contact.signals?.length ?? 0,
    _pqaScore: contact.company?.score?.score ?? 0,
  };

  const renderedSubject = renderTemplate(step.subject, contactContext);
  const renderedBody = renderTemplate(step.body, contactContext);

  // Create the send record
  const send = await prisma.emailSend.create({
    data: {
      enrollmentId,
      stepId,
      status: 'pending',
    },
  });

  try {
    const fromName = enrollment.sequence.fromName || 'DevSignal';
    const fromEmail = enrollment.sequence.fromEmail || 'notifications@devsignal.dev';
    const fromAddress = `${fromName} <${fromEmail}>`;

    if (!contact.email) {
      throw new Error(`Contact ${contact.id} has no email address`);
    }

    const result = await sendEmail({
      to: contact.email,
      from: fromAddress,
      subject: renderedSubject,
      html: renderedBody,
      replyTo: enrollment.sequence.replyTo || undefined,
    });

    // Update send status to sent with provider message ID
    await prisma.emailSend.update({
      where: { id: send.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        ...(result.id && { messageId: result.id }),
      },
    });

    // Advance enrollment step
    await prisma.emailEnrollment.update({
      where: { id: enrollmentId },
      data: { currentStep: step.stepNumber },
    });

    // Schedule next step if exists
    const nextStep = await prisma.emailSequenceStep.findFirst({
      where: { sequenceId: step.sequenceId, stepNumber: step.stepNumber + 1 },
    });

    if (nextStep) {
      const delayMs =
        (nextStep.delayDays * 24 * 60 + nextStep.delayHours * 60) * 60 * 1000;
      const scheduledFor = new Date(Date.now() + delayMs);
      await enqueueEmailSend(enrollmentId, nextStep.id, scheduledFor);
      logger.info(`Next email step scheduled`, {
        enrollmentId,
        nextStepId: nextStep.id,
        scheduledFor: scheduledFor.toISOString(),
      });
    } else {
      // Mark enrollment as completed
      await prisma.emailEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'completed', completedAt: new Date() },
      });
      logger.info(`Email sequence completed for enrollment ${enrollmentId}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await prisma.emailSend.update({
      where: { id: send.id },
      data: { status: 'failed', errorMessage: message },
    });
    logger.error(`Email send failed: ${message}`, { sendId: send.id, enrollmentId });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getSequenceStats(sequenceId: string) {
  const [totalEnrollments, activeEnrollments, completedEnrollments, sends] = await Promise.all([
    prisma.emailEnrollment.count({ where: { sequenceId } }),
    prisma.emailEnrollment.count({ where: { sequenceId, status: 'active' } }),
    prisma.emailEnrollment.count({ where: { sequenceId, status: 'completed' } }),
    prisma.emailSend.findMany({
      where: { enrollment: { sequenceId } },
      select: { status: true },
    }),
  ]);

  const totalSent = sends.filter((s) => s.status !== 'pending' && s.status !== 'failed').length;
  const totalOpened = sends.filter((s) => s.status === 'opened' || s.status === 'clicked').length;
  const totalClicked = sends.filter((s) => s.status === 'clicked').length;
  const totalBounced = sends.filter((s) => s.status === 'bounced').length;
  const totalFailed = sends.filter((s) => s.status === 'failed').length;

  return {
    totalEnrollments,
    activeEnrollments,
    completedEnrollments,
    totalSent,
    totalOpened,
    totalClicked,
    totalBounced,
    totalFailed,
    openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
    clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
    bounceRate: totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0,
  };
}
