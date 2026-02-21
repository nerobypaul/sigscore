import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { hashPassword, comparePassword } from '../utils/password';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { requestPasswordReset, resetPassword as resetPasswordService, ResetTokenError } from '../services/password-reset';

/** One-way SHA-256 hash for refresh tokens before DB storage. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, firstName, lastName } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
      return;
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashToken(refreshToken) },
    });

    logger.info(`User registered: ${user.email}`);

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    // Handle Prisma unique constraint violation (concurrent registration race)
    const prismaError = error as { code?: string };
    if (prismaError.code === 'P2002') {
      res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.' });
      return;
    }
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const refreshToken = generateRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: hashToken(refreshToken),
        lastLoginAt: new Date(),
      },
    });

    logger.info(`User logged in: ${user.email}`);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    const incomingHash = hashToken(refreshToken);

    // ---- Refresh-token reuse detection ----
    // If the user has no stored token (already logged out / invalidated) but
    // the JWT signature is valid, someone is replaying a revoked token.
    // If the stored hash does not match the incoming token, the legitimate
    // token was already rotated — this is a reuse signal indicating potential
    // token theft. Invalidate all sessions for this user as a safety measure.
    if (!user.refreshToken || user.refreshToken !== incomingHash) {
      // Nuke the stored refresh token so the real user must re-authenticate.
      await prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });

      logger.warn(
        `Refresh token reuse detected for user ${user.id} (${user.email}). ` +
        'All sessions invalidated — possible token theft.'
      );

      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    // Token is valid — rotate it.
    const accessToken = generateAccessToken(user.id, user.email, user.role);
    const newRefreshToken = generateRefreshToken(user.id);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashToken(newRefreshToken) },
    });

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { refreshToken: null },
      });

      logger.info(`User logged out: ${userId}`);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        role: true,
        createdAt: true,
        organizations: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;
    await requestPasswordReset(email);

    // Always return 200 regardless of whether the email exists
    res.json({ message: 'If that email is registered, we sent a password reset link.' });
  } catch (error) {
    next(error);
  }
};

export const handleResetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body;
    await resetPasswordService(token, password);

    res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    if (error instanceof ResetTokenError) {
      res.status(400).json({ error: 'The reset link is invalid or has expired. Please request a new one.' });
      return;
    }
    next(error);
  }
};
