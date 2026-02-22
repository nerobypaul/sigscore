import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { config } from '../config';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Types — Resend webhook event payloads
// ---------------------------------------------------------------------------

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // Present on click events
    click?: {
      ipAddress: string;
      link: string;
      timestamp: string;
      userAgent: string;
    };
  };
}

// Resend event types we handle
const HANDLED_EVENTS = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
]);

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify Resend webhook signature using HMAC-SHA256.
 * Resend signs the raw body with the webhook secret and sends the
 * signature in the `svix-signature` header (base64-encoded).
 *
 * The signature header format is: v1,<base64-signature>
 * The signed content is: <svix-id>.<svix-timestamp>.<body>
 */
function verifyResendSignature(
  body: string,
  svixId: string | undefined,
  svixTimestamp: string | undefined,
  svixSignature: string | undefined,
  secret: string,
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Resend webhook secrets are prefixed with "whsec_" and then base64-encoded
  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');

  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // The header may contain multiple signatures separated by spaces
  const signatures = svixSignature.split(' ');
  for (const sig of signatures) {
    // Each signature is in the format "v1,<base64>"
    const parts = sig.split(',');
    if (parts.length === 2 && parts[0] === 'v1') {
      try {
        const sigBuffer = Buffer.from(parts[1], 'base64');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');
        if (sigBuffer.length === expectedBuffer.length &&
            crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
          return true;
        }
      } catch {
        // Skip malformed signatures
        continue;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/webhooks/resend
 *
 * Receives Resend webhook events (email.sent, email.delivered, email.opened,
 * email.clicked, email.bounced, email.complained).
 *
 * This route is NOT behind auth middleware -- Resend sends requests directly
 * to this endpoint. Security is handled via HMAC-SHA256 signature verification
 * using the RESEND_WEBHOOK_SECRET env var.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const rawBody = JSON.stringify(req.body);
    const webhookSecret = config.email.resendWebhookSecret;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const svixId = req.headers['svix-id'] as string | undefined;
      const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
      const svixSignature = req.headers['svix-signature'] as string | undefined;

      if (!verifyResendSignature(rawBody, svixId, svixTimestamp, svixSignature, webhookSecret)) {
        logger.warn('Resend webhook signature verification failed', {
          svixId,
          hasTimestamp: !!svixTimestamp,
          hasSignature: !!svixSignature,
        });
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }
    } else if (config.env === 'production') {
      // In production, require webhook signature verification
      logger.error('RESEND_WEBHOOK_SECRET not configured in production');
      res.status(500).json({ error: 'Webhook verification not configured' });
      return;
    }

    const event = req.body as ResendWebhookEvent;

    if (!event.type || !event.data?.email_id) {
      res.status(400).json({ error: 'Invalid webhook payload: missing type or email_id' });
      return;
    }

    // Ignore events we don't track
    if (!HANDLED_EVENTS.has(event.type)) {
      logger.debug(`Resend webhook: ignoring unhandled event type ${event.type}`);
      res.status(200).json({ received: true, handled: false });
      return;
    }

    const messageId = event.data.email_id;
    const eventTimestamp = new Date(event.created_at);

    // Find the EmailSend record by Resend message ID
    const emailSend = await prisma.emailSend.findFirst({
      where: { messageId },
    });

    if (!emailSend) {
      // Not an error -- the email may have been sent outside of sequences
      // (e.g., transactional emails like welcome/invite/password-reset)
      logger.debug('Resend webhook: no EmailSend record found for messageId', { messageId, eventType: event.type });
      res.status(200).json({ received: true, matched: false });
      return;
    }

    // Process the event based on type
    await processResendEvent(emailSend.id, emailSend.status, event.type, eventTimestamp);

    logger.info('Resend webhook processed', {
      eventType: event.type,
      messageId,
      emailSendId: emailSend.id,
    });

    res.status(200).json({ received: true, matched: true, emailSendId: emailSend.id });
  } catch (error) {
    logger.error('Resend webhook processing error', { error });
    // Return 200 to prevent Resend from retrying on app errors
    res.status(200).json({ received: true, error: 'Internal processing error' });
  }
});

// ---------------------------------------------------------------------------
// Event processing
// ---------------------------------------------------------------------------

/**
 * Status progression for email sends. Events should only move "forward"
 * in the lifecycle, never backward. E.g., a "delivered" event should not
 * overwrite an "opened" status.
 */
const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 6,
  failed: 7,
};

async function processResendEvent(
  emailSendId: string,
  currentStatus: string,
  eventType: string,
  eventTimestamp: Date,
): Promise<void> {
  switch (eventType) {
    case 'email.sent': {
      // Only update if current status is pending (don't regress)
      if (STATUS_PRIORITY[currentStatus] < STATUS_PRIORITY['sent']) {
        await prisma.emailSend.update({
          where: { id: emailSendId },
          data: { status: 'sent', sentAt: eventTimestamp },
        });
      }
      break;
    }

    case 'email.delivered': {
      if (STATUS_PRIORITY[currentStatus] < STATUS_PRIORITY['delivered']) {
        await prisma.emailSend.update({
          where: { id: emailSendId },
          data: { status: 'delivered', deliveredAt: eventTimestamp },
        });
      }
      break;
    }

    case 'email.delivery_delayed': {
      // Log but don't change status -- the email is still in transit
      logger.info('Email delivery delayed', { emailSendId });
      break;
    }

    case 'email.opened': {
      if (STATUS_PRIORITY[currentStatus] < STATUS_PRIORITY['opened']) {
        await prisma.emailSend.update({
          where: { id: emailSendId },
          data: { status: 'opened', openedAt: eventTimestamp },
        });
      } else if (!await hasTimestamp(emailSendId, 'openedAt')) {
        // Already clicked but openedAt was never set (e.g., click came first)
        await prisma.emailSend.update({
          where: { id: emailSendId },
          data: { openedAt: eventTimestamp },
        });
      }
      break;
    }

    case 'email.clicked': {
      // Clicked implies opened, so set openedAt if not already set
      const updateData: Record<string, unknown> = {
        status: 'clicked',
        clickedAt: eventTimestamp,
      };

      // If we haven't recorded an open yet, set it now (click implies open)
      if (STATUS_PRIORITY[currentStatus] < STATUS_PRIORITY['opened']) {
        updateData.openedAt = eventTimestamp;
      }

      if (STATUS_PRIORITY[currentStatus] < STATUS_PRIORITY['clicked']) {
        await prisma.emailSend.update({
          where: { id: emailSendId },
          data: updateData,
        });
      }
      break;
    }

    case 'email.bounced': {
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: { status: 'bounced', bouncedAt: eventTimestamp },
      });

      // Also mark the enrollment as bounced to stop future sends
      const send = await prisma.emailSend.findUnique({
        where: { id: emailSendId },
        select: { enrollmentId: true },
      });
      if (send) {
        await prisma.emailEnrollment.update({
          where: { id: send.enrollmentId },
          data: { status: 'bounced' },
        });
        logger.info('Enrollment marked as bounced due to email bounce', {
          emailSendId,
          enrollmentId: send.enrollmentId,
        });
      }
      break;
    }

    case 'email.complained': {
      await prisma.emailSend.update({
        where: { id: emailSendId },
        data: { status: 'complained', complainedAt: eventTimestamp },
      });

      // Unsubscribe the contact from the sequence on spam complaint
      const sendForComplaint = await prisma.emailSend.findUnique({
        where: { id: emailSendId },
        select: { enrollmentId: true },
      });
      if (sendForComplaint) {
        await prisma.emailEnrollment.update({
          where: { id: sendForComplaint.enrollmentId },
          data: { status: 'unsubscribed', completedAt: new Date() },
        });
        logger.info('Enrollment unsubscribed due to spam complaint', {
          emailSendId,
          enrollmentId: sendForComplaint.enrollmentId,
        });
      }
      break;
    }

    default:
      logger.debug(`Resend webhook: unhandled event type ${eventType}`);
  }
}

/**
 * Check if a specific timestamp field is already set on an EmailSend record.
 */
async function hasTimestamp(emailSendId: string, field: 'openedAt' | 'clickedAt' | 'deliveredAt'): Promise<boolean> {
  const record = await prisma.emailSend.findUnique({
    where: { id: emailSendId },
    select: { [field]: true },
  });
  return record ? record[field] !== null : false;
}

export default router;
