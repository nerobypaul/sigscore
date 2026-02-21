import { Resend } from 'resend';
import { config } from '../config';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Resend client (lazy-initialized)
// ---------------------------------------------------------------------------

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!config.email.resendApiKey) {
    return null;
  }
  if (!resendClient) {
    resendClient = new Resend(config.email.resendApiKey);
  }
  return resendClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface EmailDeliveryResult {
  id: string | null;
  status: 'sent' | 'logged';
}

// ---------------------------------------------------------------------------
// Transactional email templates
// ---------------------------------------------------------------------------

type TransactionalEmailType = 'welcome' | 'password_reset' | 'invite' | 'sequence_step';

const TRANSACTIONAL_SUBJECTS: Record<TransactionalEmailType, string> = {
  welcome: 'Welcome to Sigscore',
  password_reset: 'Reset your password',
  invite: 'You\'ve been invited to join {{orgName}} on Sigscore',
  sequence_step: '{{subject}}',
};

const TRANSACTIONAL_TEMPLATES: Record<TransactionalEmailType, string> = {
  welcome: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>Welcome to Sigscore</h1>
      <p>Hi {{name}},</p>
      <p>Thanks for signing up! Sigscore helps you capture developer signals and turn them into pipeline.</p>
      <p>Here are your next steps:</p>
      <ul>
        <li>Connect your first signal source (GitHub, npm, or PyPI)</li>
        <li>Import your contacts or let us discover them automatically</li>
        <li>Set up your first workflow automation</li>
      </ul>
      <p>If you have any questions, just reply to this email.</p>
      <p>The Sigscore Team</p>
    </div>
  `,
  password_reset: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>Reset Your Password</h1>
      <p>Hi {{name}},</p>
      <p>We received a request to reset your password. Click the link below to set a new one:</p>
      <p><a href="{{resetUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      <p>The Sigscore Team</p>
    </div>
  `,
  invite: `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>You've been invited!</h1>
      <p>Hi {{name}},</p>
      <p>{{inviterName}} has invited you to join <strong>{{orgName}}</strong> on Sigscore.</p>
      <p><a href="{{inviteUrl}}" style="background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a></p>
      <p>The Sigscore Team</p>
    </div>
  `,
  sequence_step: '{{body}}',
};

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

/**
 * Send an email via Resend. Falls back to logging in dev mode when
 * RESEND_API_KEY is not configured.
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
  const from = options.from || config.email.fromAddress;
  const client = getResendClient();

  if (!client) {
    // Dev mode: log the email instead of sending
    logger.info('[DEV EMAIL] Would send email (no RESEND_API_KEY configured)', {
      to: options.to,
      from,
      subject: options.subject,
      replyTo: options.replyTo,
      bodyPreview: options.html.substring(0, 300),
    });
    return { id: null, status: 'logged' };
  }

  const { data, error } = await client.emails.send({
    from,
    to: Array.isArray(options.to) ? options.to : [options.to],
    subject: options.subject,
    html: options.html,
    ...(options.replyTo && { replyTo: options.replyTo }),
  });

  if (error) {
    logger.error('Resend API error', { error, to: options.to, subject: options.subject });
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info('Email sent via Resend', {
    id: data?.id,
    to: options.to,
    subject: options.subject,
  });

  return { id: data?.id ?? null, status: 'sent' };
}

// ---------------------------------------------------------------------------
// Transactional email helper
// ---------------------------------------------------------------------------

/**
 * Send a template-based transactional email (welcome, password reset, invite, etc.)
 * Variables in the template are replaced using simple {{key}} substitution.
 */
export async function sendTransactionalEmail(
  type: TransactionalEmailType,
  to: string,
  data: Record<string, string>,
): Promise<EmailDeliveryResult> {
  const subjectTemplate = TRANSACTIONAL_SUBJECTS[type];
  const bodyTemplate = TRANSACTIONAL_TEMPLATES[type];

  const subject = renderSimpleTemplate(subjectTemplate, data);
  const html = renderSimpleTemplate(bodyTemplate, data);

  return sendEmail({ to, subject, html });
}

// ---------------------------------------------------------------------------
// Simple template renderer (for transactional emails only)
// ---------------------------------------------------------------------------

function renderSimpleTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}
