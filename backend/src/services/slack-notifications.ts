import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { config } from '../config';
import {
  buildAccountHotAlert,
  buildSignupAlert,
  buildDealStageChange,
  buildWorkflowFailed,
  SlackBlockMessage,
} from './slack-blocks';

// ---------------------------------------------------------------------------
// Internal types (backward-compatible)
// ---------------------------------------------------------------------------

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<Record<string, unknown>>;
  accessory?: Record<string, unknown>;
}

interface SlackMessage {
  text: string; // fallback
  blocks: SlackBlock[];
}

// ---------------------------------------------------------------------------
// Tier helpers (preserved from original)
// ---------------------------------------------------------------------------

function tierDirection(oldTier: string, newTier: string): 'upgraded' | 'downgraded' | 'changed' {
  const tierOrder = ['INACTIVE', 'COLD', 'WARM', 'HOT'];
  const oldIdx = tierOrder.indexOf(oldTier);
  const newIdx = tierOrder.indexOf(newTier);
  if (newIdx > oldIdx) return 'upgraded';
  if (newIdx < oldIdx) return 'downgraded';
  return 'changed';
}

function tierEmoji(tier: string): string {
  switch (tier) {
    case 'HOT': return '\uD83D\uDD25';
    case 'WARM': return '\uD83D\uDFE0';
    case 'COLD': return '\uD83D\uDD35';
    case 'INACTIVE': return '\u26AA';
    default: return '\u26AA';
  }
}

// ---------------------------------------------------------------------------
// Message builders (plain-text backward compat)
// ---------------------------------------------------------------------------

function buildTierChangeMessage(
  accountName: string,
  oldTier: string,
  newTier: string,
  score: number,
  signalCount: number,
  userCount: number,
): SlackMessage {
  const direction = tierDirection(oldTier, newTier);
  const emoji = direction === 'upgraded' ? '\uD83D\uDCC8' : '\uD83D\uDCC9';
  const verb = direction === 'upgraded' ? 'upgraded' : 'downgraded';

  return {
    text: `${emoji} ${accountName} ${verb} from ${oldTier} to ${newTier}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} PQA Tier Change`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${accountName}* ${verb} from ${tierEmoji(oldTier)} *${oldTier}* \u2192 ${tierEmoji(newTier)} *${newTier}*`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Score:*\n${score}/100` },
          { type: 'mrkdwn', text: `*Signal Count:*\n${signalCount}` },
          { type: 'mrkdwn', text: `*Active Users:*\n${userCount}` },
          { type: 'mrkdwn', text: `*Direction:*\n${direction === 'upgraded' ? '\uD83D\uDCC8 Trending Up' : '\uD83D\uDCC9 Trending Down'}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Sigscore \u2022 ${new Date().toISOString().split('T')[0]}` },
        ],
      },
    ],
  };
}

function buildHotAccountMessage(accountName: string, score: number, signalCount: number): SlackMessage {
  return {
    text: `\uD83D\uDD25 New HOT account: ${accountName} (score: ${score})`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '\uD83D\uDD25 New HOT Account Detected', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${accountName}* has reached HOT status with a PQA score of *${score}/100* and *${signalCount} signals*.`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Sigscore \u2022 Take action before they go cold!' },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Transport: send to Slack webhook
// ---------------------------------------------------------------------------

async function sendSlackMessage(webhookUrl: string, message: SlackMessage): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      logger.warn('Slack webhook failed', { status: response.status, statusText: response.statusText });
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Slack notification error', { error });
    return false;
  }
}

/**
 * Send a Block Kit message to a Slack webhook.
 */
export async function sendSlackBlockMessage(
  webhookUrl: string,
  message: SlackBlockMessage,
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!response.ok) {
      logger.warn('Slack block message failed', { status: response.status, statusText: response.statusText });
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Slack block message error', { error });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export async function getSlackWebhookUrl(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = org?.settings as Record<string, unknown> | null;
  return (settings?.slackWebhookUrl as string) || null;
}

/** Check if rich Slack alerts are enabled for this org. */
async function isRichAlertsEnabled(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = org?.settings as Record<string, unknown> | null;
  return settings?.slackRichAlerts === true;
}

/** Check if a specific alert type is enabled. */
async function isAlertTypeEnabled(organizationId: string, alertType: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = org?.settings as Record<string, unknown> | null;
  const alertTypes = (settings?.slackAlertTypes as string[] | undefined) || [];
  // If no alert types configured, default to all enabled
  if (alertTypes.length === 0) return true;
  return alertTypes.includes(alertType);
}

/** Check if an account is currently snoozed. */
async function isAccountSnoozed(organizationId: string, accountId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = org?.settings as Record<string, unknown> | null;
  const snoozed = (settings?.snoozedAccounts || {}) as Record<string, string>;
  const expiry = snoozed[accountId];
  if (!expiry) return false;
  return new Date(expiry) > new Date();
}

/** Get the frontend URL for building entity links. */
function getFrontendUrl(): string {
  return config.frontend?.url || 'http://localhost:5173';
}

// ---------------------------------------------------------------------------
// Public API: backward-compatible tier change notification
// ---------------------------------------------------------------------------

export async function notifyTierChange(
  organizationId: string,
  accountName: string,
  oldTier: string,
  newTier: string,
  score: number,
  signalCount: number,
  userCount: number,
): Promise<void> {
  if (oldTier === newTier) return;

  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return;

  const message = buildTierChangeMessage(accountName, oldTier, newTier, score, signalCount, userCount);
  await sendSlackMessage(webhookUrl, message);

  // Also send a special message for new HOT accounts
  if (newTier === 'HOT' && oldTier !== 'HOT') {
    const hotMessage = buildHotAccountMessage(accountName, score, signalCount);
    await sendSlackMessage(webhookUrl, hotMessage);
  }
}

// ---------------------------------------------------------------------------
// Public API: backward-compatible high-value signal notification
// ---------------------------------------------------------------------------

export async function notifyHighValueSignal(
  organizationId: string,
  signalType: string,
  accountName: string | null,
  actorName: string | null,
  _metadata: Record<string, unknown>,
): Promise<void> {
  const highValueTypes = ['signup', 'app_installed', 'pr_merged', 'team_adoption'];
  if (!highValueTypes.includes(signalType)) return;

  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return;

  const message: SlackMessage = {
    text: `\u26A1 High-value signal: ${signalType} from ${actorName || 'unknown'} at ${accountName || 'unknown account'}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\u26A1 *${signalType.replace(/_/g, ' ').toUpperCase()}*\n${actorName ? `Actor: *${actorName}*` : ''}${accountName ? `\nAccount: *${accountName}*` : ''}`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Sigscore \u2022 ${new Date().toLocaleString()}` },
        ],
      },
    ],
  };

  await sendSlackMessage(webhookUrl, message);
}

// ---------------------------------------------------------------------------
// Public API: send a test message
// ---------------------------------------------------------------------------

export async function sendTestMessage(webhookUrl: string): Promise<boolean> {
  const message: SlackMessage = {
    text: 'Sigscore test notification - your Slack integration is working!',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '\u2705 Sigscore Connected', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Your Slack integration is configured correctly. You will receive notifications here when:\n\u2022 An account changes PQA tier (e.g. COLD \u2192 WARM \u2192 HOT)\n\u2022 A new HOT account is detected\n\u2022 High-value signals are received (signups, installs, PR merges)\n\u2022 New contacts sign up\n\u2022 Deals change stage\n\nRich alerts include interactive buttons to claim accounts, snooze, and more.',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Sigscore \u2022 ${new Date().toISOString().split('T')[0]}` },
        ],
      },
    ],
  };

  return sendSlackMessage(webhookUrl, message);
}

// ---------------------------------------------------------------------------
// NEW: Rich alert senders (Block Kit with interactive buttons)
// ---------------------------------------------------------------------------

/**
 * Send a rich HOT account alert with action buttons.
 * Fire-and-forget — callers should .catch(() => {}).
 */
export async function sendAccountAlert(
  organizationId: string,
  companyId: string,
): Promise<void> {
  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return;

  const richEnabled = await isRichAlertsEnabled(organizationId);
  if (!richEnabled) return; // Only send if rich alerts are turned on

  const alertEnabled = await isAlertTypeEnabled(organizationId, 'hot_accounts');
  if (!alertEnabled) return;

  // Check snooze
  const snoozed = await isAccountSnoozed(organizationId, companyId);
  if (snoozed) return;

  // Fetch account data
  const company = await prisma.company.findFirst({
    where: { id: companyId, organizationId },
    select: { id: true, name: true },
  });
  if (!company) return;

  const score = await prisma.accountScore.findFirst({
    where: { accountId: companyId, organizationId },
    select: { score: true, tier: true, trend: true, signalCount: true },
  });
  if (!score) return;

  // Get the most recent signal type
  const lastSignal = await prisma.signal.findFirst({
    where: { accountId: companyId, organizationId },
    orderBy: { timestamp: 'desc' },
    select: { type: true },
  });

  const frontendUrl = getFrontendUrl();
  const message = buildAccountHotAlert({
    companyName: company.name,
    score: score.score,
    tier: score.tier,
    trend: score.trend,
    signalCount: score.signalCount,
    topSignal: lastSignal?.type || 'N/A',
    accountUrl: `${frontendUrl}/companies/${company.id}`,
    accountId: company.id,
  });

  await sendSlackBlockMessage(webhookUrl, message);
}

/**
 * Send a rich new signup alert.
 * Fire-and-forget — callers should .catch(() => {}).
 */
export async function sendSignupAlert(
  organizationId: string,
  contactId: string,
): Promise<void> {
  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return;

  const richEnabled = await isRichAlertsEnabled(organizationId);
  if (!richEnabled) return;

  const alertEnabled = await isAlertTypeEnabled(organizationId, 'new_signups');
  if (!alertEnabled) return;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      company: { select: { name: true } },
    },
  });
  if (!contact) return;

  const frontendUrl = getFrontendUrl();
  const message = buildSignupAlert({
    contactName: `${contact.firstName} ${contact.lastName}`,
    email: contact.email,
    companyName: contact.company?.name || null,
    contactId: contact.id,
    contactUrl: `${frontendUrl}/contacts/${contact.id}`,
  });

  await sendSlackBlockMessage(webhookUrl, message);
}

/**
 * Send a rich deal stage change alert.
 * Fire-and-forget — callers should .catch(() => {}).
 */
export async function sendDealAlert(
  organizationId: string,
  dealId: string,
  oldStage: string,
  newStage: string,
): Promise<void> {
  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return;

  const richEnabled = await isRichAlertsEnabled(organizationId);
  if (!richEnabled) return;

  const alertEnabled = await isAlertTypeEnabled(organizationId, 'deal_changes');
  if (!alertEnabled) return;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, organizationId },
    select: {
      id: true,
      title: true,
      amount: true,
      company: { select: { name: true } },
    },
  });
  if (!deal) return;

  const frontendUrl = getFrontendUrl();
  const message = buildDealStageChange({
    dealTitle: deal.title,
    oldStage,
    newStage,
    amount: deal.amount,
    companyName: deal.company?.name || null,
    dealId: deal.id,
    dealUrl: `${frontendUrl}/deals/${deal.id}`,
  });

  await sendSlackBlockMessage(webhookUrl, message);
}

/**
 * Send a rich workflow failure alert.
 * Fire-and-forget — callers should .catch(() => {}).
 */
export async function sendWorkflowFailedAlert(
  organizationId: string,
  workflowId: string,
  workflowName: string,
  actionType: string,
  errorMessage: string,
): Promise<void> {
  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return;

  const richEnabled = await isRichAlertsEnabled(organizationId);
  if (!richEnabled) return;

  const alertEnabled = await isAlertTypeEnabled(organizationId, 'workflow_failures');
  if (!alertEnabled) return;

  const frontendUrl = getFrontendUrl();
  const message = buildWorkflowFailed({
    workflowName,
    actionType,
    errorMessage,
    workflowId,
    workflowUrl: `${frontendUrl}/workflows/${workflowId}`,
  });

  await sendSlackBlockMessage(webhookUrl, message);
}
