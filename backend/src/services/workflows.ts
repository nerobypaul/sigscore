import { Prisma, WorkflowRunStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getSlackWebhookUrl } from './slack-notifications';
import { notifyOrgUsers } from './notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowTrigger {
  event: 'signal_received' | 'contact_created' | 'deal_stage_changed' | 'score_changed';
  filters?: Record<string, unknown>;
}

export interface WorkflowCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: unknown;
}

export interface WorkflowAction {
  type: 'create_deal' | 'update_deal_stage' | 'send_webhook' | 'send_slack' | 'add_tag' | 'log';
  params: Record<string, unknown>;
}

export interface CreateWorkflowData {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
  enabled?: boolean;
}

export interface UpdateWorkflowData {
  name?: string;
  description?: string;
  trigger?: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions?: WorkflowAction[];
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const listWorkflows = async (
  organizationId: string,
  opts?: { enabled?: boolean; page?: number; limit?: number },
) => {
  const page = opts?.page ?? 1;
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: Prisma.WorkflowWhereInput = {
    organizationId,
    ...(opts?.enabled !== undefined && { enabled: opts.enabled }),
  };

  const [workflows, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.workflow.count({ where }),
  ]);

  return {
    workflows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getWorkflow = async (id: string, organizationId: string) => {
  const workflow = await prisma.workflow.findFirst({
    where: { id, organizationId },
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!workflow) {
    throw new AppError('Workflow not found', 404);
  }

  return workflow;
};

export const createWorkflow = async (organizationId: string, data: CreateWorkflowData) => {
  return prisma.workflow.create({
    data: {
      name: data.name,
      description: data.description,
      trigger: data.trigger as unknown as Prisma.InputJsonValue,
      conditions: (data.conditions ?? []) as unknown as Prisma.InputJsonValue,
      actions: data.actions as unknown as Prisma.InputJsonValue,
      enabled: data.enabled ?? true,
      organization: { connect: { id: organizationId } },
    },
  });
};

export const updateWorkflow = async (
  id: string,
  organizationId: string,
  data: UpdateWorkflowData,
) => {
  const existing = await prisma.workflow.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw new AppError('Workflow not found', 404);
  }

  return prisma.workflow.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.trigger !== undefined && {
        trigger: data.trigger as unknown as Prisma.InputJsonValue,
      }),
      ...(data.conditions !== undefined && {
        conditions: data.conditions as unknown as Prisma.InputJsonValue,
      }),
      ...(data.actions !== undefined && {
        actions: data.actions as unknown as Prisma.InputJsonValue,
      }),
      ...(data.enabled !== undefined && { enabled: data.enabled }),
    },
  });
};

export const deleteWorkflow = async (id: string, organizationId: string) => {
  const existing = await prisma.workflow.findFirst({ where: { id, organizationId } });
  if (!existing) {
    throw new AppError('Workflow not found', 404);
  }

  return prisma.workflow.delete({ where: { id } });
};

export const getWorkflowRuns = async (
  workflowId: string,
  organizationId: string,
  opts?: { limit?: number },
) => {
  // Verify the workflow belongs to this organization
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, organizationId },
  });
  if (!workflow) {
    throw new AppError('Workflow not found', 404);
  }

  const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));

  const runs = await prisma.workflowRun.findMany({
    where: { workflowId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return { runs, workflowId };
};

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

export const evaluateConditions = (
  conditions: WorkflowCondition[],
  context: Record<string, unknown>,
): boolean => {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((condition) => {
    const actual = context[condition.field];
    const expected = condition.value;

    switch (condition.operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'gt':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'gte':
        return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      case 'lt':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'lte':
        return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      case 'contains':
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      default:
        logger.warn(`Unknown condition operator: ${(condition as WorkflowCondition).operator}`);
        return false;
    }
  });
};

// ---------------------------------------------------------------------------
// Action execution
// ---------------------------------------------------------------------------

export const executeAction = async (
  action: WorkflowAction,
  organizationId: string,
  context: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  switch (action.type) {
    case 'create_deal': {
      const title = (action.params.title as string) || `Auto-created deal`;
      const dealData: Prisma.DealCreateInput = {
        title,
        organization: { connect: { id: organizationId } },
      };
      if (action.params.amount !== undefined) {
        dealData.amount = Number(action.params.amount);
      }
      if (action.params.stage) {
        dealData.stage = action.params.stage as Prisma.DealCreateInput['stage'];
      }
      if (action.params.contactId) {
        dealData.contact = { connect: { id: action.params.contactId as string } };
      }
      const companyId = (action.params.companyId as string) || (context.accountId as string);
      if (companyId) {
        dealData.company = { connect: { id: companyId } };
      }
      const deal = await prisma.deal.create({ data: dealData });
      logger.info(`Workflow action: created deal ${deal.id} for org ${organizationId}`);
      return { dealId: deal.id, title: deal.title };
    }

    case 'update_deal_stage': {
      const dealId = (action.params.dealId as string) || (context.dealId as string);
      const stage = action.params.stage as string;
      if (!dealId || !stage) {
        throw new Error('update_deal_stage requires dealId and stage params');
      }
      const deal = await prisma.deal.findFirst({ where: { id: dealId, organizationId } });
      if (!deal) {
        throw new Error(`Deal ${dealId} not found in organization`);
      }
      const updated = await prisma.deal.update({
        where: { id: dealId },
        data: { stage: stage as never },
      });
      logger.info(`Workflow action: updated deal ${dealId} to stage ${stage}`);
      return { dealId: updated.id, stage: updated.stage };
    }

    case 'send_webhook': {
      const url = action.params.url as string;
      if (!url) throw new Error('send_webhook requires a url param');
      const payload = (action.params.payload as Record<string, unknown>) ?? context;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        logger.info(`Workflow action: send_webhook to ${url} — ${response.status}`);
        return { type: 'send_webhook', url, statusCode: response.status, success: response.ok };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Workflow action: send_webhook to ${url} failed: ${msg}`);
        return { type: 'send_webhook', url, success: false, error: msg };
      }
    }

    case 'send_slack': {
      const message = (action.params.message as string) || 'Workflow notification from DevSignal';
      const webhookUrl = await getSlackWebhookUrl(organizationId);
      if (!webhookUrl) {
        logger.warn('Workflow action: send_slack skipped — no Slack webhook configured');
        return { type: 'send_slack', status: 'skipped', reason: 'no_webhook_configured' };
      }
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            blocks: [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: message },
              },
              {
                type: 'context',
                elements: [
                  { type: 'mrkdwn', text: `DevSignal Workflow \u2022 ${new Date().toISOString().split('T')[0]}` },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        });
        logger.info(`Workflow action: send_slack — ${response.status}`);
        return { type: 'send_slack', success: response.ok };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Workflow action: send_slack failed: ${msg}`);
        return { type: 'send_slack', success: false, error: msg };
      }
    }

    case 'add_tag': {
      const tagName = action.params.tag as string;
      if (!tagName) throw new Error('add_tag requires a tag param');

      // Find or create the tag
      const tag = await prisma.tag.upsert({
        where: { organizationId_name: { organizationId, name: tagName } },
        create: { name: tagName, organization: { connect: { id: organizationId } } },
        update: {},
      });

      // Attach to entity based on context
      const contactId = context.contactId as string | undefined;
      const companyId = context.accountId as string | undefined;
      const dealId = context.dealId as string | undefined;

      if (contactId) {
        await prisma.contactTag.upsert({
          where: { contactId_tagId: { contactId, tagId: tag.id } },
          create: { contactId, tagId: tag.id },
          update: {},
        });
      }
      if (companyId) {
        await prisma.companyTag.upsert({
          where: { companyId_tagId: { companyId, tagId: tag.id } },
          create: { companyId, tagId: tag.id },
          update: {},
        });
      }
      if (dealId) {
        await prisma.dealTag.upsert({
          where: { dealId_tagId: { dealId, tagId: tag.id } },
          create: { dealId, tagId: tag.id },
          update: {},
        });
      }

      logger.info(`Workflow action: add_tag "${tagName}" to ${contactId ? 'contact' : companyId ? 'company' : dealId ? 'deal' : 'nothing'}`);
      return { type: 'add_tag', tag: tagName, tagId: tag.id, attached: !!(contactId || companyId || dealId) };
    }

    case 'log': {
      logger.info('Workflow action: log', {
        organizationId,
        params: action.params,
        context,
      });
      return { type: 'log', logged: true };
    }

    default:
      throw new Error(`Unknown action type: ${(action as WorkflowAction).type}`);
  }
};

// ---------------------------------------------------------------------------
// Event processing (the engine entry point)
// ---------------------------------------------------------------------------

export const processEvent = async (
  organizationId: string,
  event: string,
  eventData: Record<string, unknown>,
): Promise<void> => {
  const workflows = await prisma.workflow.findMany({
    where: {
      organizationId,
      enabled: true,
    },
  });

  // Filter workflows whose trigger matches this event
  const matching = workflows.filter((w) => {
    const trigger = w.trigger as unknown as WorkflowTrigger;
    if (trigger.event !== event) return false;

    // If the trigger has filters, every filter key/value must match in eventData
    if (trigger.filters) {
      return Object.entries(trigger.filters).every(
        ([key, value]) => eventData[key] === value,
      );
    }
    return true;
  });

  if (matching.length === 0) {
    logger.debug(`No workflows matched event "${event}" for org ${organizationId}`);
    return;
  }

  logger.info(
    `Processing event "${event}" for org ${organizationId}: ${matching.length} workflow(s) matched`,
  );

  for (const workflow of matching) {
    const startTime = Date.now();
    const conditions = (workflow.conditions ?? []) as unknown as WorkflowCondition[];
    const actions = workflow.actions as unknown as WorkflowAction[];

    // Evaluate conditions
    if (!evaluateConditions(conditions, eventData)) {
      await prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          status: WorkflowRunStatus.SKIPPED,
          triggerData: eventData as unknown as Prisma.InputJsonValue,
          results: { reason: 'Conditions not met' } as unknown as Prisma.InputJsonValue,
          duration: Date.now() - startTime,
        },
      });
      logger.info(`Workflow ${workflow.id} skipped: conditions not met`);
      continue;
    }

    // Execute all actions
    const results: Record<string, unknown>[] = [];
    let failed = false;
    let errorMessage: string | undefined;

    for (const action of actions) {
      try {
        const result = await executeAction(action, organizationId, eventData);
        results.push(result);
      } catch (err) {
        failed = true;
        errorMessage = err instanceof Error ? err.message : String(err);
        logger.error(`Workflow ${workflow.id} action "${action.type}" failed: ${errorMessage}`);
        break;
      }
    }

    const duration = Date.now() - startTime;

    // Record the run
    await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: failed ? WorkflowRunStatus.FAILED : WorkflowRunStatus.SUCCESS,
        triggerData: eventData as unknown as Prisma.InputJsonValue,
        results: results as unknown as Prisma.InputJsonValue,
        error: errorMessage ?? null,
        duration,
      },
    });

    // Update the workflow metadata
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: {
        lastTriggeredAt: new Date(),
        runCount: { increment: 1 },
      },
    });

    logger.info(
      `Workflow ${workflow.id} "${workflow.name}" completed: ${failed ? 'FAILED' : 'SUCCESS'} (${duration}ms)`,
    );

    // Notify org users when a workflow fails
    if (failed) {
      notifyOrgUsers(organizationId, {
        type: 'workflow_failed',
        title: `Workflow "${workflow.name}" failed`,
        body: errorMessage || 'An action in this workflow encountered an error',
        entityType: 'workflow',
        entityId: workflow.id,
      }).catch((err) => logger.error('Workflow failure notification error:', err));
    }
  }
};
