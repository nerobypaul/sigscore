import { Router, Request, Response } from 'express';
import { verifyGitHubSignature, processGitHubWebhook } from '../services/github-connector';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/webhooks/github/:sourceId
 *
 * Receives GitHub webhook events for a specific SignalSource.
 * This route is NOT behind auth middleware -- GitHub sends requests
 * directly to this endpoint. Security is handled via HMAC-SHA256
 * signature verification using the webhook secret stored on the
 * SignalSource config.
 */
router.post('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const eventType = req.headers['x-github-event'] as string;
    const signature = req.headers['x-hub-signature-256'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;

    if (!eventType) {
      res.status(400).json({ error: 'Missing X-GitHub-Event header' });
      return;
    }

    // Ping event -- GitHub sends this when setting up the webhook
    if (eventType === 'ping') {
      res.status(200).json({ message: 'pong', deliveryId });
      return;
    }

    // Find the signal source
    const source = await prisma.signalSource.findFirst({
      where: { id: sourceId, type: 'GITHUB' },
    });

    if (!source) {
      res.status(404).json({ error: 'Signal source not found' });
      return;
    }

    // Verify signature if a webhook secret is configured on the source
    const config = source.config as Record<string, unknown> | null;
    const webhookSecret = config?.webhookSecret as string | undefined;

    if (webhookSecret) {
      if (!signature) {
        logger.warn('GitHub webhook missing signature header', {
          sourceId,
          deliveryId,
        });
        res.status(401).json({ error: 'Missing signature' });
        return;
      }

      const rawBody = JSON.stringify(req.body);
      if (!verifyGitHubSignature(rawBody, signature, webhookSecret)) {
        logger.warn('GitHub webhook signature verification failed', {
          sourceId,
          deliveryId,
        });
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    // Process the webhook
    const result = await processGitHubWebhook(
      source.organizationId,
      source.id,
      eventType,
      { ...req.body, delivery: deliveryId },
    );

    if (!result.processed) {
      res.status(200).json({
        message: 'Event type not tracked',
        eventType,
      });
      return;
    }

    logger.info('GitHub webhook processed', {
      sourceId,
      deliveryId,
      signalType: result.signalType,
      signalId: result.signalId,
    });

    res.status(201).json({
      message: 'Signal created',
      signalId: result.signalId,
      signalType: result.signalType,
    });
  } catch (error) {
    logger.error('GitHub webhook processing error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
