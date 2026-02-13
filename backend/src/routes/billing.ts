import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as billingService from '../services/billing';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Webhook router — must be mounted BEFORE express.json() in app.ts
// so that the raw body is available for Stripe signature verification.
// ---------------------------------------------------------------------------

export const billingWebhookRouter = Router();

billingWebhookRouter.post(
  '/',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers['stripe-signature'] as string;
      if (!signature) {
        res.status(400).json({ error: 'Missing stripe-signature header' });
        return;
      }

      await billingService.handleWebhook(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (error) {
      logger.error('Stripe webhook error:', error);
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Authenticated billing router — mounted after express.json()
// ---------------------------------------------------------------------------

const router = Router();

// Validation schemas
const checkoutSchema = z.object({
  priceId: z.string().min(1, 'priceId is required'),
  successUrl: z.string().url('successUrl must be a valid URL'),
  cancelUrl: z.string().url('cancelUrl must be a valid URL'),
});

const portalSchema = z.object({
  returnUrl: z.string().url('returnUrl must be a valid URL'),
});

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// POST /api/v1/billing/checkout — Create Stripe Checkout session
router.post(
  '/checkout',
  validate(checkoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { priceId, successUrl, cancelUrl } = req.body;
      const result = await billingService.createCheckoutSession(
        req.organizationId!,
        priceId,
        successUrl,
        cancelUrl
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/billing/portal — Create Stripe Customer Portal session
router.post(
  '/portal',
  validate(portalSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { returnUrl } = req.body;
      const result = await billingService.createCustomerPortalSession(
        req.organizationId!,
        returnUrl
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/billing/subscription — Get current subscription info
router.get(
  '/subscription',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subscription = await billingService.getSubscription(req.organizationId!);
      res.json(subscription);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
