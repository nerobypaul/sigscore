import '../../__tests__/setup';

// ---------------------------------------------------------------------------
// Mocks - must be declared before imports
// ---------------------------------------------------------------------------

const mockSignalSource = {
  findFirst: jest.fn(),
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
  configureReddit,
  getRedditConfig,
  getRedditStatus,
  disconnectReddit,
  syncReddit,
  getRedditConnectedOrganizations,
} from '../reddit-connector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 'org-test-123';
const SOURCE_ID = 'source-reddit-456';

function makeSource(config: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_ID,
    organizationId: ORG_ID,
    type: 'REDDIT',
    name: 'Reddit: test',
    status: 'ACTIVE',
    config: {
      keywords: ['devsignal'],
      subreddits: ['webdev'],
      lastSyncAt: null,
      lastSyncResult: null,
      ...config,
    },
    lastSyncAt: null,
    errorMessage: null,
    ...overrides,
  };
}

function makeRedditListing(posts: Record<string, unknown>[] = []) {
  return {
    kind: 'Listing',
    data: {
      children: posts.map((p) => ({ kind: 't3', data: p })),
      after: null,
      before: null,
    },
  };
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc123',
    name: 't3_abc123',
    title: 'Check out DevSignal',
    selftext: 'Great tool for developer signals.',
    author: 'testuser',
    subreddit: 'webdev',
    score: 42,
    num_comments: 5,
    permalink: '/r/webdev/comments/abc123/check_out_devsignal/',
    url: 'https://devsignal.dev',
    created_utc: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    is_self: true,
    link_flair_text: null,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Reddit Connector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ================================================================
  // configureReddit
  // ================================================================
  describe('configureReddit', () => {
    it('should create a new signal source when none exists', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);
      mockSignalSource.create.mockResolvedValue(makeSource());

      await configureReddit(ORG_ID, {
        keywords: ['devsignal', 'developer signals'],
        subreddits: ['r/webdev', 'startups'],
      });

      expect(mockSignalSource.findFirst).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, type: 'REDDIT' },
      });

      expect(mockSignalSource.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          type: 'REDDIT',
          name: 'Reddit: devsignal, developer signals',
          status: 'ACTIVE',
          config: expect.objectContaining({
            keywords: ['devsignal', 'developer signals'],
            subreddits: ['webdev', 'startups'],
          }),
        }),
      });
    });

    it('should update existing signal source when one exists', async () => {
      const existing = makeSource();
      mockSignalSource.findFirst.mockResolvedValue(existing);
      mockSignalSource.update.mockResolvedValue(existing);

      await configureReddit(ORG_ID, {
        keywords: ['new-keyword'],
        subreddits: ['r/programming'],
      });

      expect(mockSignalSource.update).toHaveBeenCalledWith({
        where: { id: SOURCE_ID },
        data: expect.objectContaining({
          name: 'Reddit: new-keyword',
          status: 'ACTIVE',
          errorMessage: null,
          config: expect.objectContaining({
            keywords: ['new-keyword'],
            subreddits: ['programming'],
          }),
        }),
      });
    });

    it('should strip r/ prefix and lowercase subreddit names', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);
      mockSignalSource.create.mockResolvedValue(makeSource());

      await configureReddit(ORG_ID, {
        keywords: ['test'],
        subreddits: ['r/WebDev', 'r/JavaScript', 'StartUps'],
      });

      const createCall = mockSignalSource.create.mock.calls[0][0];
      expect(createCall.data.config.subreddits).toEqual([
        'webdev',
        'javascript',
        'startups',
      ]);
    });

    it('should filter empty keywords and subreddits', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);
      mockSignalSource.create.mockResolvedValue(makeSource());

      await configureReddit(ORG_ID, {
        keywords: ['valid', '', '  '],
        subreddits: ['webdev', '', '  '],
      });

      const createCall = mockSignalSource.create.mock.calls[0][0];
      expect(createCall.data.config.keywords).toEqual(['valid']);
      expect(createCall.data.config.subreddits).toEqual(['webdev']);
    });
  });

  // ================================================================
  // getRedditConfig
  // ================================================================
  describe('getRedditConfig', () => {
    it('should return config when source exists', async () => {
      const source = makeSource({ keywords: ['test'], subreddits: ['webdev'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      const result = await getRedditConfig(ORG_ID);

      expect(result).toEqual(expect.objectContaining({
        keywords: ['test'],
        subreddits: ['webdev'],
      }));
    });

    it('should return null when no source exists', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      const result = await getRedditConfig(ORG_ID);

      expect(result).toBeNull();
    });
  });

  // ================================================================
  // getRedditStatus
  // ================================================================
  describe('getRedditStatus', () => {
    it('should return connected status with config details when source exists', async () => {
      const source = makeSource({
        keywords: ['devsignal'],
        subreddits: ['webdev'],
        lastSyncAt: '2025-01-01T00:00:00Z',
        lastSyncResult: { postsProcessed: 10, signalsCreated: 5 },
      });
      mockSignalSource.findFirst.mockResolvedValue(source);

      const result = await getRedditStatus(ORG_ID);

      expect(result).toEqual({
        connected: true,
        keywords: ['devsignal'],
        subreddits: ['webdev'],
        lastSyncAt: '2025-01-01T00:00:00Z',
        lastSyncResult: { postsProcessed: 10, signalsCreated: 5 },
        sourceId: SOURCE_ID,
      });
    });

    it('should return disconnected status when no source exists', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      const result = await getRedditStatus(ORG_ID);

      expect(result).toEqual({
        connected: false,
        keywords: [],
        subreddits: [],
        lastSyncAt: null,
        lastSyncResult: null,
        sourceId: null,
      });
    });
  });

  // ================================================================
  // disconnectReddit
  // ================================================================
  describe('disconnectReddit', () => {
    it('should delete the signal source', async () => {
      mockSignalSource.findFirst.mockResolvedValue(makeSource());
      mockSignalSource.delete.mockResolvedValue({});

      await disconnectReddit(ORG_ID);

      expect(mockSignalSource.delete).toHaveBeenCalledWith({
        where: { id: SOURCE_ID },
      });
    });

    it('should throw when not connected', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      await expect(disconnectReddit(ORG_ID)).rejects.toThrow(
        'Reddit is not connected for this organization',
      );
    });
  });

  // ================================================================
  // syncReddit
  // ================================================================
  describe('syncReddit', () => {
    it('should throw when not connected', async () => {
      mockSignalSource.findFirst.mockResolvedValue(null);

      await expect(syncReddit(ORG_ID)).rejects.toThrow(
        'Reddit is not connected for this organization',
      );
    });

    it('should return early with error when no keywords or subreddits configured', async () => {
      mockSignalSource.findFirst.mockResolvedValue(
        makeSource({ keywords: [], subreddits: [] }),
      );

      const result = await syncReddit(ORG_ID);

      expect(result.postsProcessed).toBe(0);
      expect(result.signalsCreated).toBe(0);
      expect(result.errors).toContain('No keywords or subreddits configured');
    });

    it('should process keyword search results and create signals', async () => {
      const post = makePost();
      const source = makeSource({ keywords: ['devsignal'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      // Mock the Reddit search API call
      mockFetchSuccess(makeRedditListing([post]));

      // Signal does not exist yet (idempotency)
      mockSignal.findUnique.mockResolvedValue(null);

      // No contact identity found
      mockContactIdentity.findFirst.mockResolvedValue(null);
      // No contact by github username
      mockContact.findFirst.mockResolvedValue(null);

      // Signal creation
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });

      // Update source after sync
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      expect(result.postsProcessed).toBe(1);
      expect(result.signalsCreated).toBe(1);
      expect(result.errors).toHaveLength(0);

      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG_ID,
          sourceId: SOURCE_ID,
          type: 'reddit_discussion',
          idempotencyKey: `reddit:${post.id}`,
          anonymousId: `reddit:${post.author}`,
        }),
      });
    });

    it('should skip duplicate signals (idempotency check)', async () => {
      const post = makePost();
      const source = makeSource({ keywords: ['devsignal'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([post]));

      // Signal already exists
      mockSignal.findUnique.mockResolvedValue({ id: 'existing-sig' });

      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      expect(result.postsProcessed).toBe(1);
      expect(result.signalsCreated).toBe(0);
      expect(mockSignal.create).not.toHaveBeenCalled();
    });

    it('should skip deleted authors and AutoModerator', async () => {
      const deletedPost = makePost({ author: '[deleted]' });
      const autoModPost = makePost({ author: 'AutoModerator', id: 'auto1' });
      const validPost = makePost({ author: 'realuser', id: 'real1' });

      const source = makeSource({ keywords: ['test'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([deletedPost, autoModPost, validPost]));

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      // Only the valid post should be processed
      expect(result.postsProcessed).toBe(1);
      expect(result.signalsCreated).toBe(1);
    });

    it('should skip posts older than the cutoff', async () => {
      const oldPost = makePost({
        created_utc: Math.floor(Date.now() / 1000) - 8 * 24 * 3600, // 8 days ago
      });

      const source = makeSource({ keywords: ['test'], subreddits: [], lastSyncAt: null });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([oldPost]));
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      // The post is older than 7 days (default cutoff), so it is skipped
      expect(result.postsProcessed).toBe(0);
      expect(result.signalsCreated).toBe(0);
    });

    it('should classify showcase subreddit posts correctly', async () => {
      const showcasePost = makePost({ subreddit: 'sideproject' });

      const source = makeSource({ keywords: ['test'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([showcasePost]));
      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      await syncReddit(ORG_ID);

      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'reddit_showcase',
        }),
      });
    });

    it('should classify question posts correctly', async () => {
      const questionPost = makePost({ title: 'How do I use DevSignal?' });

      const source = makeSource({ keywords: ['devsignal'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([questionPost]));
      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      await syncReddit(ORG_ID);

      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'reddit_question',
        }),
      });
    });

    it('should resolve contact by Reddit identity', async () => {
      const post = makePost({ author: 'known_user' });
      const source = makeSource({ keywords: ['test'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([post]));
      mockSignal.findUnique.mockResolvedValue(null);

      // Identity found
      mockContactIdentity.findFirst.mockResolvedValue({
        contact: { id: 'contact-1', organizationId: ORG_ID },
      });

      // Contact has a company
      mockContact.findFirst.mockResolvedValue({ id: 'contact-1', companyId: 'company-1' });

      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      expect(result.contactsResolved).toBe(1);
      expect(mockSignal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: 'contact-1',
          accountId: 'company-1',
          anonymousId: null,
        }),
      });
    });

    it('should resolve contact by GitHub username match', async () => {
      const post = makePost({ author: 'githubuser' });
      const source = makeSource({ keywords: ['test'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetchSuccess(makeRedditListing([post]));
      mockSignal.findUnique.mockResolvedValue(null);

      // No Reddit identity
      mockContactIdentity.findFirst.mockResolvedValue(null);

      // GitHub username match
      mockContact.findFirst
        .mockResolvedValueOnce({ id: 'contact-gh' }) // github match
        .mockResolvedValueOnce({ id: 'contact-gh', companyId: null }); // company lookup

      mockContactIdentity.upsert.mockResolvedValue({});
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      expect(result.contactsResolved).toBe(1);
      expect(mockContactIdentity.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            type: 'REDDIT',
            value: 'reddit:githubuser',
            confidence: 0.3,
          }),
        }),
      );
    });

    it('should handle API errors gracefully during keyword search', async () => {
      const source = makeSource({ keywords: ['test'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('server error'),
        headers: new Headers(),
      });

      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Keyword search');
    });

    it('should update source status to ERROR when there are sync errors', async () => {
      const source = makeSource({ keywords: ['test'], subreddits: [] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: () => Promise.resolve(''),
        headers: new Headers(),
      });

      mockSignalSource.update.mockResolvedValue({});

      await syncReddit(ORG_ID);

      expect(mockSignalSource.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ERROR',
          }),
        }),
      );
    });

    it('should sync subreddit posts that match keywords', async () => {
      const matchingPost = makePost({ id: 'match1', title: 'Using devsignal for monitoring', subreddit: 'programming' });
      const nonMatchingPost = makePost({ id: 'nomatch', title: 'Random post about cats', selftext: 'meow', subreddit: 'programming' });

      const source = makeSource({ keywords: ['devsignal'], subreddits: ['programming'] });
      mockSignalSource.findFirst.mockResolvedValue(source);

      // First call for keyword search, second for subreddit
      mockFetchSuccess(makeRedditListing([])); // keyword search returns nothing
      mockFetchSuccess(makeRedditListing([matchingPost, nonMatchingPost])); // subreddit fetch

      mockSignal.findUnique.mockResolvedValue(null);
      mockContactIdentity.findFirst.mockResolvedValue(null);
      mockContact.findFirst.mockResolvedValue(null);
      mockSignal.create.mockResolvedValue({ id: 'sig-1' });
      mockSignalSource.update.mockResolvedValue({});

      const result = await syncReddit(ORG_ID);

      // Only the matching post should be processed (subreddit with keyword filter)
      expect(result.postsProcessed).toBe(1);
      expect(result.signalsCreated).toBe(1);
    });
  });

  // ================================================================
  // getRedditConnectedOrganizations
  // ================================================================
  describe('getRedditConnectedOrganizations', () => {
    it('should return organization IDs with active Reddit sources', async () => {
      mockSignalSource.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
        { organizationId: 'org-2' },
      ]);

      const result = await getRedditConnectedOrganizations();

      expect(result).toEqual(['org-1', 'org-2']);
      expect(mockSignalSource.findMany).toHaveBeenCalledWith({
        where: { type: 'REDDIT', status: 'ACTIVE' },
        select: { organizationId: true },
        distinct: ['organizationId'],
      });
    });

    it('should return empty array when no organizations are connected', async () => {
      mockSignalSource.findMany.mockResolvedValue([]);

      const result = await getRedditConnectedOrganizations();

      expect(result).toEqual([]);
    });
  });
});
