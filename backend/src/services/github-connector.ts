import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { resolveGitHubActor } from './identity-resolution';

// Map GitHub event types to DevSignal signal types
const EVENT_MAP: Record<string, string> = {
  'star.created': 'repo_star',
  'star.deleted': 'repo_unstar',
  'fork': 'repo_fork',
  'issues.opened': 'issue_opened',
  'issues.closed': 'issue_closed',
  'pull_request.opened': 'pr_opened',
  'pull_request.closed': 'pr_merged', // default for closed; overridden below if not actually merged
  'push': 'code_push',
  'watch': 'repo_watch',
  'release.published': 'release_published',
  'installation.created': 'app_installed',
  'installation.deleted': 'app_uninstalled',
};

/**
 * Verifies a GitHub webhook HMAC-SHA256 signature using timing-safe comparison.
 * Returns true if the signature is valid, false otherwise.
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  // Both buffers must be the same length for timingSafeEqual
  const digestBuf = Buffer.from(digest);
  const signatureBuf = Buffer.from(signature);

  if (digestBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(digestBuf, signatureBuf);
}

interface GitHubWebhookResult {
  signalType: string;
  actorGithub: string;
  actorEmail?: string;
  accountGithubOrg?: string;
  metadata: Record<string, unknown>;
}

/**
 * Parses a GitHub webhook event into a normalized DevSignal result.
 * Returns null if the event type is not tracked.
 */
export function parseGitHubEvent(
  eventType: string,
  action: string | undefined,
  payload: Record<string, unknown>,
): GitHubWebhookResult | null {
  // Build the full event key (e.g., "star.created", "issues.opened")
  const eventKey = action ? `${eventType}.${action}` : eventType;

  // Special case: pull_request.closed with merged=true should be pr_merged,
  // while pull_request.closed with merged=false should be pr_closed
  let signalType = EVENT_MAP[eventKey];
  if (eventType === 'pull_request' && action === 'closed') {
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    signalType = pr?.merged ? 'pr_merged' : 'pr_closed';
  }

  // Fall back to the base event type if no action-specific mapping found
  if (!signalType && !EVENT_MAP[eventType]) {
    return null; // Unknown event type, skip
  }
  signalType = signalType || EVENT_MAP[eventType];

  const sender = payload.sender as Record<string, unknown> | undefined;
  const repo = payload.repository as Record<string, unknown> | undefined;
  const org = payload.organization as Record<string, unknown> | undefined;
  const repoOwner = repo?.owner as Record<string, unknown> | undefined;

  return {
    signalType,
    actorGithub: (sender?.login as string) || 'unknown',
    actorEmail: (sender?.email as string) || undefined,
    accountGithubOrg:
      (org?.login as string) ||
      (repoOwner?.login as string) ||
      undefined,
    metadata: {
      github_event: eventKey,
      repo_name: repo?.full_name,
      repo_url: repo?.html_url,
      sender_login: sender?.login,
      sender_avatar: sender?.avatar_url,
      sender_url: sender?.html_url,
      // Event-specific fields
      ...(eventType === 'star' ? { action } : {}),
      ...(eventType === 'issues'
        ? {
            issue_number: (payload.issue as Record<string, unknown>)?.number,
            issue_title: (payload.issue as Record<string, unknown>)?.title,
            issue_url: (payload.issue as Record<string, unknown>)?.html_url,
          }
        : {}),
      ...(eventType === 'pull_request'
        ? {
            pr_number: (payload.pull_request as Record<string, unknown>)
              ?.number,
            pr_title: (payload.pull_request as Record<string, unknown>)
              ?.title,
            pr_url: (payload.pull_request as Record<string, unknown>)
              ?.html_url,
            pr_merged: (payload.pull_request as Record<string, unknown>)
              ?.merged,
          }
        : {}),
      ...(eventType === 'push'
        ? {
            ref: payload.ref,
            commits_count: (payload.commits as unknown[] | undefined)?.length,
          }
        : {}),
      ...(eventType === 'release'
        ? {
            release_tag: (payload.release as Record<string, unknown>)
              ?.tag_name,
            release_name: (payload.release as Record<string, unknown>)?.name,
          }
        : {}),
    },
  };
}

/**
 * Processes a GitHub webhook event end-to-end:
 * 1. Parses the event into a normalized signal
 * 2. Resolves the actor (Contact) by GitHub username
 * 3. Resolves the account (Company) by GitHub org
 * 4. Creates a Signal record with idempotency key
 *
 * Returns { processed: false } for untracked event types.
 */
export async function processGitHubWebhook(
  organizationId: string,
  sourceId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<{ processed: boolean; signalId?: string; signalType?: string }> {
  const action = payload.action as string | undefined;
  const parsed = parseGitHubEvent(eventType, action, payload);

  if (!parsed) {
    return { processed: false };
  }

  // Use identity resolution engine for comprehensive actor/account matching
  let actorId: string | undefined;
  let accountId: string | undefined;

  if (parsed.actorGithub && parsed.actorGithub !== 'unknown') {
    try {
      const resolved = await resolveGitHubActor(
        organizationId,
        parsed.actorGithub,
        parsed.actorEmail,
        undefined, // company field not available from webhook payload
        parsed.metadata.sender_avatar as string | undefined,
      );
      actorId = resolved.actorId || undefined;
      accountId = resolved.accountId || undefined;
    } catch (err) {
      logger.warn('Identity resolution failed for GitHub actor', {
        github: parsed.actorGithub,
        error: err,
      });
    }
  }

  // Fall back to GitHub org lookup if identity resolution didn't resolve account
  if (!accountId && parsed.accountGithubOrg) {
    try {
      const company = await prisma.company.findFirst({
        where: { organizationId, githubOrg: parsed.accountGithubOrg },
        select: { id: true },
      });
      if (company) {
        accountId = company.id;
      }
    } catch (err) {
      logger.warn('Failed to resolve GitHub org', {
        org: parsed.accountGithubOrg,
        error: err,
      });
    }
  }

  // Build the idempotency key from the GitHub delivery ID
  const deliveryId = payload.delivery as string | undefined;
  const idempotencyKey = deliveryId
    ? `gh:${deliveryId}`
    : `gh:${crypto.randomUUID()}`;

  // Create the signal
  const signal = await prisma.signal.create({
    data: {
      organizationId,
      sourceId,
      type: parsed.signalType,
      actorId: actorId || null,
      accountId: accountId || null,
      anonymousId: actorId ? null : `github:${parsed.actorGithub}`,
      metadata: parsed.metadata as Prisma.InputJsonValue,
      idempotencyKey,
      timestamp: new Date(),
    },
  });

  return {
    processed: true,
    signalId: signal.id,
    signalType: parsed.signalType,
  };
}
