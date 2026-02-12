import { logger } from '../utils/logger';
import { prisma } from '../config/database';

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: Array<{ type: string; text: string }>;
  elements?: Array<{ type: string; text: string }>;
  accessory?: Record<string, unknown>;
}

interface SlackMessage {
  text: string; // fallback
  blocks: SlackBlock[];
}

// Tier change direction
function tierDirection(oldTier: string, newTier: string): 'upgraded' | 'downgraded' | 'changed' {
  const tierOrder = ['INACTIVE', 'COLD', 'WARM', 'HOT'];
  const oldIdx = tierOrder.indexOf(oldTier);
  const newIdx = tierOrder.indexOf(newTier);
  if (newIdx > oldIdx) return 'upgraded';
  if (newIdx < oldIdx) return 'downgraded';
  return 'changed';
}

// Tier emoji
function tierEmoji(tier: string): string {
  switch (tier) {
    case 'HOT': return '\uD83D\uDD25';
    case 'WARM': return '\uD83D\uDFE0';
    case 'COLD': return '\uD83D\uDD35';
    case 'INACTIVE': return '\u26AA';
    default: return '\u26AA';
  }
}

// Build Slack message for tier change
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
          { type: 'mrkdwn', text: `DevSignal \u2022 ${new Date().toISOString().split('T')[0]}` },
        ],
      },
    ],
  };
}

// Build Slack message for new HOT account
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
          { type: 'mrkdwn', text: 'DevSignal \u2022 Take action before they go cold!' },
        ],
      },
    ],
  };
}

// Send to Slack webhook
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

// Get Slack webhook URL from organization settings
async function getSlackWebhookUrl(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = org?.settings as Record<string, unknown> | null;
  return (settings?.slackWebhookUrl as string) || null;
}

// Public API: notify on tier change
export async function notifyTierChange(
  organizationId: string,
  accountName: string,
  oldTier: string,
  newTier: string,
  score: number,
  signalCount: number,
  userCount: number,
): Promise<void> {
  if (oldTier === newTier) return; // No change

  const webhookUrl = await getSlackWebhookUrl(organizationId);
  if (!webhookUrl) return; // Slack not configured

  const message = buildTierChangeMessage(accountName, oldTier, newTier, score, signalCount, userCount);
  await sendSlackMessage(webhookUrl, message);

  // Also send a special message for new HOT accounts
  if (newTier === 'HOT' && oldTier !== 'HOT') {
    const hotMessage = buildHotAccountMessage(accountName, score, signalCount);
    await sendSlackMessage(webhookUrl, hotMessage);
  }
}

// Public API: notify on high-value signal
export async function notifyHighValueSignal(
  organizationId: string,
  signalType: string,
  accountName: string | null,
  actorName: string | null,
  _metadata: Record<string, unknown>,
): Promise<void> {
  // Only notify for high-value signal types
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
          { type: 'mrkdwn', text: `DevSignal \u2022 ${new Date().toLocaleString()}` },
        ],
      },
    ],
  };

  await sendSlackMessage(webhookUrl, message);
}

// Public API: send a test message
export async function sendTestMessage(webhookUrl: string): Promise<boolean> {
  const message: SlackMessage = {
    text: 'DevSignal test notification - your Slack integration is working!',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '\u2705 DevSignal Connected', emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Your Slack integration is configured correctly. You will receive notifications here when:\n\u2022 An account changes PQA tier (e.g. COLD \u2192 WARM \u2192 HOT)\n\u2022 A new HOT account is detected\n\u2022 High-value signals are received (signups, installs, PR merges)',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `DevSignal \u2022 ${new Date().toISOString().split('T')[0]}` },
        ],
      },
    ],
  };

  return sendSlackMessage(webhookUrl, message);
}
