import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../config/database';
import { enqueueDiscordSync } from '../jobs/producers';
import {
  connectDiscordServer,
  getDiscordChannels,
  updateMonitoredChannels,
  getDiscordStatus,
  disconnectDiscord,
  processDiscordWebhookEvent,
} from '../services/discord-connector';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  botToken: z.string().min(1, 'Bot token is required'),
});

const updateChannelsSchema = z.object({
  channelIds: z.array(z.string().min(1)).min(0),
});

// ---------------------------------------------------------------------------
// Inbound webhook (no auth -- Discord sends events here)
// Must be defined BEFORE auth middleware
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/connectors/discord/webhook
 *
 * Inbound endpoint for Discord event subscriptions (Interactions endpoint).
 * No authentication -- verified via Discord's signature if configured.
 */
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body;

    // Discord sends a PING to verify the endpoint
    if (payload.type === 1) {
      res.json({ type: 1 });
      return;
    }

    // For actual events, we need to find the source by guild ID
    const guildId = payload.guild_id as string | undefined;
    if (!guildId) {
      res.status(400).json({ error: 'Invalid Discord server configuration' });
      return;
    }

    // Find the source that matches this guild
    const sources = await prisma.signalSource.findMany({
      where: { type: 'DISCORD', status: 'ACTIVE' },
    });

    let matchedSource = null;
    for (const source of sources) {
      const cfg = source.config as Record<string, unknown> | null;
      if (cfg?.guildId === guildId) {
        matchedSource = source;
        break;
      }
    }

    if (!matchedSource) {
      res.status(404).json({ error: 'No Discord source found for this guild' });
      return;
    }

    const eventType = payload.t as string || 'UNKNOWN';
    const eventData = payload.d as Record<string, unknown> || payload;

    const result = await processDiscordWebhookEvent(
      matchedSource.organizationId,
      matchedSource.id,
      eventType,
      eventData,
    );

    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error('Discord webhook error', { error: err });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /connect -- Store bot token, fetch server info + channel list
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { botToken } = req.body as z.infer<typeof connectSchema>;

      // Validate the token and fetch server info
      const serverInfo = await connectDiscordServer(botToken);

      // Check if already connected
      const existing = await prisma.signalSource.findFirst({
        where: { organizationId, type: 'DISCORD' },
      });

      const config: Record<string, unknown> = {
        botToken,
        guildId: serverInfo.id,
        guildName: serverInfo.name,
        guildIcon: serverInfo.icon,
        memberCount: serverInfo.memberCount,
        monitoredChannels: [],
        lastSyncAt: null,
        lastSyncResult: null,
      };

      if (existing) {
        // Update existing source
        await prisma.signalSource.update({
          where: { id: existing.id },
          data: {
            name: `Discord: ${serverInfo.name}`,
            config: config as unknown as Prisma.InputJsonValue,
            status: 'ACTIVE',
            errorMessage: null,
          },
        });
      } else {
        // Create new source
        await prisma.signalSource.create({
          data: {
            organizationId,
            type: 'DISCORD',
            name: `Discord: ${serverInfo.name}`,
            config: config as unknown as Prisma.InputJsonValue,
            status: 'ACTIVE',
          },
        });
      }

      res.json({
        server: {
          id: serverInfo.id,
          name: serverInfo.name,
          icon: serverInfo.icon,
          memberCount: serverInfo.memberCount,
        },
        channels: serverInfo.channels,
      });
    } catch (err) {
      logger.error('Discord connect error', { error: err });
      res.status(500).json({ error: 'Failed to connect Discord' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /channels -- List available channels with classification
// ---------------------------------------------------------------------------

router.get(
  '/channels',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const result = await getDiscordChannels(organizationId);
      res.json(result);
    } catch (err) {
      logger.error('Discord channels error', { error: err });
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /channels -- Select channels to monitor
// ---------------------------------------------------------------------------

router.put(
  '/channels',
  requireOrgRole('ADMIN'),
  validate(updateChannelsSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { channelIds } = req.body as z.infer<typeof updateChannelsSchema>;

      await updateMonitoredChannels(organizationId, channelIds);

      res.json({ ok: true, monitoredChannels: channelIds.length });
    } catch (err) {
      logger.error('Discord update channels error', { error: err });
      res.status(500).json({ error: 'Failed to update channels' });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /sync -- Trigger manual sync
// ---------------------------------------------------------------------------

router.post(
  '/sync',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const job = await enqueueDiscordSync(organizationId);

      res.json({ ok: true, message: 'Discord sync queued', jobId: job.id });
    } catch (err) {
      logger.error('Discord sync error', { error: err });
      res.status(500).json({ error: 'Failed to queue sync' });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /status -- Get sync status
// ---------------------------------------------------------------------------

router.get(
  '/status',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const status = await getDiscordStatus(organizationId);
      res.json(status);
    } catch (err) {
      logger.error('Discord status error', { error: err });
      res.status(500).json({ error: 'Failed to get status' });
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /disconnect -- Remove Discord connection
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectDiscord(organizationId);

      res.json({ ok: true, message: 'Discord disconnected' });
    } catch (err) {
      logger.error('Discord disconnect error', { error: err });
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  },
);

export default router;
