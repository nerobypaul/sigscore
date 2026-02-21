/**
 * Alert Evaluation Engine
 *
 * Evaluates AccountAlertRules against account state and fires notifications
 * through the configured channels (in-app, email, Slack).
 *
 * Triggered in two ways:
 * 1. After score recomputation — evaluates score-based rules for the affected account
 * 2. Periodic cron (alert-check-cron.ts) — evaluates time-based rules (engagement_drop, account_inactive)
 */

import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { notifyOrgUsers } from '../services/notifications';
import { sendEmail } from '../services/email-sender';
import { getSlackWebhookUrl, sendSlackBlockMessage } from '../services/slack-notifications';
import type { AccountAlertRule } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertConditions {
  threshold?: number;
  dropPercent?: number;
  risePercent?: number;
  withinDays?: number;
  inactiveDays?: number;
  direction?: 'above' | 'below';
  sourceTypes?: string[];
}

interface AlertChannels {
  inApp?: boolean;
  email?: boolean;
  slack?: boolean;
  slackChannel?: string;
}

interface EvaluationContext {
  organizationId: string;
  accountId: string;
  newScore: number;
  oldScore: number | null;
}

interface EvaluationResult {
  triggered: boolean;
  reason?: string;
}

// Cooldown period: 1 hour between re-firing the same rule for the same account
const COOLDOWN_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Core evaluation: determine if a rule should fire
// ---------------------------------------------------------------------------

async function evaluateRule(
  rule: AccountAlertRule,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const conditions = rule.conditions as unknown as AlertConditions;

  switch (rule.triggerType) {
    case 'score_drop':
      return evaluateScoreDrop(conditions, ctx);

    case 'score_rise':
      return evaluateScoreRise(conditions, ctx);

    case 'score_threshold':
      return evaluateScoreThreshold(conditions, ctx);

    case 'engagement_drop':
      return evaluateEngagementDrop(conditions, ctx);

    case 'new_hot_signal':
      return evaluateNewHotSignal(conditions, ctx);

    case 'account_inactive':
      return evaluateAccountInactive(conditions, ctx);

    default:
      logger.warn('Unknown alert trigger type', { triggerType: rule.triggerType, ruleId: rule.id });
      return { triggered: false };
  }
}

// ---------------------------------------------------------------------------
// Evaluators for each trigger type
// ---------------------------------------------------------------------------

/**
 * score_drop: Compare current score vs score N days ago.
 * Fires if the score has dropped by at least `dropPercent` within `withinDays`.
 */
async function evaluateScoreDrop(
  conditions: AlertConditions,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const dropPercent = conditions.dropPercent ?? 10;
  const withinDays = conditions.withinDays ?? 7;

  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  // Get the oldest snapshot within the window to compare against
  const historicalSnapshot = await prisma.scoreSnapshot.findFirst({
    where: {
      companyId: ctx.accountId,
      organizationId: ctx.organizationId,
      capturedAt: { gte: since },
    },
    orderBy: { capturedAt: 'asc' },
    select: { score: true },
  });

  if (!historicalSnapshot) {
    // No historical data to compare against — use oldScore from context if available
    if (ctx.oldScore !== null) {
      const actualDropPct = ((ctx.oldScore - ctx.newScore) / ctx.oldScore) * 100;
      if (actualDropPct >= dropPercent) {
        return {
          triggered: true,
          reason: `Score dropped ${Math.round(actualDropPct)}% (from ${ctx.oldScore} to ${ctx.newScore})`,
        };
      }
    }
    return { triggered: false };
  }

  const baseScore = historicalSnapshot.score;
  if (baseScore <= 0) return { triggered: false };

  const actualDropPct = ((baseScore - ctx.newScore) / baseScore) * 100;

  if (actualDropPct >= dropPercent) {
    return {
      triggered: true,
      reason: `Score dropped ${Math.round(actualDropPct)}% (from ${baseScore} to ${ctx.newScore}) over the last ${withinDays} days`,
    };
  }

  return { triggered: false };
}

/**
 * score_rise: Compare current score vs score N days ago.
 * Fires if the score has risen by at least `risePercent` within `withinDays`.
 */
async function evaluateScoreRise(
  conditions: AlertConditions,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const risePercent = conditions.risePercent ?? 10;
  const withinDays = conditions.withinDays ?? 7;

  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  const historicalSnapshot = await prisma.scoreSnapshot.findFirst({
    where: {
      companyId: ctx.accountId,
      organizationId: ctx.organizationId,
      capturedAt: { gte: since },
    },
    orderBy: { capturedAt: 'asc' },
    select: { score: true },
  });

  if (!historicalSnapshot) {
    if (ctx.oldScore !== null && ctx.oldScore > 0) {
      const actualRisePct = ((ctx.newScore - ctx.oldScore) / ctx.oldScore) * 100;
      if (actualRisePct >= risePercent) {
        return {
          triggered: true,
          reason: `Score rose ${Math.round(actualRisePct)}% (from ${ctx.oldScore} to ${ctx.newScore})`,
        };
      }
    }
    return { triggered: false };
  }

  const baseScore = historicalSnapshot.score;
  if (baseScore <= 0) return { triggered: false };

  const actualRisePct = ((ctx.newScore - baseScore) / baseScore) * 100;

  if (actualRisePct >= risePercent) {
    return {
      triggered: true,
      reason: `Score rose ${Math.round(actualRisePct)}% (from ${baseScore} to ${ctx.newScore}) over the last ${withinDays} days`,
    };
  }

  return { triggered: false };
}

/**
 * score_threshold: Check if score crossed above or below a threshold.
 * Only fires on transitions (was below, now above — or vice versa).
 */
async function evaluateScoreThreshold(
  conditions: AlertConditions,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const threshold = conditions.threshold ?? 70;
  const direction = conditions.direction ?? 'above';

  if (ctx.oldScore === null) {
    // First computation — treat as a transition if the score already meets the condition
    if (direction === 'above' && ctx.newScore >= threshold) {
      return {
        triggered: true,
        reason: `Score (${ctx.newScore}) is above threshold (${threshold})`,
      };
    }
    if (direction === 'below' && ctx.newScore <= threshold) {
      return {
        triggered: true,
        reason: `Score (${ctx.newScore}) is below threshold (${threshold})`,
      };
    }
    return { triggered: false };
  }

  // Only fire on transitions
  if (direction === 'above') {
    if (ctx.oldScore < threshold && ctx.newScore >= threshold) {
      return {
        triggered: true,
        reason: `Score crossed above threshold ${threshold} (was ${ctx.oldScore}, now ${ctx.newScore})`,
      };
    }
  } else {
    if (ctx.oldScore > threshold && ctx.newScore <= threshold) {
      return {
        triggered: true,
        reason: `Score crossed below threshold ${threshold} (was ${ctx.oldScore}, now ${ctx.newScore})`,
      };
    }
  }

  return { triggered: false };
}

/**
 * engagement_drop: Check if no signals received for N days.
 * This is typically evaluated by the cron job, not by score changes.
 */
async function evaluateEngagementDrop(
  conditions: AlertConditions,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const inactiveDays = conditions.inactiveDays ?? 7;

  const since = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

  const recentSignalCount = await prisma.signal.count({
    where: {
      accountId: ctx.accountId,
      organizationId: ctx.organizationId,
      timestamp: { gte: since },
    },
  });

  if (recentSignalCount === 0) {
    // Verify the account had signals before the window (so we only alert on actual drops)
    const totalSignals = await prisma.signal.count({
      where: {
        accountId: ctx.accountId,
        organizationId: ctx.organizationId,
      },
    });

    if (totalSignals > 0) {
      return {
        triggered: true,
        reason: `No signals received in the last ${inactiveDays} days (account had ${totalSignals} total signals)`,
      };
    }
  }

  return { triggered: false };
}

/**
 * new_hot_signal: Check if a recent signal matches the source type filter.
 * Fires when the most recent signal's type matches one of the configured sourceTypes.
 */
async function evaluateNewHotSignal(
  conditions: AlertConditions,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const sourceTypes = conditions.sourceTypes ?? [];
  if (sourceTypes.length === 0) return { triggered: false };

  // Check for signals in the last 10 minutes (to avoid re-alerting on old signals)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  const recentSignal = await prisma.signal.findFirst({
    where: {
      accountId: ctx.accountId,
      organizationId: ctx.organizationId,
      type: { in: sourceTypes },
      timestamp: { gte: tenMinutesAgo },
    },
    orderBy: { timestamp: 'desc' },
    select: { type: true, timestamp: true },
  });

  if (recentSignal) {
    return {
      triggered: true,
      reason: `New signal of type "${recentSignal.type}" detected`,
    };
  }

  return { triggered: false };
}

/**
 * account_inactive: Check if no activity for N days across all signals.
 * Similar to engagement_drop but checks for complete inactivity.
 */
async function evaluateAccountInactive(
  conditions: AlertConditions,
  ctx: EvaluationContext,
): Promise<EvaluationResult> {
  const inactiveDays = conditions.inactiveDays ?? 14;

  const lastSignal = await prisma.signal.findFirst({
    where: {
      accountId: ctx.accountId,
      organizationId: ctx.organizationId,
    },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });

  if (!lastSignal) return { triggered: false };

  const daysSinceLastSignal = (Date.now() - lastSignal.timestamp.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastSignal >= inactiveDays) {
    return {
      triggered: true,
      reason: `Account has been inactive for ${Math.round(daysSinceLastSignal)} days (threshold: ${inactiveDays} days)`,
    };
  }

  return { triggered: false };
}

// ---------------------------------------------------------------------------
// Notification dispatch: fire through configured channels
// ---------------------------------------------------------------------------

async function dispatchAlert(
  rule: AccountAlertRule,
  ctx: EvaluationContext,
  reason: string,
): Promise<void> {
  const channels = rule.channels as unknown as AlertChannels;

  // Look up the account name for the notification
  const account = await prisma.company.findFirst({
    where: { id: ctx.accountId, organizationId: ctx.organizationId },
    select: { name: true },
  });
  const accountName = account?.name ?? 'Unknown Account';

  const alertTitle = `Alert: ${rule.name}`;
  const alertBody = `${accountName} - ${reason}`;

  // 1. In-app notification (to all org users)
  if (channels.inApp !== false) {
    try {
      await notifyOrgUsers(ctx.organizationId, {
        type: 'account_alert',
        title: alertTitle,
        body: alertBody,
        entityType: 'company',
        entityId: ctx.accountId,
      });
    } catch (err) {
      logger.error('Failed to create in-app alert notification', {
        ruleId: rule.id,
        accountId: ctx.accountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 2. Email notification (to all org members)
  if (channels.email) {
    try {
      const members = await prisma.userOrganization.findMany({
        where: { organizationId: ctx.organizationId },
        include: { user: { select: { email: true, firstName: true } } },
      });

      const emails = members
        .map((m) => m.user.email)
        .filter((e): e is string => !!e);

      for (const email of emails) {
        await sendEmail({
          to: email,
          subject: `[Sigscore Alert] ${rule.name} - ${accountName}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4F46E5;">Alert Triggered: ${rule.name}</h2>
              <p><strong>Account:</strong> ${accountName}</p>
              <p><strong>Condition:</strong> ${rule.triggerType.replace(/_/g, ' ')}</p>
              <p><strong>Details:</strong> ${reason}</p>
              <p><strong>Current Score:</strong> ${ctx.newScore}/100</p>
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 16px 0;" />
              <p style="color: #6B7280; font-size: 12px;">
                This alert was triggered by the "${rule.name}" rule in Sigscore.
                You can manage your alert rules in Settings.
              </p>
            </div>
          `,
        }).catch((err) => {
          logger.error('Failed to send alert email', {
            ruleId: rule.id,
            email,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (err) {
      logger.error('Failed to send alert emails', {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 3. Slack notification
  if (channels.slack) {
    try {
      const webhookUrl = await getSlackWebhookUrl(ctx.organizationId);
      if (webhookUrl) {
        await sendSlackBlockMessage(webhookUrl, {
          text: `${alertTitle}: ${alertBody}`,
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `Alert: ${rule.name}`, emoji: true },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${accountName}*\n${reason}`,
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Trigger:*\n${rule.triggerType.replace(/_/g, ' ')}` },
                { type: 'mrkdwn', text: `*Score:*\n${ctx.newScore}/100` },
              ],
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `Sigscore Alert Rule \u2022 ${new Date().toISOString().split('T')[0]}` },
              ],
            },
          ],
        });
      }
    } catch (err) {
      logger.error('Failed to send Slack alert', {
        ruleId: rule.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API: evaluate alerts for a specific account after score change
// ---------------------------------------------------------------------------

/**
 * Evaluate all active alert rules for an account after its score has been
 * recomputed. Called by the alert-evaluation BullMQ worker.
 */
export async function evaluateAlertsForAccount(
  ctx: EvaluationContext,
): Promise<{ evaluated: number; triggered: number }> {
  // Load all active alert rules for the organization
  const rules = await prisma.accountAlertRule.findMany({
    where: {
      organizationId: ctx.organizationId,
      enabled: true,
    },
  });

  if (rules.length === 0) {
    return { evaluated: 0, triggered: 0 };
  }

  let triggered = 0;

  for (const rule of rules) {
    try {
      // Cooldown check: don't re-fire the same rule within the cooldown window
      if (rule.lastTriggeredAt) {
        const elapsed = Date.now() - rule.lastTriggeredAt.getTime();
        if (elapsed < COOLDOWN_MS) {
          logger.debug('Alert rule skipped (cooldown)', {
            ruleId: rule.id,
            elapsed,
            cooldown: COOLDOWN_MS,
          });
          continue;
        }
      }

      const result = await evaluateRule(rule, ctx);

      if (result.triggered && result.reason) {
        logger.info('Alert rule triggered', {
          ruleId: rule.id,
          ruleName: rule.name,
          accountId: ctx.accountId,
          triggerType: rule.triggerType,
          reason: result.reason,
        });

        // Dispatch notifications through configured channels
        await dispatchAlert(rule, ctx, result.reason);

        // Update lastTriggeredAt on the rule
        await prisma.accountAlertRule.update({
          where: { id: rule.id },
          data: { lastTriggeredAt: new Date() },
        });

        triggered++;
      }
    } catch (err) {
      logger.error('Error evaluating alert rule', {
        ruleId: rule.id,
        accountId: ctx.accountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { evaluated: rules.length, triggered };
}

// ---------------------------------------------------------------------------
// Public API: evaluate time-based alerts for all accounts in an org
// ---------------------------------------------------------------------------

/**
 * Evaluate engagement_drop and account_inactive rules across all accounts
 * in an organization. Called by the periodic cron job (alert-check-cron.ts).
 */
export async function evaluateTimeBasedAlerts(
  organizationId: string,
): Promise<{ evaluated: number; triggered: number }> {
  // Load time-based rules only
  const rules = await prisma.accountAlertRule.findMany({
    where: {
      organizationId,
      enabled: true,
      triggerType: { in: ['engagement_drop', 'account_inactive'] },
    },
  });

  if (rules.length === 0) {
    return { evaluated: 0, triggered: 0 };
  }

  // Get all accounts with scores in this org
  const accounts = await prisma.accountScore.findMany({
    where: { organizationId },
    select: { accountId: true, score: true },
  });

  if (accounts.length === 0) {
    return { evaluated: 0, triggered: 0 };
  }

  let totalTriggered = 0;
  let totalEvaluated = 0;

  for (const account of accounts) {
    const ctx: EvaluationContext = {
      organizationId,
      accountId: account.accountId,
      newScore: account.score,
      oldScore: null,
    };

    for (const rule of rules) {
      totalEvaluated++;

      try {
        // Cooldown check
        if (rule.lastTriggeredAt) {
          const elapsed = Date.now() - rule.lastTriggeredAt.getTime();
          if (elapsed < COOLDOWN_MS) {
            continue;
          }
        }

        const result = await evaluateRule(rule, ctx);

        if (result.triggered && result.reason) {
          logger.info('Time-based alert rule triggered', {
            ruleId: rule.id,
            ruleName: rule.name,
            accountId: account.accountId,
            triggerType: rule.triggerType,
            reason: result.reason,
          });

          await dispatchAlert(rule, ctx, result.reason);

          await prisma.accountAlertRule.update({
            where: { id: rule.id },
            data: { lastTriggeredAt: new Date() },
          });

          totalTriggered++;
        }
      } catch (err) {
        logger.error('Error evaluating time-based alert rule', {
          ruleId: rule.id,
          accountId: account.accountId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { evaluated: totalEvaluated, triggered: totalTriggered };
}
