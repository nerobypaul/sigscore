import './setup';
import { mockPrisma } from './setup';
import request from 'supertest';
import app from '../../app';
import {
  authHeaders,
  setupAuthMocks,
  TEST_ORG_ID,
} from './helpers';

describe('Companies CRUD Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(mockPrisma);
  });

  const sampleCompany = {
    id: 'company-int-1',
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Technology',
    size: 'MEDIUM',
    email: 'info@acme.com',
    phone: null,
    website: 'https://acme.com',
    address: null,
    city: 'San Francisco',
    state: 'CA',
    postalCode: null,
    country: 'US',
    linkedIn: null,
    twitter: null,
    githubOrg: null,
    description: 'A technology company',
    organizationId: TEST_ORG_ID,
    customFields: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: [],
    _count: { contacts: 5, deals: 2 },
  };

  // ================================================================
  // POST /api/v1/companies
  // ================================================================
  describe('POST /api/v1/companies', () => {
    it('should create a company and return 201', async () => {
      mockPrisma.company.create.mockResolvedValue(sampleCompany);

      const res = await request(app)
        .post('/api/v1/companies')
        .set(authHeaders())
        .send({ name: 'Acme Corp', industry: 'Technology' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Acme Corp');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/companies')
        .set(authHeaders())
        .send({ industry: 'Technology' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid size enum value', async () => {
      const res = await request(app)
        .post('/api/v1/companies')
        .set(authHeaders())
        .send({ name: 'Test', size: 'MEGA' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid website URL', async () => {
      const res = await request(app)
        .post('/api/v1/companies')
        .set(authHeaders())
        .send({ name: 'Test', website: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/companies')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // GET /api/v1/companies
  // ================================================================
  describe('GET /api/v1/companies', () => {
    it('should return paginated companies', async () => {
      mockPrisma.company.findMany.mockResolvedValue([sampleCompany]);
      mockPrisma.company.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/companies')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('companies');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.companies)).toBe(true);
    });
  });

  // ================================================================
  // GET /api/v1/companies/:id
  // ================================================================
  describe('GET /api/v1/companies/:id', () => {
    it('should return a single company', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(sampleCompany);

      const res = await request(app)
        .get('/api/v1/companies/company-int-1')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('company-int-1');
      expect(res.body.name).toBe('Acme Corp');
    });

    it('should return 404 for non-existent company', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/companies/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Company not found');
    });
  });

  // ================================================================
  // PUT /api/v1/companies/:id
  // ================================================================
  describe('PUT /api/v1/companies/:id', () => {
    it('should update a company', async () => {
      const updated = { ...sampleCompany, name: 'Acme Inc' };
      mockPrisma.company.findFirst.mockResolvedValue(sampleCompany);
      mockPrisma.company.update.mockResolvedValue(updated);

      const res = await request(app)
        .put('/api/v1/companies/company-int-1')
        .set(authHeaders())
        .send({ name: 'Acme Inc' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Acme Inc');
    });

    it('should return 400 for invalid email on update', async () => {
      const res = await request(app)
        .put('/api/v1/companies/company-int-1')
        .set(authHeaders())
        .send({ email: 'bad-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  // ================================================================
  // DELETE /api/v1/companies/:id
  // ================================================================
  describe('DELETE /api/v1/companies/:id', () => {
    it('should delete a company and return 204', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(sampleCompany);
      mockPrisma.company.delete.mockResolvedValue(sampleCompany);

      const res = await request(app)
        .delete('/api/v1/companies/company-int-1')
        .set(authHeaders());

      expect(res.status).toBe(204);
    });

    it('should return 404 when company does not exist', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/companies/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(404);
    });
  });
});
