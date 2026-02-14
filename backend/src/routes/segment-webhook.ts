import { Router, Request, Response } from 'express';
import { prisma } from '../config/database';
import {
  processSegmentPayload,
  verifySegmentSignature,
  SegmentPayload,
  SegmentBatchPayload,
} from '../services/segment-connector';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/webhooks/segment/:sourceId
 *
 * Receives Segment webhook events for a specific SignalSource.
 * This route is NOT behind JWT auth middleware — Segment sends requests
 * directly to this endpoint. Security is handled via HMAC-SHA1
 * signature verification using the shared secret stored on the
 * SignalSource config.
 *
 * Supports both single payloads and batch payloads ({ batch: [...] }).
 */
router.post('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;

    // Find the signal source
    const source = await prisma.signalSource.findFirst({
      where: { id: sourceId, type: 'SEGMENT' },
    });

    if (!source) {
      res.status(404).json({ error: 'Segment source not found' });
      return;
    }

    // Verify HMAC signature
    const config = source.config as Record<string, unknown> | null;
    const sharedSecret = config?.sharedSecret as string | undefined;

    if (sharedSecret) {
      const signature = req.headers['x-signature'] as string | undefined;

      if (!signature) {
        logger.warn('Segment webhook missing signature header', { sourceId });
        res.status(401).json({ error: 'Missing signature' });
        return;
      }

      const rawBody = JSON.stringify(req.body);
      if (!verifySegmentSignature(rawBody, signature, sharedSecret)) {
        logger.warn('Segment webhook signature verification failed', { sourceId });
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    // Check if this is a batch request
    const body = req.body as SegmentPayload | SegmentBatchPayload;

    if ('batch' in body && Array.isArray(body.batch)) {
      // Batch payload
      const results = [];

      for (const event of body.batch) {
        try {
          const result = await processSegmentPayload(
            source.organizationId,
            source.id,
            event,
          );
          results.push({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Processing error';
          logger.error('Segment batch event processing error', {
            sourceId,
            messageId: event.messageId,
            error: err,
          });
          results.push({ ok: false, type: event.type, error: message });
        }
      }

      res.status(200).json({
        ok: true,
        batch: true,
        processed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
      return;
    }

    // Single payload
    const payload = body as SegmentPayload;

    if (!payload.type || !payload.messageId) {
      res.status(400).json({ error: 'Invalid Segment payload: missing type or messageId' });
      return;
    }

    const result = await processSegmentPayload(
      source.organizationId,
      source.id,
      payload,
    );

    logger.info('Segment webhook processed', {
      sourceId,
      type: result.type,
      entityId: result.entityId,
      processed: result.processed,
    });

    res.status(200).json({
      ok: true,
      type: result.type,
      entityId: result.entityId,
    });
  } catch (error) {
    // Always return 200 to avoid Segment retries on app errors
    logger.error('Segment webhook processing error', { error });
    res.status(200).json({ ok: false, error: 'Internal processing error' });
  }
});

export default router;
