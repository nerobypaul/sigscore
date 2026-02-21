/**
 * Slack Block Kit Message Builders
 *
 * Rich, interactive message templates for different Sigscore notification types.
 * Each builder returns a Block Kit payload with action buttons whose `action_id`
 * values are handled by the interactions route.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  block_id?: string;
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<Record<string, unknown>>;
  accessory?: Record<string, unknown>;
}

export interface SlackBlockMessage {
  text: string; // fallback for notifications / accessibility
  blocks: SlackBlock[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierBadge(tier: string): string {
  const badges: Record<string, string> = {
    HOT: '\uD83D\uDD25 HOT',
    WARM: '\uD83D\uDFE0 WARM',
    COLD: '\uD83D\uDD35 COLD',
    INACTIVE: '\u26AA INACTIVE',
  };
  return badges[tier] || tier;
}

function trendArrow(trend: string): string {
  if (trend === 'RISING') return '\uD83D\uDCC8 Rising';
  if (trend === 'FALLING') return '\uD83D\uDCC9 Falling';
  return '\u2194\uFE0F Stable';
}

function stageEmoji(stage: string): string {
  const map: Record<string, string> = {
    ANONYMOUS_USAGE: '\uD83D\uDC7B',
    FREE_SIGNUP: '\u2709\uFE0F',
    ACTIVATED: '\u2705',
    TEAM_ADOPTION: '\uD83D\uDC65',
    EXPANSION: '\uD83D\uDE80',
    ENTERPRISE_PILOT: '\uD83C\uDFE2',
    CLOSED_WON: '\uD83C\uDF89',
    CLOSED_LOST: '\u274C',
  };
  return map[stage] || '\uD83D\uDD39';
}

// ---------------------------------------------------------------------------
// 1. Account HOT Alert
// ---------------------------------------------------------------------------

export function buildAccountHotAlert(data: {
  companyName: string;
  score: number;
  tier: string;
  trend: string;
  signalCount: number;
  topSignal: string;
  accountUrl: string;
  accountId: string;
}): SlackBlockMessage {
  return {
    text: `\uD83D\uDD25 Account Alert: ${data.companyName} (score ${data.score})`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `\uD83D\uDD25 Account Alert: ${data.companyName}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Tier:*\n${tierBadge(data.tier)}` },
          { type: 'mrkdwn', text: `*PQA Score:*\n${data.score}/100` },
          { type: 'mrkdwn', text: `*Trend:*\n${trendArrow(data.trend)}` },
          { type: 'mrkdwn', text: `*Signals (30d):*\n${data.signalCount}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Top signal:* ${data.topSignal}`,
        },
      },
      {
        type: 'actions',
        block_id: `account_actions_${data.accountId}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Account', emoji: true },
            url: data.accountUrl,
            action_id: 'view_account',
            value: data.accountId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Claim Account', emoji: true },
            style: 'primary',
            action_id: 'claim_account',
            value: data.accountId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Snooze 7d', emoji: true },
            action_id: 'snooze_account',
            value: data.accountId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sigscore \u2022 ${new Date().toISOString().split('T')[0]}`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. New Signup Alert
// ---------------------------------------------------------------------------

export function buildSignupAlert(data: {
  contactName: string;
  email: string | null;
  companyName: string | null;
  contactId: string;
  contactUrl: string;
}): SlackBlockMessage {
  const companyLine = data.companyName ? ` at *${data.companyName}*` : '';
  return {
    text: `\u2709\uFE0F New signup: ${data.contactName}${companyLine}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '\u2709\uFE0F New Signup',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.contactName}*${companyLine}\n${data.email || 'No email'}`,
        },
      },
      {
        type: 'actions',
        block_id: `signup_actions_${data.contactId}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Contact', emoji: true },
            url: data.contactUrl,
            action_id: 'view_contact',
            value: data.contactId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Dismiss', emoji: true },
            action_id: 'dismiss',
            value: data.contactId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sigscore \u2022 ${new Date().toLocaleString()}`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Deal Stage Change
// ---------------------------------------------------------------------------

export function buildDealStageChange(data: {
  dealTitle: string;
  oldStage: string;
  newStage: string;
  amount: number | null;
  companyName: string | null;
  dealId: string;
  dealUrl: string;
}): SlackBlockMessage {
  const amountStr = data.amount ? `$${Number(data.amount).toLocaleString()}` : 'No amount';
  const companyLine = data.companyName ? ` \u2022 ${data.companyName}` : '';
  return {
    text: `${stageEmoji(data.newStage)} Deal "${data.dealTitle}" moved: ${data.oldStage} -> ${data.newStage}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${stageEmoji(data.newStage)} Deal Stage Changed`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.dealTitle}*${companyLine}\n${amountStr}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*From:*\n${stageEmoji(data.oldStage)} ${data.oldStage.replace(/_/g, ' ')}` },
          { type: 'mrkdwn', text: `*To:*\n${stageEmoji(data.newStage)} ${data.newStage.replace(/_/g, ' ')}` },
        ],
      },
      {
        type: 'actions',
        block_id: `deal_actions_${data.dealId}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Deal', emoji: true },
            url: data.dealUrl,
            action_id: 'view_deal',
            value: data.dealId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Dismiss', emoji: true },
            action_id: 'dismiss',
            value: data.dealId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sigscore \u2022 ${new Date().toLocaleString()}`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4. Workflow Failed
// ---------------------------------------------------------------------------

export function buildWorkflowFailed(data: {
  workflowName: string;
  actionType: string;
  errorMessage: string;
  workflowId: string;
  workflowUrl: string;
}): SlackBlockMessage {
  return {
    text: `\u26A0\uFE0F Workflow failed: ${data.workflowName}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '\u26A0\uFE0F Workflow Failed',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${data.workflowName}*\nAction \`${data.actionType}\` encountered an error.`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`\`\`${data.errorMessage.slice(0, 500)}\`\`\``,
        },
      },
      {
        type: 'actions',
        block_id: `workflow_actions_${data.workflowId}`,
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Workflow', emoji: true },
            url: data.workflowUrl,
            action_id: 'view_workflow',
            value: data.workflowId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Dismiss', emoji: true },
            action_id: 'dismiss',
            value: data.workflowId,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sigscore \u2022 ${new Date().toLocaleString()}`,
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 5. Weekly Digest
// ---------------------------------------------------------------------------

export function buildWeeklyDigest(data: {
  periodLabel: string;
  topAccounts: Array<{ name: string; score: number; tier: string }>;
  newSignals: number;
  newContacts: number;
  dealsWon: number;
  dealsLost: number;
  pipelineValue: number;
  dashboardUrl: string;
}): SlackBlockMessage {
  const topList = data.topAccounts
    .slice(0, 5)
    .map((a, i) => `${i + 1}. ${tierBadge(a.tier)} *${a.name}* (${a.score}/100)`)
    .join('\n');

  return {
    text: `\uD83D\uDCCA Sigscore Weekly Digest \u2014 ${data.periodLabel}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `\uD83D\uDCCA Weekly Digest \u2014 ${data.periodLabel}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Top Accounts*',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: topList || '_No scored accounts this week_',
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*New Signals:*\n${data.newSignals.toLocaleString()}` },
          { type: 'mrkdwn', text: `*New Contacts:*\n${data.newContacts.toLocaleString()}` },
          { type: 'mrkdwn', text: `*Deals Won:*\n${data.dealsWon}` },
          { type: 'mrkdwn', text: `*Deals Lost:*\n${data.dealsLost}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Pipeline Value:* $${data.pipelineValue.toLocaleString()}`,
        },
      },
      {
        type: 'actions',
        block_id: 'digest_actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open Dashboard', emoji: true },
            style: 'primary',
            url: data.dashboardUrl,
            action_id: 'open_dashboard',
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sigscore \u2022 Sent ${new Date().toISOString().split('T')[0]}`,
          },
        ],
      },
    ],
  };
}
