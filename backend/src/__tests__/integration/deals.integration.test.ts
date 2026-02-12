import './setup';
import { mockPrisma } from './setup';
import request from 'supertest';
import app from '../../app';
import {
  authHeaders,
  setupAuthMocks,
  TEST_ORG_ID,
} from './helpers';

describe('Deals CRUD Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(mockPrisma);
  });

  const sampleDeal = {
    id: 'deal-int-1',
    title: 'Enterprise Plan',
    amount: 50000,
    currency: 'USD',
    stage: 'SALES_QUALIFIED',
    probability: 60,
    contactId: 'contact-1',
    companyId: 'company-1',
    ownerId: 'user-1',
    organizationId: TEST_ORG_ID,
    expectedCloseDate: new Date('2024-06-01'),
    closedAt: null,
    description: 'Enterprise deal',
    customFields: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    contact: { id: 'contact-1', firstName: 'Jane', lastName: 'Doe' },
    company: { id: 'company-1', name: 'Acme Corp' },
    owner: { id: 'user-1', firstName: 'Test', lastName: 'User' },
    tags: [],
  };

  // ================================================================
  // POST /api/v1/deals
  // ================================================================
  describe('POST /api/v1/deals', () => {
    it('should create a deal and return 201', async () => {
      mockPrisma.deal.create.mockResolvedValue(sampleDeal);

      const res = await request(app)
        .post('/api/v1/deals')
        .set(authHeaders())
        .send({ title: 'Enterprise Plan', amount: 50000, stage: 'SALES_QUALIFIED' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Enterprise Plan');
      expect(res.body.amount).toBe(50000);
    });

    it('should return 400 when title is missing', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set(authHeaders())
        .send({ amount: 50000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid stage value', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set(authHeaders())
        .send({ title: 'Test', stage: 'INVALID_STAGE' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for probability > 100', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set(authHeaders())
        .send({ title: 'Test', probability: 150 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for negative probability', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .set(authHeaders())
        .send({ title: 'Test', probability: -10 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept all valid PLG stages', async () => {
      const stages = [
        'ANONYMOUS_USAGE', 'IDENTIFIED', 'ACTIVATED', 'TEAM_ADOPTION',
        'EXPANSION_SIGNAL', 'SALES_QUALIFIED', 'NEGOTIATION',
        'CLOSED_WON', 'CLOSED_LOST',
      ];

      for (const stage of stages) {
        mockPrisma.deal.create.mockResolvedValue({ ...sampleDeal, stage });

        const res = await request(app)
          .post('/api/v1/deals')
          .set(authHeaders())
          .send({ title: `Deal ${stage}`, stage });

        expect(res.status).toBe(201);
      }
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/deals')
        .send({ title: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // GET /api/v1/deals
  // ================================================================
  describe('GET /api/v1/deals', () => {
    it('should return paginated deals', async () => {
      mockPrisma.deal.findMany.mockResolvedValue([sampleDeal]);
      mockPrisma.deal.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/deals')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('deals');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.deals)).toBe(true);
    });
  });

  // ================================================================
  // GET /api/v1/deals/:id
  // ================================================================
  describe('GET /api/v1/deals/:id', () => {
    it('should return a single deal', async () => {
      mockPrisma.deal.findFirst.mockResolvedValue(sampleDeal);

      const res = await request(app)
        .get('/api/v1/deals/deal-int-1')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('deal-int-1');
      expect(res.body.title).toBe('Enterprise Plan');
    });

    it('should return 404 for non-existent deal', async () => {
      mockPrisma.deal.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/deals/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Deal not found');
    });
  });

  // ================================================================
  // PUT /api/v1/deals/:id
  // ================================================================
  describe('PUT /api/v1/deals/:id', () => {
    it('should update a deal', async () => {
      const updated = { ...sampleDeal, title: 'Updated Deal', stage: 'NEGOTIATION' };
      mockPrisma.deal.findFirst.mockResolvedValue(sampleDeal);
      mockPrisma.deal.update.mockResolvedValue(updated);

      const res = await request(app)
        .put('/api/v1/deals/deal-int-1')
        .set(authHeaders())
        .send({ title: 'Updated Deal', stage: 'NEGOTIATION' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Deal');
      expect(res.body.stage).toBe('NEGOTIATION');
    });

    it('should return 400 for invalid stage on update', async () => {
      const res = await request(app)
        .put('/api/v1/deals/deal-int-1')
        .set(authHeaders())
        .send({ stage: 'NOT_A_STAGE' });

      expect(res.status).toBe(400);
    });
  });

  // ================================================================
  // DELETE /api/v1/deals/:id
  // ================================================================
  describe('DELETE /api/v1/deals/:id', () => {
    it('should delete a deal and return 204', async () => {
      mockPrisma.deal.findFirst.mockResolvedValue(sampleDeal);
      mockPrisma.deal.delete.mockResolvedValue(sampleDeal);

      const res = await request(app)
        .delete('/api/v1/deals/deal-int-1')
        .set(authHeaders());

      expect(res.status).toBe(204);
    });

    it('should return 500 when deal does not exist (service throws)', async () => {
      mockPrisma.deal.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/deals/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(500);
    });
  });
});
