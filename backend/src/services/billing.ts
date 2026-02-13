import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Stripe client (lazy-initialized to avoid blowing up test imports)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2026-01-28.clover',
    });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Plan helpers
// ---------------------------------------------------------------------------

export type PlanName = 'free' | 'pro' | 'scale';
export type PlanStatus = 'active' | 'past_due' | 'canceled';

interface BillingSettings {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan?: PlanName;
  planStatus?: PlanStatus;
}

function priceToPlan(priceId: string): PlanName {
  if (priceId === config.stripe.pricePro) return 'pro';
  if (priceId === config.stripe.priceScale) return 'scale';
  return 'free';
}

// ---------------------------------------------------------------------------
// Settings helpers — billing data lives inside Organization.settings JSON
// ---------------------------------------------------------------------------

async function getOrgSettings(organizationId: string): Promise<{ orgSettings: BillingSettings; rawSettings: Record<string, unknown> }> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const rawSettings = (org.settings as Record<string, unknown>) ?? {};
  const orgSettings: BillingSettings = {
    stripeCustomerId: rawSettings.stripeCustomerId as string | undefined,
    stripeSubscriptionId: rawSettings.stripeSubscriptionId as string | undefined,
    plan: (rawSettings.plan as PlanName) ?? 'free',
    planStatus: (rawSettings.planStatus as PlanStatus) ?? 'active',
  };

  return { orgSettings, rawSettings };
}

async function updateOrgSettings(organizationId: string, patch: Record<string, unknown>): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  if (!org) return;

  const current = (org.settings as Record<string, unknown>) ?? {};
  const merged = { ...current, ...patch };

  await prisma.organization.update({
    where: { id: organizationId },
    data: { settings: merged as Prisma.InputJsonValue },
  });
}

// ---------------------------------------------------------------------------
// Ensure Stripe customer exists for an organization
// ---------------------------------------------------------------------------

async function ensureStripeCustomer(organizationId: string): Promise<string> {
  const { orgSettings } = await getOrgSettings(organizationId);

  if (orgSettings.stripeCustomerId) {
    return orgSettings.stripeCustomerId;
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, domain: true },
  });

  if (!org) {
    throw new AppError('Organization not found', 404);
  }

  const customer = await getStripe().customers.create({
    name: org.name,
    metadata: { organizationId },
  });

  await updateOrgSettings(organizationId, { stripeCustomerId: customer.id });
  return customer.id;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function createCheckoutSession(
  organizationId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ sessionId: string; url: string }> {
  const customerId = await ensureStripeCustomer(organizationId);

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { organizationId },
    subscription_data: {
      metadata: { organizationId },
    },
  });

  return { sessionId: session.id, url: session.url ?? '' };
}

export async function createCustomerPortalSession(
  organizationId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const customerId = await ensureStripeCustomer(organizationId);

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

export async function getSubscription(organizationId: string): Promise<{
  plan: PlanName;
  planStatus: PlanStatus;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}> {
  const { orgSettings } = await getOrgSettings(organizationId);

  return {
    plan: orgSettings.plan ?? 'free',
    planStatus: orgSettings.planStatus ?? 'active',
    stripeSubscriptionId: orgSettings.stripeSubscriptionId ?? null,
    stripeCustomerId: orgSettings.stripeCustomerId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function handleWebhook(
  payload: Buffer,
  signature: string
): Promise<void> {
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      payload,
      signature,
      config.stripe.webhookSecret
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Webhook signature verification failed: ${message}`, 400);
  }

  logger.info(`Stripe webhook received: ${event.type}`, { eventId: event.id });

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId = session.metadata?.organizationId;
      if (!organizationId) {
        logger.warn('checkout.session.completed missing organizationId metadata');
        break;
      }

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      if (subscriptionId) {
        // Fetch subscription to get the price / plan
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price?.id ?? '';
        const plan = priceToPlan(priceId);

        await updateOrgSettings(organizationId, {
          stripeSubscriptionId: subscriptionId,
          plan,
          planStatus: 'active',
        });

        logger.info(`Organization ${organizationId} upgraded to ${plan}`);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const organizationId = sub.metadata?.organizationId;
      if (!organizationId) {
        logger.warn('customer.subscription.updated missing organizationId metadata');
        break;
      }

      const priceId = sub.items.data[0]?.price?.id ?? '';
      const plan = priceToPlan(priceId);

      let planStatus: PlanStatus = 'active';
      if (sub.status === 'past_due') planStatus = 'past_due';
      if (sub.status === 'canceled' || sub.status === 'unpaid') planStatus = 'canceled';

      await updateOrgSettings(organizationId, { plan, planStatus });
      logger.info(`Organization ${organizationId} subscription updated: ${plan} (${planStatus})`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const organizationId = sub.metadata?.organizationId;
      if (!organizationId) {
        logger.warn('customer.subscription.deleted missing organizationId metadata');
        break;
      }

      await updateOrgSettings(organizationId, {
        plan: 'free',
        planStatus: 'canceled',
        stripeSubscriptionId: null,
      });

      logger.info(`Organization ${organizationId} downgraded to free`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subDetail = invoice.parent?.subscription_details;
      const subscriptionId =
        typeof subDetail?.subscription === 'string'
          ? subDetail.subscription
          : subDetail?.subscription?.id;

      if (subscriptionId) {
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);
        const organizationId = sub.metadata?.organizationId;
        if (organizationId) {
          await updateOrgSettings(organizationId, { planStatus: 'past_due' });
          logger.warn(`Payment failed for organization ${organizationId}`);
        }
      }
      break;
    }

    default:
      logger.debug(`Unhandled Stripe event type: ${event.type}`);
  }
}
