import { Request, Response, NextFunction } from 'express';
import { OrgRole } from '@prisma/client';
import type Prisma from '@prisma/client';
import * as aiEngine from '../services/ai-engine';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

export const generateBrief = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;

    const brief = await aiEngine.generateAccountBrief(organizationId, accountId);

    logger.info(`AI brief generated for account ${accountId}`);
    res.status(201).json(brief);
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key not configured')) {
      res.status(402).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const getBrief = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;

    const result = await aiEngine.getAccountBrief(organizationId, accountId);

    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key not configured')) {
      res.status(402).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const suggestActions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { accountId } = req.params;

    const result = await aiEngine.suggestNextActions(organizationId, accountId);

    logger.info(`AI actions suggested for account ${accountId}`);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key not configured')) {
      res.status(402).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

export const enrichContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const { contactId } = req.params;

    const result = await aiEngine.enrichContactFromSignals(organizationId, contactId);

    logger.info(`AI enrichment completed for contact ${contactId}`);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('API key not configured')) {
      res.status(402).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};

/**
 * Save/update the organization's Anthropic API key
 * Requires OWNER or ADMIN role
 */
export const saveApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;
    const orgRole = req.orgRole!;
    const { apiKey } = req.body;

    // Check permissions
    if (orgRole !== OrgRole.OWNER && orgRole !== OrgRole.ADMIN) {
      res.status(403).json({ error: 'Only OWNER or ADMIN can configure AI settings' });
      return;
    }

    // Validate API key format (allow empty string for removal)
    if (typeof apiKey !== 'string') {
      res.status(400).json({ error: 'API key must be a string' });
      return;
    }

    // If removing the key (empty string), skip format validation
    if (apiKey && !apiKey.startsWith('sk-ant-')) {
      res.status(400).json({ error: 'Invalid Anthropic API key format. Key must start with "sk-ant-"' });
      return;
    }

    // Fetch current settings
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    // Merge new API key into settings (or remove if empty)
    const currentSettings = (org.settings || {}) as Record<string, unknown>;
    const updatedSettings = {
      ...currentSettings,
      anthropicApiKey: apiKey || undefined, // Remove key if empty string
    };

    // Update organization settings
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: updatedSettings as unknown as Prisma.Prisma.InputJsonValue,
      },
    });

    // Clear cached client so new key takes effect
    aiEngine.clearClientCache(organizationId);

    const action = apiKey ? 'configured' : 'removed';
    logger.info(`Anthropic API key ${action} for organization ${organizationId}`);

    res.json({
      success: true,
      keyPrefix: apiKey ? apiKey.slice(0, 10) + '...' : null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get the organization's AI configuration status
 * Returns whether API key is configured and a masked prefix
 */
export const getAiConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organizationId!;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const apiKey = (org.settings as any)?.anthropicApiKey;
    const configured = Boolean(apiKey && typeof apiKey === 'string' && apiKey.startsWith('sk-ant-'));
    const keyPrefix = configured && apiKey ? apiKey.slice(0, 10) + '...' : null;

    res.json({
      configured,
      keyPrefix,
    });
  } catch (error) {
    next(error);
  }
};
