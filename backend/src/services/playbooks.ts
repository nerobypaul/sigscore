import { prisma } from '../config/database';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getSlackWebhookUrl } from './slack-notifications';
import type { WorkflowTrigger, WorkflowAction, WorkflowCondition } from './workflows';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlaybookCategory = 'acquisition' | 'expansion' | 'retention' | 'engagement';

export interface PlaybookTemplate {
  id: string;
  name: string;
  description: string;
  category: PlaybookCategory;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  tags: string[];
}

export interface ActivePlaybook {
  playbookId: string;
  workflowId: string;
  name: string;
  category: PlaybookCategory;
  enabled: boolean;
  runCount: number;
  lastTriggeredAt: string | null;
  activatedAt: string;
}

// ---------------------------------------------------------------------------
// Playbook prefix used to link workflows back to their source playbook
// ---------------------------------------------------------------------------

const PLAYBOOK_PREFIX = '[Playbook]';

// ---------------------------------------------------------------------------
// 10 pre-built devtool playbook templates
// ---------------------------------------------------------------------------

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  // 1. Hot GitHub Accounts
  {
    id: 'hot-github-accounts',
    name: 'Hot GitHub Accounts',
    description:
      'When a company has 3+ developers starring or forking a repo in 7 days, create a deal at "Identified" stage and send a Slack alert.',
    category: 'acquisition',
    trigger: {
      event: 'signal_received',
      filters: { source: 'github' },
    },
    conditions: [
      { field: 'uniqueDevCount', operator: 'gte', value: 3 },
    ],
    actions: [
      {
        type: 'create_deal',
        params: {
          title: 'Hot GitHub Account — {{companyName}}',
          stage: 'IDENTIFIED',
        },
      },
      {
        type: 'add_tag',
        params: { tag: 'hot-github' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '🔥 *Hot GitHub Account Detected*\nCompany has 3+ developers engaging with your repo in the last 7 days.',
        },
      },
      {
        type: 'log',
        params: { message: 'Hot GitHub account playbook triggered' },
      },
    ],
    tags: ['github', 'hot-account', 'acquisition'],
  },

  // 2. npm Surge Detection
  {
    id: 'npm-surge-detection',
    name: 'npm Surge Detection',
    description:
      'When npm downloads from a company increase 200%+ week-over-week, tag as "surge-account" and notify the team via Slack.',
    category: 'acquisition',
    trigger: {
      event: 'signal_received',
      filters: { source: 'npm' },
    },
    conditions: [
      { field: 'downloadGrowthPercent', operator: 'gte', value: 200 },
    ],
    actions: [
      {
        type: 'add_tag',
        params: { tag: 'surge-account' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '📈 *npm Surge Detected*\nDownloads from {{companyName}} increased 200%+ week-over-week. Time to reach out!',
        },
      },
      {
        type: 'log',
        params: { message: 'npm surge playbook triggered' },
      },
    ],
    tags: ['npm', 'surge', 'growth'],
  },

  // 3. Enterprise Signals
  {
    id: 'enterprise-signals',
    name: 'Enterprise Signals',
    description:
      'When a signal comes from a Fortune 500 or known enterprise domain, auto-create a deal and send a Slack alert to the sales team.',
    category: 'acquisition',
    trigger: {
      event: 'signal_received',
    },
    conditions: [
      { field: 'companySize', operator: 'gte', value: 1000 },
    ],
    actions: [
      {
        type: 'create_deal',
        params: {
          title: 'Enterprise Lead — {{companyName}}',
          stage: 'IDENTIFIED',
        },
      },
      {
        type: 'add_tag',
        params: { tag: 'enterprise' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '🏢 *Enterprise Signal*\nNew activity detected from {{companyName}} (enterprise account). Deal auto-created.',
        },
      },
      {
        type: 'log',
        params: { message: 'Enterprise signal playbook triggered' },
      },
    ],
    tags: ['enterprise', 'high-value', 'acquisition'],
  },

  // 4. Churning Developer Alert
  {
    id: 'churning-developer-alert',
    name: 'Churning Developer Alert',
    description:
      'When signal frequency from a company drops 50%+ over 14 days, tag "churn-risk" and send a Slack alert for immediate attention.',
    category: 'retention',
    trigger: {
      event: 'score_changed',
    },
    conditions: [
      { field: 'scoreChangePercent', operator: 'lte', value: -50 },
    ],
    actions: [
      {
        type: 'add_tag',
        params: { tag: 'churn-risk' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '⚠️ *Churn Risk Detected*\nSignal activity from {{companyName}} dropped 50%+ in the last 14 days. Consider proactive outreach.',
        },
      },
      {
        type: 'log',
        params: { message: 'Churning developer alert playbook triggered' },
      },
    ],
    tags: ['churn', 'retention', 'risk'],
  },

  // 5. Multi-Product Expansion
  {
    id: 'multi-product-expansion',
    name: 'Multi-Product Expansion',
    description:
      'When a company has signals across 3+ different signal types, tag "expansion-ready" to flag cross-sell opportunities.',
    category: 'expansion',
    trigger: {
      event: 'signal_received',
    },
    conditions: [
      { field: 'distinctSignalTypes', operator: 'gte', value: 3 },
    ],
    actions: [
      {
        type: 'add_tag',
        params: { tag: 'expansion-ready' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '🚀 *Expansion Opportunity*\n{{companyName}} is using 3+ product areas. Tag them for cross-sell outreach.',
        },
      },
      {
        type: 'log',
        params: { message: 'Multi-product expansion playbook triggered' },
      },
    ],
    tags: ['expansion', 'cross-sell', 'multi-product'],
  },

  // 6. First-Time Evaluator
  {
    id: 'first-time-evaluator',
    name: 'First-Time Evaluator',
    description:
      'When the first signal arrives from a new company, create a contact, company, and deal at "Anonymous Usage" to start tracking.',
    category: 'acquisition',
    trigger: {
      event: 'contact_created',
    },
    conditions: [],
    actions: [
      {
        type: 'create_deal',
        params: {
          title: 'New Evaluator — {{companyName}}',
          stage: 'IDENTIFIED',
        },
      },
      {
        type: 'add_tag',
        params: { tag: 'first-time-evaluator' },
      },
      {
        type: 'log',
        params: { message: 'First-time evaluator playbook triggered' },
      },
    ],
    tags: ['new-user', 'evaluator', 'acquisition'],
  },

  // 7. Team Adoption Signal
  {
    id: 'team-adoption-signal',
    name: 'Team Adoption Signal',
    description:
      'When 5+ unique developers from the same company generate signals, tag "team-adoption" and send Slack notification.',
    category: 'expansion',
    trigger: {
      event: 'signal_received',
    },
    conditions: [
      { field: 'uniqueDevCount', operator: 'gte', value: 5 },
    ],
    actions: [
      {
        type: 'add_tag',
        params: { tag: 'team-adoption' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '👥 *Team Adoption Detected*\n5+ developers at {{companyName}} are now active. This account is ready for a team plan conversation.',
        },
      },
      {
        type: 'log',
        params: { message: 'Team adoption signal playbook triggered' },
      },
    ],
    tags: ['team', 'adoption', 'expansion'],
  },

  // 8. GitHub Issue = Intent
  {
    id: 'github-issue-intent',
    name: 'GitHub Issue = Intent',
    description:
      'When a developer files a GitHub issue on your repo, auto-create a contact and tag "high-intent" for immediate follow-up.',
    category: 'engagement',
    trigger: {
      event: 'signal_received',
      filters: { source: 'github', type: 'issue_opened' },
    },
    conditions: [],
    actions: [
      {
        type: 'add_tag',
        params: { tag: 'high-intent' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '🎯 *High-Intent Signal*\nA developer just filed a GitHub issue. This is a strong buying signal — follow up ASAP.',
        },
      },
      {
        type: 'log',
        params: { message: 'GitHub issue intent playbook triggered' },
      },
    ],
    tags: ['github', 'intent', 'engagement'],
  },

  // 9. Package Version Upgrade
  {
    id: 'package-version-upgrade',
    name: 'Package Version Upgrade',
    description:
      'When a company upgrades to a newer version of your package, tag "active-adopter" to track engaged users.',
    category: 'engagement',
    trigger: {
      event: 'signal_received',
      filters: { type: 'version_upgrade' },
    },
    conditions: [],
    actions: [
      {
        type: 'add_tag',
        params: { tag: 'active-adopter' },
      },
      {
        type: 'send_slack',
        params: {
          message:
            '⬆️ *Version Upgrade*\n{{companyName}} upgraded to the latest version of your package. They are actively investing in your tool.',
        },
      },
      {
        type: 'log',
        params: { message: 'Package version upgrade playbook triggered' },
      },
    ],
    tags: ['upgrade', 'engagement', 'active'],
  },

  // 10. Weekly Digest
  {
    id: 'weekly-digest',
    name: 'Weekly Digest',
    description:
      'Every Monday, send a Slack summary of the top 10 hottest accounts with their signal counts from the past week.',
    category: 'engagement',
    trigger: {
      event: 'signal_received',
      filters: { type: 'weekly_digest' },
    },
    conditions: [],
    actions: [
      {
        type: 'send_slack',
        params: {
          message:
            '📊 *Weekly Sigscore Digest*\nHere are your top 10 hottest accounts from the past week. Check your dashboard for full details.',
        },
      },
      {
        type: 'log',
        params: { message: 'Weekly digest playbook triggered' },
      },
    ],
    tags: ['digest', 'weekly', 'summary'],
  },
];

// ---------------------------------------------------------------------------
// Integration validation helpers
// ---------------------------------------------------------------------------

/**
 * Check which integrations are required by a playbook's actions and return
 * warnings for any that are not configured. This does NOT block activation —
 * it only surfaces actionable guidance so the user can configure them later.
 */
async function validateIntegrations(
  organizationId: string,
  actions: WorkflowAction[],
): Promise<string[]> {
  const warnings: string[] = [];
  const actionTypes = actions.map((a) => a.type);

  if (actionTypes.includes('send_slack')) {
    const webhookUrl = await getSlackWebhookUrl(organizationId);
    if (!webhookUrl) {
      warnings.push(
        'Slack webhook is not configured. Slack notifications will be skipped until configured in Settings > Slack.',
      );
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Return all 10 playbook templates with their activation status for an org.
 */
export const listPlaybooks = async (organizationId?: string) => {
  // If an org is specified, look up which playbooks are already active
  let activeMap = new Map<string, { workflowId: string; enabled: boolean; runCount: number; lastTriggeredAt: Date | null; createdAt: Date }>();

  if (organizationId) {
    const workflows = await prisma.workflow.findMany({
      where: {
        organizationId,
        name: { startsWith: PLAYBOOK_PREFIX },
      },
      select: {
        id: true,
        name: true,
        enabled: true,
        runCount: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    });

    for (const wf of workflows) {
      // Extract playbook ID from the workflow name: "[Playbook] Hot GitHub Accounts"
      const template = PLAYBOOK_TEMPLATES.find(
        (t) => `${PLAYBOOK_PREFIX} ${t.name}` === wf.name,
      );
      if (template) {
        activeMap.set(template.id, {
          workflowId: wf.id,
          enabled: wf.enabled,
          runCount: wf.runCount,
          lastTriggeredAt: wf.lastTriggeredAt,
          createdAt: wf.createdAt,
        });
      }
    }
  }

  return PLAYBOOK_TEMPLATES.map((template) => {
    const active = activeMap.get(template.id);
    return {
      ...template,
      active: !!active,
      workflowId: active?.workflowId ?? null,
      enabled: active?.enabled ?? false,
      runCount: active?.runCount ?? 0,
      lastTriggeredAt: active?.lastTriggeredAt?.toISOString() ?? null,
      activatedAt: active?.createdAt?.toISOString() ?? null,
    };
  });
};

/**
 * Activate a playbook by creating a real Workflow from the template.
 */
export const activatePlaybook = async (organizationId: string, playbookId: string) => {
  const template = PLAYBOOK_TEMPLATES.find((t) => t.id === playbookId);
  if (!template) {
    throw new AppError('Playbook template not found', 404);
  }

  // Pre-flight: check required integrations and collect warnings
  const warnings = await validateIntegrations(organizationId, template.actions);

  const workflowName = `${PLAYBOOK_PREFIX} ${template.name}`;

  // Check if already activated
  const existing = await prisma.workflow.findFirst({
    where: { organizationId, name: workflowName },
  });

  if (existing) {
    // If it exists but is disabled, re-enable it
    if (!existing.enabled) {
      const updated = await prisma.workflow.update({
        where: { id: existing.id },
        data: { enabled: true },
      });
      logger.info(`Playbook "${playbookId}" re-enabled for org ${organizationId}`);
      return { workflow: updated, warnings };
    }
    throw new AppError('Playbook is already active', 409);
  }

  // Create the workflow
  const workflow = await prisma.workflow.create({
    data: {
      name: workflowName,
      description: template.description,
      trigger: template.trigger as unknown as Prisma.InputJsonValue,
      conditions: template.conditions as unknown as Prisma.InputJsonValue,
      actions: template.actions as unknown as Prisma.InputJsonValue,
      enabled: true,
      organization: { connect: { id: organizationId } },
    },
  });

  logger.info(`Playbook "${playbookId}" activated as workflow ${workflow.id} for org ${organizationId}`);
  return { workflow, warnings };
};

/**
 * List which playbooks are currently active for an org.
 */
export const getActivePlaybooks = async (organizationId: string): Promise<ActivePlaybook[]> => {
  const workflows = await prisma.workflow.findMany({
    where: {
      organizationId,
      name: { startsWith: PLAYBOOK_PREFIX },
    },
    orderBy: { createdAt: 'desc' },
  });

  const result: ActivePlaybook[] = [];

  for (const wf of workflows) {
    const template = PLAYBOOK_TEMPLATES.find(
      (t) => `${PLAYBOOK_PREFIX} ${t.name}` === wf.name,
    );
    if (template) {
      result.push({
        playbookId: template.id,
        workflowId: wf.id,
        name: template.name,
        category: template.category,
        enabled: wf.enabled,
        runCount: wf.runCount,
        lastTriggeredAt: wf.lastTriggeredAt?.toISOString() ?? null,
        activatedAt: wf.createdAt.toISOString(),
      });
    }
  }

  return result;
};

/**
 * Deactivate a playbook by disabling (soft-delete) its workflow.
 * We disable rather than delete so run history is preserved.
 */
export const deactivatePlaybook = async (organizationId: string, playbookId: string) => {
  const template = PLAYBOOK_TEMPLATES.find((t) => t.id === playbookId);
  if (!template) {
    throw new AppError('Playbook template not found', 404);
  }

  const workflowName = `${PLAYBOOK_PREFIX} ${template.name}`;

  const workflow = await prisma.workflow.findFirst({
    where: { organizationId, name: workflowName },
  });

  if (!workflow) {
    throw new AppError('Playbook is not active', 404);
  }

  const updated = await prisma.workflow.update({
    where: { id: workflow.id },
    data: { enabled: false },
  });

  logger.info(`Playbook "${playbookId}" deactivated for org ${organizationId}`);
  return updated;
};
