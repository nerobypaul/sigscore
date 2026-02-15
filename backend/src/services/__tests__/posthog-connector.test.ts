import '../../__tests__/setup';

// ---------------------------------------------------------------------------
// Mocks - must be declared before imports
// ---------------------------------------------------------------------------

const mockSignalSource = {
  findFirst: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockSignal = {
  findUnique: jest.fn(),
  create: jest.fn(),
};

const mockContact = {
  findFirst: jest.fn(),
};

const mockContactIdentity = {
  findFirst: jest.fn(),
  upsert: jest.fn(),
};

jest.mock('../../config/database', () => ({
  prisma: {
    signalSource: mockSignalSource,
    signal: mockSignal,
    contact: mockContact,
    contactIdentity: mockContactIdentity,
  },
}));

jest.mock('../../jobs/producers', () => ({
  enqueueWorkflowExecution: jest.fn().mockResolvedValue(undefined),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import {
  configurePostHog,
  getPostHogStatus,
  disconnectPostHog,
  handlePostHogWebhook,
  syncPostHogEvents,
  getPostHogConnectedOrganizations,
} from '../posthog-connector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test-123';
const SOURCE_ID = 'source-posthog-456';
const PROJECT_ID = 'proj-789';
const API_KEY = 'phc_test_api_key_12345';

function makeSource(config: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_ID,
    organizationId: ORG_ID,
    type: 'POSTHOG',
    name: `PostHog: Project ${PROJECT_ID}`,
    status: 'ACTIVE',
    config: {
      host: 'app.posthog.com',
      projectId: PROJECT_ID,
      personalApiKey: API_KEY,
      trackedEvents: ['$pageview', 'signup', 'feature_used'],
      webhookSecret: null,
      lastSyncAt: null,
      lastSyncResult: null,
      ...config,
    },
    lastSyncAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function makePostHogEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    uuid: 'uuid-evt-1',
    event: '$pageview',
    distinct_id: 'user-123',
    properties: {
      $current_url: 'https://app.example.com/dashboard',
      $pathname: '/dashboard',
      $browser: 'Chrome',
    },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function mockFetchSuccess(responseBody: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve(responseBody),
    headers: new Headers(),
  });
}

function mockFetchError(status: number, statusText: string, body = '') {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
    text: () => Promise.resolve(body),
    headers: new Headers(),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PostHog Connector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ================================================================
  // configurePostHog
  // ================================================================
  describe('configurePostHog', () => {
    it('should create a new signal source after validating credentials', async () => {
      // Validation API call
      mockFetchSuccess({ id: PROJECT_ID, name: 'Test Project' });

      mockSignalSource.findFirst.mockResolvedValue(null);
      mockSignalSource.create.mockResolvedValue(makeSource());

      const result = await configurePostHog(ORG_ID, {
        projectId: PROJECT_ID,
        personalApiKey: API_KEY,
      });

      expect(result).toHaveProperty('sourceId');
      expect(result).toHaveProperty('webhookUrl');
      expect(result.webhookUrl).toContain('/api/v1/webhooks/posthog/');

      expect(mockSignalSource.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          type: 'POSTHOG',
          status: 'ACTIVE',
          config: expect.objectContaining({
            host: 'app.posthog.com',
            projectId: PROJECT_ID,
            personalApiKey: API_KEY,
            trackedEvents: ['$pageview', 'signup', 'feature_used'],
          }),
        }),
      });
    });

    it('should update existing source when one exists', async () => {
      mockFetchSuccess({ id: PROJECT_ID });

      const existing = makeSource();
      mockSignalSource.findFirst.mockResolvedValue(existing);
      mockSignalSource.update.mockResolvedValue(existing);

      const result = await configurePostHog(ORG_ID, {
        projectId: PROJECT_ID,
        personalApiKey: API_KEY,
        trackedEvents: ['custom_event'],
      });

      expect(result.sourceId).toBe(SOURCE_ID);
      expect(mockSignalSource.update).toHaveBeenCalledWith({
        where: { id: SOURCE_ID },
        data: expect.objectContaining({
          name: `PostHog: Project ${PROJECT_ID}`,
          status: 'ACTIVE',
          config: expect.objectContaining({
            trackedEvents: ['custom_event'],
          }),
        }),
      });
    });

    it('should throw when API key validation fails', async () => {
      mockFetchError(401, 'Unauthorized');

      await expect(
        configurePostHog(ORG_ID, {
          projectId: PROJECT_ID,
          personalApiKey: 'bad-key',
        }),
      ).rejects.toThrow('Failed to validate PostHog credentials');
    });

    it('should use custom host when provided', async () => {
      mockFetchSuccess({ id: PROJECT_ID });
      mockSignalSource.findFirst.mockResolvedValue(null);
      mockSignalSource.create.mockResolvedValue(makeSource({ host: 'posthog.mycompany.com' }));

      await configurePostHog(ORG_ID, {
        host: 'posthog.mycompany.com',
        projectId: PROJECT_ID,
        personalApiKey: API_KEY,
      });

      // Verify fetch was called with custom host
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('posthog.mycompany.com'),
        expect.any(Object),
      );
    });
  });

  // ================================================================
  // getPostHogStatus
  // ================================================================
  describe('getPostHogStatus', () => {
    it('should return connected status when source exists', async () => {
      const source = makeSource({
        lastSyncAt: '2025-06-01T00:00:00Z',
        lastSyncResult: { eventsProcessed: 50, signalsCreated: 20 },
      });
      mockSignalSource.findFirst.mockResolvedValue(source);

      const result = await getPostHogStatus(ORG_ID);

      expect(result).toEqual({
        connected: true,
        host: 'app.posthog.com',
        projectId: PROJECT_ID,
        trackedEvents: ['$pageview', 'signup', 'feature_used'],
        webhookUrl: expect.stringContaining('/api/v1/webhooks/posthog/'),
        lastSyncAt: '2025-06-01T00:00:00Z',
        lastSyncResult: { eventsProcessed: 50, signalsCreated: 20 },
        sourceId: SOURCE_ID,
      });
    });

    it('should return disconnected status when no source exists', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      const result = await getPostHogStatus(ORG_ID);

      expect(result).toEqual({
        connected: false,
        host: null,
        projectId: null,
        trackedEvents: [],
        webhookUrl: null,
        lastSyncAt: null,
        lastSyncResult: null,
        sourceId: null,
      });
    });
  });

  // ================================================================
  // disconnectPostHog
  // ================================================================
  describe('disconnectPostHog', () => {
    it('should delete the signal source', async () => {
      mockSignalSource.findFirst.mockResolvedValue(makeSource());
      mockSignalSource.delete.mockResolvedValue({});

      await disconnectPostHog(ORG_ID);

      expect(mockSignalSource.delete).toHaveBeenCalledWith({
        where: { id: SOURCE_ID },
      });
    });

    it('should throw when not connected', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      await expect(disconnectPostHog(ORG_ID)).rejects.toThrow(
        'PostHog is not connected for this organization',
      );
    });
  });

  // ================================================================
  // handlePostHogWebhook
  // ================================================================
  describe('handlePostHogWebhook', () => {
    it('should process a single-event webhook payload and create a signal', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      const event = makePostHogEvent({ event: 'signup' });

      // No existing signal
      mockSignal.findUnique.mockResolvedValue(null);

      // No identity resolution match
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);

      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await handlePostHogWebhook(SOURCE_ID, event as Record<string, unknown>);

      expect(result.processed).toBe(true);
      expect(result.signalsCreated).toBe(1);
      expect(result.signalType).toBe('signup');

      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          sourceId: SOURCE_ID,
          type: 'signup',
        }),
      });
    });

    it('should skip low-value events ($pageleave, $autocapture)', async () => {
      const source = makeSource({ trackedEvents: [] }); // track all
      mockSignalSource.findUnique.mockResolvedValue(source);

      const result = await handlePostHogWebhook(SOURCE_ID, {
        event: '$pageleave',
        distinct_id: 'user-1',
        properties: {},
        timestamp: new Date().toISOString(),
      });

      expect(result.processed).toBe(true);
      expect(result.signalsCreated).toBe(0);
      expect(mockSignal.create).not.toHaveBeenCalled();
    });

    it('should skip events not in the tracked list', async () => {
      const source = makeSource({ trackedEvents: ['signup'] });
      mockSignalSource.findUnique.mockResolvedValue(source);

      const result = await handlePostHogWebhook(SOURCE_ID, {
        event: 'untracked_event',
        distinct_id: 'user-1',
        properties: {},
        timestamp: new Date().toISOString(),
      });

      expect(result.signalsCreated).toBe(0);
    });

    it('should skip duplicate events (idempotency)', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      const event = makePostHogEvent();
      mockSignal.findUnique.mockResolvedValue({ id: 'existing-sig' });

      const result = await handlePostHogWebhook(SOURCE_ID, event as Record<string, unknown>);

      expect(result.signalsCreated).toBe(0);
      expect(mockSignal.create).not.toHaveBeenCalled();
    });

    it('should throw when source is not found', async () => {
      mockSignalSource.findUnique.mockResolvedValue(null);

      await expect(
        handlePostHogWebhook('nonexistent', {}),
      ).rejects.toThrow('PostHog source not found');
    });

    it('should throw when source type is not POSTHOG', async () => {
      mockSignalSource.findUnique.mockResolvedValue({
        id: SOURCE_ID,
        type: 'GITHUB',
        config: {},
      });

      await expect(
        handlePostHogWebhook(SOURCE_ID, {}),
      ).rejects.toThrow('PostHog source not found');
    });

    it('should throw on invalid webhook signature', async () => {
      const source = makeSource({ webhookSecret: 'my-secret-key' });
      mockSignalSource.findUnique.mockResolvedValue(source);

      const payload = { event: 'signup', distinct_id: 'user-1', properties: {}, timestamp: new Date().toISOString() };

      await expect(
        handlePostHogWebhook(SOURCE_ID, payload, 'invalid-signature'),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should process nested data payload shape', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const payload = {
        data: {
          event: 'signup',
          distinct_id: 'user-nested',
          uuid: 'uuid-nested',
          properties: {},
          timestamp: new Date().toISOString(),
        },
      };

      const result = await handlePostHogWebhook(SOURCE_ID, payload);

      expect(result.signalsCreated).toBe(1);
    });

    it('should process batch payload shape', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const payload = {
        batch: [
          { event: 'signup', distinct_id: 'user-1', uuid: 'uuid-1', properties: {}, timestamp: new Date().toISOString() },
          { event: 'feature_used', distinct_id: 'user-2', uuid: 'uuid-2', properties: {}, timestamp: new Date().toISOString() },
        ],
      };

      const result = await handlePostHogWebhook(SOURCE_ID, payload);

      expect(result.signalsCreated).toBe(2);
    });

    it('should resolve identity by email from $set properties', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      const event = makePostHogEvent({
        event: 'signup',
        properties: {
          $set: { email: 'jane@example.com' },
        },
      });

      mockSignal.findUnique.mockResolvedValue(null);

      // No PostHog identity
      mockContactIdentity.findFirst.mockResolvedValue(null);

      // Email match found
      mockContact.findFirst.mockResolvedValue({ id: 'contact-jane', companyId: 'company-1' });

      mockContactIdentity.upsert.mockResolvedValue({});
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await handlePostHogWebhook(SOURCE_ID, event as Record<string, unknown>);

      expect(result.signalsCreated).toBe(1);
      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'contact-jane',
          accountId: 'company-1',
          anonymousId: null,
        }),
      });
    });

    it('should resolve identity when distinct_id is an email', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      const event = makePostHogEvent({
        event: 'signup',
        distinct_id: 'bob@company.com',
        properties: {},
      });

      mockSignal.findUnique.mockResolvedValue(null);

      // No PostHog identity
      mockContactIdentity.findFirst.mockResolvedValue(null);

      // First findFirst for email match on distinct_id directly (step 2 tries email=null first)
      mockContact.findFirst
        .mockResolvedValueOnce(null) // step 2: email match with extracted email (null)
        .mockResolvedValueOnce({ id: 'contact-bob', companyId: null }); // step 4: distinct_id as email

      mockContactIdentity.upsert.mockResolvedValue({});
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await handlePostHogWebhook(SOURCE_ID, event as Record<string, unknown>);

      expect(result.signalsCreated).toBe(1);
    });

    it('should map known event types to signal types', async () => {
      const source = makeSource();
      mockSignalSource.findUnique.mockResolvedValue(source);

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const event = makePostHogEvent({ event: '$pageview' });
      await handlePostHogWebhook(SOURCE_ID, event as Record<string, unknown>);

      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'page_view',
        }),
      });
    });

    it('should sanitize custom event names for signal type', async () => {
      const source = makeSource({ trackedEvents: ['My Custom Event!'] });
      mockSignalSource.findUnique.mockResolvedValue(source);

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const event = makePostHogEvent({ event: 'My Custom Event!' });
      await handlePostHogWebhook(SOURCE_ID, event as Record<string, unknown>);

      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'posthog_my_custom_event',
        }),
      });
    });
  });

  // ================================================================
  // syncPostHogEvents
  // ================================================================
  describe('syncPostHogEvents', () => {
    it('should throw when not connected', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      await expect(syncPostHogEvents(ORG_ID)).rejects.toThrow(
        'PostHog is not connected for this organization',
      );
    });

    it('should fetch events for each tracked event type and create signals', async () => {
      const source = makeSource({ trackedEvents: ['signup'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      const events = [makePostHogEvent({ event: 'signup', uuid: 'uuid-sync-1' })];
      mockFetchSuccess({ results: events });

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncPostHogEvents(ORG_ID);

      expect(result.eventsProcessed).toBe(1);
      expect(result.signalsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip duplicate events during sync (idempotency)', async () => {
      const source = makeSource({ trackedEvents: ['signup'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess({ results: [makePostHogEvent({ event: 'signup' })] });
      mockSignal.findUnique.mockResolvedValue({ id: 'existing' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncPostHogEvents(ORG_ID);

      expect(result.eventsProcessed).toBe(1);
      expect(result.signalsCreated).toBe(0);
      expect(mockSignal.create).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully per event type', async () => {
      const source = makeSource({ trackedEvents: ['signup', 'feature_used'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      // First event type fails
      mockFetchError(500, 'Internal Server Error');

      // Second event type succeeds
      mockFetchSuccess({ results: [makePostHogEvent({ event: 'feature_used', uuid: 'uuid-f1' })] });

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncPostHogEvents(ORG_ID);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('signup');
      expect(result.signalsCreated).toBe(1);
    });

    it('should update source status to ERROR when there are sync errors', async () => {
      const source = makeSource({ trackedEvents: ['signup'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchError(500, 'Server Error');
      mockSignalSource.update.mockResolvedValue({});

      await syncPostHogEvents(ORG_ID);

      expect(mockSignalSource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ERROR',
          }),
        }),
      );
    });

    it('should set status to ACTIVE when sync succeeds without errors', async () => {
      const source = makeSource({ trackedEvents: ['signup'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess({ results: [] });
      mockSignalSource.update.mockResolvedValue({});

      await syncPostHogEvents(ORG_ID);

      expect(mockSignalSource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
            errorMessage: null,
          }),
        }),
      );
    });

    it('should resolve contacts and increment contactsResolved count', async () => {
      const source = makeSource({ trackedEvents: ['signup'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      const event = makePostHogEvent({
        event: 'signup',
        properties: { email: 'dev@example.com' },
      });
      mockFetchSuccess({ results: [event] });

      mockSignal.findUnique.mockResolvedValue(null);

      // PostHog identity not found, but email match succeeds
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue({ id: 'contact-dev', companyId: 'company-dev' });
      mockContactIdentity.upsert.mockResolvedValue({});

      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncPostHogEvents(ORG_ID);

      expect(result.contactsResolved).toBe(1);
    });
  });

  // ================================================================
  // getPostHogConnectedOrganizations
  // ================================================================
  describe('getPostHogConnectedOrganizations', () => {
    it('should return organization IDs with active PostHog sources', async () => {
      mockSignalSource.findMany.mockResolvedValue([
        { organizationId: 'org-a' },
        { organizationId: 'org-b' },
      ]);

      const result = await getPostHogConnectedOrganizations();

      expect(result).toEqual(['org-a', 'org-b']);
      expect(mockSignalSource.findMany).toHaveBeenCalledWith({
        where: { type: 'POSTHOG', status: 'ACTIVE' },
        select: { organizationId: true },
        distinct: ['organizationId'],
      });
    });

    it('should return empty array when no organizations connected', async () => {
      mockSignalSource.findMany.mockResolvedValue([]);

      const result = await getPostHogConnectedOrganizations();

      expect(result).toEqual([]);
    });
  });
});
