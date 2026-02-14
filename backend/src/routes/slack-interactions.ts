/**
 * Slack Interactions Handler
 *
 * Receives interaction payloads from Slack when users click buttons
 * in Block Kit messages. Slack sends these as application/x-www-form-urlencoded
 * with a `payload` JSON string.
 *
 * Route: POST /api/v1/webhooks/slack/interactions
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { Prisma } from '@prisma/client';

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackInteractionPayload {
  type: string;
  user: { id: string; username: string; name: string };
  actions: Array<{
    action_id: string;
    block_id: string;
    value: string;
    type: string;
  }>;
  trigger_id: string;
  response_url: string;
  team: { id: string; domain: string };
  channel: { id: string; name: string };
  message: {
    ts: string;
    blocks: unknown[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

/**
 * Verify the request came from Slack using the signing secret.
 * Returns true if the signature is valid or if signing secret is not configured
 * (dev mode).
 */
function verifySlackSignature(req: Request): boolean {
  if (!SLACK_SIGNING_SECRET) {
    logger.warn('SLACK_SIGNING_SECRET not set -- skipping signature verification (dev mode)');
    return true;
  }

  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  const slackSignature = req.headers['x-slack-signature'] as string;

  if (!timestamp || !slackSignature) return false;

  // Reject requests older than 5 minutes (replay protection)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
  if (parseInt(timestamp, 10) < fiveMinutesAgo) return false;

  const rawBody = typeof req.body === 'string' ? req.body : '';
  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac('sha256', SLACK_SIGNING_SECRET)
    .update(sigBase)
    .digest('hex');
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(slackSignature));
}

/**
 * Post an ephemeral response back to the response_url provided by Slack.
 */
async function respondToSlack(
  responseUrl: string,
  text: string,
  replaceOriginal = false,
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: replaceOriginal,
        text,
      }),
    });
  } catch (err) {
    logger.error('Failed to respond to Slack', { err });
  }
}

/**
 * Resolve a Slack user ID to a DevSignal user ID via the org's slackUserMap.
 */
async function resolveSlackUser(
  slackUserId: string,
  organizationId: string,
): Promise<string | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = org?.settings as Record<string, unknown> | null;
  const userMap = (settings?.slackUserMap || {}) as Record<string, string>;
  return userMap[slackUserId] || null;
}

/**
 * Find the organization associated with a Slack team ID by scanning org settings.
 * In production, you'd index this. For now a simple scan works.
 */
async function findOrgBySlackTeam(slackTeamId: string): Promise<string | null> {
  const orgs = await prisma.organization.findMany({
    select: { id: true, settings: true },
  });
  for (const org of orgs) {
    const settings = org.settings as Record<string, unknown> | null;
    if (settings?.slackTeamId === slackTeamId) return org.id;
    // Also check if the org has a slackWebhookUrl (fallback: first org with Slack)
    if (settings?.slackWebhookUrl && !settings?.slackTeamId) return org.id;
  }
  return orgs.length === 1 ? orgs[0].id : null;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleClaimAccount(
  accountId: string,
  slackUserId: string,
  organizationId: string,
  responseUrl: string,
): Promise<void> {
  const userId = await resolveSlackUser(slackUserId, organizationId);

  // Verify the account exists
  const company = await prisma.company.findFirst({
    where: { id: accountId, organizationId },
    select: { id: true, name: true },
  });

  if (!company) {
    await respondToSlack(responseUrl, 'Account not found.');
    return;
  }

  // Check if a deal already exists for this company
  const existing = await prisma.deal.findFirst({
    where: { companyId: accountId, organizationId },
    select: { id: true, title: true },
  });

  if (existing) {
    await respondToSlack(
      responseUrl,
      `A deal already exists for ${company.name}: "${existing.title}"`,
    );
    return;
  }

  // Create a new deal
  await prisma.deal.create({
    data: {
      title: `${company.name} - Inbound`,
      stage: 'IDENTIFIED',
      organization: { connect: { id: organizationId } },
      company: { connect: { id: accountId } },
      ...(userId ? { owner: { connect: { id: userId } } } : {}),
    },
  });

  const claimedBy = userId ? 'you' : `Slack user ${slackUserId}`;
  await respondToSlack(responseUrl, `Account "${company.name}" claimed by ${claimedBy}. A new deal has been created.`);
}

async function handleSnoozeAccount(
  accountId: string,
  organizationId: string,
  responseUrl: string,
): Promise<void> {
  // Verify the account exists
  const company = await prisma.company.findFirst({
    where: { id: accountId, organizationId },
    select: { id: true, name: true },
  });

  if (!company) {
    await respondToSlack(responseUrl, 'Account not found.');
    return;
  }

  // Create or find the "snoozed" tag
  const tag = await prisma.tag.upsert({
    where: { organizationId_name: { organizationId, name: 'snoozed' } },
    create: {
      name: 'snoozed',
      color: '#9CA3AF',
      organization: { connect: { id: organizationId } },
    },
    update: {},
  });

  // Add the tag to the company (ignore if already exists)
  await prisma.companyTag.upsert({
    where: { companyId_tagId: { companyId: accountId, tagId: tag.id } },
    create: { companyId: accountId, tagId: tag.id },
    update: {},
  });

  // Store snooze expiry in org settings under snoozedAccounts
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = (org?.settings as Record<string, unknown>) || {};
  const snoozed = (settings.snoozedAccounts || {}) as Record<string, string>;
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  snoozed[accountId] = expiry;

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...settings,
        snoozedAccounts: snoozed,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await respondToSlack(responseUrl, `"${company.name}" snoozed for 7 days. Alerts will be suppressed until ${expiry.split('T')[0]}.`);
}

async function handleViewAccount(
  accountId: string,
  organizationId: string,
  responseUrl: string,
): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { id: accountId, organizationId },
    select: { id: true, name: true, domain: true, industry: true, size: true },
  });

  if (!company) {
    await respondToSlack(responseUrl, 'Account not found.');
    return;
  }

  const score = await prisma.accountScore.findFirst({
    where: { accountId, organizationId },
    select: { score: true, tier: true, signalCount: true, userCount: true, trend: true },
  });

  const lines = [
    `*${company.name}*`,
    company.domain ? `Domain: ${company.domain}` : null,
    company.industry ? `Industry: ${company.industry}` : null,
    company.size ? `Size: ${company.size}` : null,
    score ? `PQA Score: ${score.score}/100 (${score.tier})` : null,
    score ? `Signals: ${score.signalCount} | Users: ${score.userCount} | Trend: ${score.trend}` : null,
  ].filter(Boolean).join('\n');

  await respondToSlack(responseUrl, lines);
}

async function handleDismiss(responseUrl: string): Promise<void> {
  // Replace the original message with a dismissed confirmation
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response_type: 'ephemeral',
        replace_original: true,
        text: '\u2705 Dismissed',
      }),
    });
  } catch (err) {
    logger.error('Failed to dismiss Slack message', { err });
  }
}

// ---------------------------------------------------------------------------
// Main route
// ---------------------------------------------------------------------------

/**
 * Slack sends interaction payloads as application/x-www-form-urlencoded.
 * The body is already parsed by express.urlencoded() in app.ts and arrives
 * as req.body.payload (a JSON string).
 *
 * However, for signature verification we need the raw body. To keep things
 * simple and compatible, we verify when SLACK_SIGNING_SECRET is set and
 * rely on express.urlencoded having already parsed the body.
 */
router.post('/interactions', async (req: Request, res: Response): Promise<void> => {
  try {
    // Signature verification
    if (!verifySlackSignature(req)) {
      logger.warn('Invalid Slack signature on interaction request');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Parse the payload
    const payloadStr = req.body?.payload;
    if (!payloadStr) {
      res.status(400).json({ error: 'Missing payload' });
      return;
    }

    let payload: SlackInteractionPayload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      res.status(400).json({ error: 'Invalid payload JSON' });
      return;
    }

    // Respond 200 immediately so Slack doesn't retry
    res.status(200).json({ ok: true });

    // Process actions asynchronously
    const action = payload.actions?.[0];
    if (!action) return;

    const slackUserId = payload.user.id;
    const slackTeamId = payload.team?.id;
    const responseUrl = payload.response_url;

    // Resolve the organization from the Slack team
    const organizationId = await findOrgBySlackTeam(slackTeamId);
    if (!organizationId) {
      await respondToSlack(responseUrl, 'Could not find a DevSignal organization linked to this Slack workspace.');
      return;
    }

    switch (action.action_id) {
      case 'claim_account':
        await handleClaimAccount(action.value, slackUserId, organizationId, responseUrl);
        break;

      case 'snooze_account':
        await handleSnoozeAccount(action.value, organizationId, responseUrl);
        break;

      case 'view_account':
        await handleViewAccount(action.value, organizationId, responseUrl);
        break;

      case 'dismiss':
        await handleDismiss(responseUrl);
        break;

      // Button clicks with URLs (view_contact, view_deal, view_workflow, open_dashboard)
      // are handled client-side by Slack -- they just open the URL.
      // No server-side handling needed.
      default:
        logger.info('Unhandled Slack action', { actionId: action.action_id });
        break;
    }
  } catch (error) {
    logger.error('Slack interaction handler error', { error });
    // Already sent 200, so nothing more we can do for this request
  }
});

export default router;
