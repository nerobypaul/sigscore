import crypto from 'crypto';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface WebhookInput {
  url: string;
  events: string[];
}

export const getWebhookEndpoints = async (organizationId: string) => {
  return prisma.webhookEndpoint.findMany({
    where: { organizationId },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const createWebhookEndpoint = async (organizationId: string, data: WebhookInput) => {
  const secret = crypto.randomBytes(32).toString('hex');

  return prisma.webhookEndpoint.create({
    data: {
      organization: { connect: { id: organizationId } },
      url: data.url,
      events: data.events,
      secret,
    },
  });
};

export const deleteWebhookEndpoint = async (id: string, organizationId: string) => {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, organizationId },
  });
  if (!endpoint) throw new Error('Webhook endpoint not found');

  return prisma.webhookEndpoint.delete({ where: { id } });
};

export const dispatchWebhookEvent = async (
  organizationId: string,
  event: string,
  payload: Record<string, unknown>
) => {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      organizationId,
      active: true,
      events: { has: event },
    },
  });

  const deliveries = endpoints.map(async (endpoint) => {
    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const signature = crypto
      .createHmac('sha256', endpoint.secret)
      .update(body)
      .digest('hex');

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-DevSignal-Signature': `sha256=${signature}`,
          'X-DevSignal-Event': event,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      await prisma.webhookDelivery.create({
        data: {
          endpoint: { connect: { id: endpoint.id } },
          event,
          payload: payload as any,
          statusCode: response.status,
          success: response.ok,
          attempts: 1,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Webhook delivery failed for ${endpoint.url}: ${message}`);

      await prisma.webhookDelivery.create({
        data: {
          endpoint: { connect: { id: endpoint.id } },
          event,
          payload: payload as any,
          response: message,
          success: false,
          attempts: 1,
        },
      });
    }
  });

  await Promise.allSettled(deliveries);
};
