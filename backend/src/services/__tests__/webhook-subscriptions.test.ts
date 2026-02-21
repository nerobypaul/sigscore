import '../../__tests__/setup';

// ---------------------------------------------------------------------------
// Mocks - must be declared before imports
// ---------------------------------------------------------------------------

const mockWebhookSubscription = {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../config/database', () => ({
  prisma: {
    webhookSubscription: mockWebhookSubscription,
  },
}));

const mockQueueAdd = jest.fn().mockResolvedValue(undefined);

jest.mock('../../jobs/queue', () => ({
  webhookDeliveryQueue: {
    add: mockQueueAdd,
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  getSubscription,
  toggleSubscription,
  fireEvent,
  deliverToSubscription,
  getTestPayload,
  WEBHOOK_EVENT_TYPES,
} from '../webhook-subscriptions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test-123';
const SUB_ID = 'sub-456';

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ID,
    organizationId: ORG_ID,
    targetUrl: 'https://hooks.example.com/webhook',
    event: 'signal.created',
    hookId: null,
    secret: 'a'.repeat(64),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Webhook Subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // WEBHOOK_EVENT_TYPES
  // ================================================================
  describe('WEBHOOK_EVENT_TYPES', () => {
    it('should include all 8 supported event types', () => {
      expect(WEBHOOK_EVENT_TYPES).toHaveLength(8);
      expect(WEBHOOK_EVENT_TYPES).toContain('signal.created');
      expect(WEBHOOK_EVENT_TYPES).toContain('contact.created');
      expect(WEBHOOK_EVENT_TYPES).toContain('contact.updated');
      expect(WEBHOOK_EVENT_TYPES).toContain('company.created');
      expect(WEBHOOK_EVENT_TYPES).toContain('deal.created');
      expect(WEBHOOK_EVENT_TYPES).toContain('deal.stage_changed');
      expect(WEBHOOK_EVENT_TYPES).toContain('score.changed');
      expect(WEBHOOK_EVENT_TYPES).toContain('tier.changed');
    });
  });

  // ================================================================
  // createSubscription
  // ================================================================
  describe('createSubscription', () => {
    it('should create a subscription with a generated secret', async () => {
      const sub = makeSubscription();
      mockWebhookSubscription.create.mockResolvedValue(sub);

      const result = await createSubscription(ORG_ID, {
        targetUrl: 'https://hooks.example.com/webhook',
        event: 'signal.created',
      });

      expect(result).toEqual(sub);
      expect(mockWebhookSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization: { connect: { id: ORG_ID } },
          targetUrl: 'https://hooks.example.com/webhook',
          event: 'signal.created',
          secret: expect.any(String),
        }),
      });

      // Verify the secret is a 64-char hex string (32 bytes)
      const createCall = mockWebhookSubscription.create.mock.calls[0][0];
      expect(createCall.data.secret).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should accept all valid event types', async () => {
      for (const eventType of WEBHOOK_EVENT_TYPES) {
        mockWebhookSubscription.create.mockResolvedValue(
          makeSubscription({ event: eventType }),
        );

        await expect(
          createSubscription(ORG_ID, {
            targetUrl: 'https://hooks.example.com/webhook',
            event: eventType,
          }),
        ).resolves.not.toThrow();
      }
    });

    it('should throw on unsupported event type', async () => {
      await expect(
        createSubscription(ORG_ID, {
          targetUrl: 'https://hooks.example.com/webhook',
          event: 'invalid.event',
        }),
      ).rejects.toThrow('Unsupported event type');
    });

    it('should include hookId when provided', async () => {
      mockWebhookSubscription.create.mockResolvedValue(
        makeSubscription({ hookId: 'zapier-hook-123' }),
      );

      await createSubscription(ORG_ID, {
        targetUrl: 'https://hooks.zapier.com/abc',
        event: 'contact.created',
        hookId: 'zapier-hook-123',
      });

      expect(mockWebhookSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hookId: 'zapier-hook-123',
        }),
      });
    });

    it('should set hookId to null when not provided', async () => {
      mockWebhookSubscription.create.mockResolvedValue(makeSubscription());

      await createSubscription(ORG_ID, {
        targetUrl: 'https://hooks.example.com/webhook',
        event: 'signal.created',
      });

      expect(mockWebhookSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hookId: null,
        }),
      });
    });
  });

  // ================================================================
  // deleteSubscription
  // ================================================================
  describe('deleteSubscription', () => {
    it('should delete an existing subscription', async () => {
      mockWebhookSubscription.findFirst.mockResolvedValue(makeSubscription());
      mockWebhookSubscription.delete.mockResolvedValue(makeSubscription());

      await deleteSubscription(ORG_ID, SUB_ID);

      expect(mockWebhookSubscription.findFirst).toHaveBeenCalledWith({
        where: { id: SUB_ID, organizationId: ORG_ID },
      });
      expect(mockWebhookSubscription.delete).toHaveBeenCalledWith({
        where: { id: SUB_ID },
      });
    });

    it('should throw 404 when subscription not found', async () => {
      mockWebhookSubscription.findFirst.mockResolvedValue(null);

      await expect(
        deleteSubscription(ORG_ID, 'nonexistent'),
      ).rejects.toThrow('Webhook subscription not found');
    });

    it('should not delete a subscription from another organization', async () => {
      mockWebhookSubscription.findFirst.mockResolvedValue(null);

      await expect(
        deleteSubscription('other-org', SUB_ID),
      ).rejects.toThrow('Webhook subscription not found');

      expect(mockWebhookSubscription.delete).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // listSubscriptions
  // ================================================================
  describe('listSubscriptions', () => {
    it('should return all subscriptions for an organization ordered by createdAt desc', async () => {
      const subs = [
        makeSubscription({ id: 'sub-1', event: 'signal.created' }),
        makeSubscription({ id: 'sub-2', event: 'contact.created' }),
      ];
      mockWebhookSubscription.findMany.mockResolvedValue(subs);

      const result = await listSubscriptions(ORG_ID);

      expect(result).toEqual(subs);
      expect(mockWebhookSubscription.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no subscriptions exist', async () => {
      mockWebhookSubscription.findMany.mockResolvedValue([]);

      const result = await listSubscriptions(ORG_ID);

      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // getSubscription
  // ================================================================
  describe('getSubscription', () => {
    it('should return a subscription by ID and org', async () => {
      const sub = makeSubscription();
      mockWebhookSubscription.findFirst.mockResolvedValue(sub);

      const result = await getSubscription(ORG_ID, SUB_ID);

      expect(result).toEqual(sub);
      expect(mockWebhookSubscription.findFirst).toHaveBeenCalledWith({
        where: { id: SUB_ID, organizationId: ORG_ID },
      });
    });

    it('should throw 404 when subscription not found', async () => {
      mockWebhookSubscription.findFirst.mockResolvedValue(null);

      await expect(
        getSubscription(ORG_ID, 'nonexistent'),
      ).rejects.toThrow('Webhook subscription not found');
    });
  });

  // ================================================================
  // toggleSubscription
  // ================================================================
  describe('toggleSubscription', () => {
    it('should activate a subscription', async () => {
      const sub = makeSubscription({ active: false });
      mockWebhookSubscription.findFirst.mockResolvedValue(sub);
      mockWebhookSubscription.update.mockResolvedValue({ ...sub, active: true });

      const result = await toggleSubscription(ORG_ID, SUB_ID, true);

      expect(result.active).toBe(true);
      expect(mockWebhookSubscription.update).toHaveBeenCalledWith({
        where: { id: SUB_ID },
        data: { active: true },
      });
    });

    it('should deactivate a subscription', async () => {
      const sub = makeSubscription({ active: true });
      mockWebhookSubscription.findFirst.mockResolvedValue(sub);
      mockWebhookSubscription.update.mockResolvedValue({ ...sub, active: false });

      const result = await toggleSubscription(ORG_ID, SUB_ID, false);

      expect(result.active).toBe(false);
      expect(mockWebhookSubscription.update).toHaveBeenCalledWith({
        where: { id: SUB_ID },
        data: { active: false },
      });
    });

    it('should throw 404 when subscription not found', async () => {
      mockWebhookSubscription.findFirst.mockResolvedValue(null);

      await expect(
        toggleSubscription(ORG_ID, 'nonexistent', true),
      ).rejects.toThrow('Webhook subscription not found');
    });
  });

  // ================================================================
  // fireEvent
  // ================================================================
  describe('fireEvent', () => {
    it('should enqueue webhook deliveries for all active subscribers', async () => {
      const subs = [
        makeSubscription({ id: 'sub-1', targetUrl: 'https://hooks.a.com' }),
        makeSubscription({ id: 'sub-2', targetUrl: 'https://hooks.b.com' }),
      ];
      mockWebhookSubscription.findMany.mockResolvedValue(subs);

      const payload = { id: 'sig-123', type: 'repo_clone' };

      await fireEvent(ORG_ID, 'signal.created', payload);

      expect(mockWebhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: ORG_ID,
          event: 'signal.created',
          active: true,
        },
      });

      // Should enqueue one job per subscription
      expect(mockQueueAdd).toHaveBeenCalledTimes(2);

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'deliver-subscription-webhook',
        expect.objectContaining({
          organizationId: ORG_ID,
          event: 'signal.created',
          payload: expect.objectContaining({
            event: 'signal.created',
            data: payload,
          }),
          subscriptionId: 'sub-1',
          targetUrl: 'https://hooks.a.com',
          secret: 'a'.repeat(64),
        }),
      );
    });

    it('should not enqueue anything when no active subscribers exist', async () => {
      mockWebhookSubscription.findMany.mockResolvedValue([]);

      await fireEvent(ORG_ID, 'signal.created', { id: 'test' });

      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should continue enqueuing even if one fails', async () => {
      const subs = [
        makeSubscription({ id: 'sub-1' }),
        makeSubscription({ id: 'sub-2' }),
      ];
      mockWebhookSubscription.findMany.mockResolvedValue(subs);

      // First enqueue fails, second succeeds
      mockQueueAdd
        .mockRejectedValueOnce(new Error('Queue error'))
        .mockResolvedValueOnce(undefined);

      // Should not throw
      await expect(
        fireEvent(ORG_ID, 'signal.created', { id: 'test' }),
      ).resolves.not.toThrow();

      expect(mockQueueAdd).toHaveBeenCalledTimes(2);
    });

    it('should include timestamp and organizationId in the envelope', async () => {
      const sub = makeSubscription();
      mockWebhookSubscription.findMany.mockResolvedValue([sub]);

      await fireEvent(ORG_ID, 'contact.created', { name: 'Jane' });

      const enqueueCall = mockQueueAdd.mock.calls[0][1];
      expect(enqueueCall.payload).toHaveProperty('timestamp');
      expect(enqueueCall.payload.organizationId).toBe(ORG_ID);
    });
  });

  // ================================================================
  // deliverToSubscription
  // ================================================================
  describe('deliverToSubscription', () => {
    it('should POST the payload with HMAC signature and return success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await deliverToSubscription(
        'https://hooks.example.com/webhook',
        'my-secret',
        'signal.created',
        { id: 'sig-1' },
      );

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);

      // Verify fetch was called with correct headers
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Sigscore-Event': 'signal.created',
          }),
          body: expect.any(String),
        }),
      );

      // Verify signature header is present
      const fetchCall = mockFetch.mock.calls[0][1];
      expect(fetchCall.headers['X-Sigscore-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should return failure when target responds with error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await deliverToSubscription(
        'https://hooks.example.com/webhook',
        'my-secret',
        'signal.created',
        { id: 'sig-1' },
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
    });

    it('should return failure with error message on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await deliverToSubscription(
        'https://hooks.example.com/webhook',
        'my-secret',
        'signal.created',
        { id: 'sig-1' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should produce a valid HMAC-SHA256 signature', async () => {
      const crypto = await import('crypto');

      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const payload = { id: 'sig-test', type: 'repo_clone' };
      const secret = 'test-secret-key';

      await deliverToSubscription(
        'https://hooks.example.com/webhook',
        secret,
        'signal.created',
        payload,
      );

      const fetchCall = mockFetch.mock.calls[0][1];
      const body = fetchCall.body;
      const expectedSig = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      expect(fetchCall.headers['X-Sigscore-Signature']).toBe(`sha256=${expectedSig}`);
    });
  });

  // ================================================================
  // getTestPayload
  // ================================================================
  describe('getTestPayload', () => {
    it('should return test payloads for all known event types', () => {
      for (const eventType of WEBHOOK_EVENT_TYPES) {
        const payload = getTestPayload(eventType);
        expect(payload).toBeDefined();
        expect(typeof payload).toBe('object');
      }
    });

    it('should return signal.created test payload with expected fields', () => {
      const payload = getTestPayload('signal.created');
      expect(payload).toHaveProperty('id');
      expect(payload).toHaveProperty('type');
      expect(payload).toHaveProperty('metadata');
    });

    it('should return contact.created test payload with expected fields', () => {
      const payload = getTestPayload('contact.created');
      expect(payload).toHaveProperty('firstName');
      expect(payload).toHaveProperty('email');
    });

    it('should return a fallback payload for unknown event types', () => {
      const payload = getTestPayload('unknown.event');
      expect(payload).toHaveProperty('message', 'Test event');
      expect(payload).toHaveProperty('event', 'unknown.event');
    });

    it('should return score.changed payload with old/new score and tier', () => {
      const payload = getTestPayload('score.changed');
      expect(payload).toHaveProperty('oldScore');
      expect(payload).toHaveProperty('newScore');
      expect(payload).toHaveProperty('oldTier');
      expect(payload).toHaveProperty('newTier');
    });

    it('should return deal.stage_changed payload with previousStage', () => {
      const payload = getTestPayload('deal.stage_changed');
      expect(payload).toHaveProperty('previousStage');
      expect(payload).toHaveProperty('stage');
    });
  });
});
