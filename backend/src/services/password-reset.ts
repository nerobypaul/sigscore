import { randomBytes, createHash } from 'crypto';
import { prisma } from '../config/database';
import { hashPassword } from '../utils/password';
import { sendTransactionalEmail } from './email-sender';
import { config } from '../config';
import { logger } from '../utils/logger';

/** SHA-256 hash a raw token for safe storage. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a password reset token and send the reset email.
 * Always succeeds silently — never leaks whether the email exists.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Do not reveal that the email doesn't exist
    logger.info(`Password reset requested for unknown email: ${email}`);
    return;
  }

  // OAuth-only accounts (no password set) still get the email so they
  // know an account exists — the reset flow will let them set a password.
  const rawToken = randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);
  const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    },
  });

  const resetUrl = `${config.frontend.url}/reset-password?token=${rawToken}`;

  try {
    await sendTransactionalEmail('password_reset', user.email, {
      name: user.firstName,
      resetUrl,
    });
    logger.info(`Password reset email sent to ${user.email}`);
  } catch (err) {
    logger.error('Failed to send password reset email', { error: err, email: user.email });
    // Still log the URL so devs can test without email
    logger.info(`[DEV FALLBACK] Password reset URL for ${user.email}: ${resetUrl}`);
  }
}

/**
 * Validate a reset token and set the new password.
 * Throws on invalid / expired token.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hashedToken = hashToken(token);

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new ResetTokenError('Invalid or expired reset token');
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      // Invalidate existing sessions so the user must log in with the new password
      refreshToken: null,
    },
  });

  logger.info(`Password reset completed for user ${user.email}`);
}

/** Custom error type so the controller can distinguish token errors from unexpected ones. */
export class ResetTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetTokenError';
  }
}
