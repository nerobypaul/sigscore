import './setup';
import { mockPrisma } from './setup';
import request from 'supertest';
import app from '../../app';
import {
  authHeaders,
  setupAuthMocks,
  TEST_ORG_ID,
} from './helpers';

describe('Contacts CRUD Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupAuthMocks(mockPrisma);
  });

  const sampleContact = {
    id: 'contact-int-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1234567890',
    mobile: null,
    title: 'CTO',
    companyId: 'company-1',
    organizationId: TEST_ORG_ID,
    address: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    linkedIn: null,
    twitter: null,
    github: null,
    notes: null,
    customFields: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    company: { id: 'company-1', name: 'Acme Corp' },
    tags: [],
  };

  // ================================================================
  // POST /api/v1/contacts
  // ================================================================
  describe('POST /api/v1/contacts', () => {
    it('should create a contact and return 201', async () => {
      mockPrisma.contact.create.mockResolvedValue(sampleContact);

      const res = await request(app)
        .post('/api/v1/contacts')
        .set(authHeaders())
        .send({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.firstName).toBe('Jane');
      expect(res.body.lastName).toBe('Doe');
    });

    it('should return 400 when firstName is missing', async () => {
      const res = await request(app)
        .post('/api/v1/contacts')
        .set(authHeaders())
        .send({ lastName: 'Doe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 when lastName is missing', async () => {
      const res = await request(app)
        .post('/api/v1/contacts')
        .set(authHeaders())
        .send({ firstName: 'Jane' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/contacts')
        .set(authHeaders())
        .send({ firstName: 'Jane', lastName: 'Doe', email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/contacts')
        .send({ firstName: 'Jane', lastName: 'Doe' });

      expect(res.status).toBe(401);
    });

    it('should return 400 without X-Organization-Id header', async () => {
      const res = await request(app)
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${require('./helpers').generateTestAccessToken()}`)
        .set('Content-Type', 'application/json')
        .send({ firstName: 'Jane', lastName: 'Doe' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Organization ID required');
    });
  });

  // ================================================================
  // GET /api/v1/contacts
  // ================================================================
  describe('GET /api/v1/contacts', () => {
    it('should return paginated contacts', async () => {
      mockPrisma.contact.findMany.mockResolvedValue([sampleContact]);
      mockPrisma.contact.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/contacts')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('contacts');
      expect(res.body).toHaveProperty('pagination');
      expect(Array.isArray(res.body.contacts)).toBe(true);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .get('/api/v1/contacts');

      expect(res.status).toBe(401);
    });
  });

  // ================================================================
  // GET /api/v1/contacts/:id
  // ================================================================
  describe('GET /api/v1/contacts/:id', () => {
    it('should return a single contact', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(sampleContact);

      const res = await request(app)
        .get('/api/v1/contacts/contact-int-1')
        .set(authHeaders());

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('contact-int-1');
      expect(res.body.firstName).toBe('Jane');
    });

    it('should return 404 for non-existent contact', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/contacts/nonexistent')
        .set(authHeaders());

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Contact not found');
    });
  });

  // ================================================================
  // PUT /api/v1/contacts/:id
  // ================================================================
  describe('PUT /api/v1/contacts/:id', () => {
    it('should update a contact', async () => {
      const updated = { ...sampleContact, firstName: 'Janet' };
      mockPrisma.contact.findFirst.mockResolvedValue(sampleContact);
      mockPrisma.contact.update.mockResolvedValue(updated);

      const res = await request(app)
        .put('/api/v1/contacts/contact-int-1')
        .set(authHeaders())
        .send({ firstName: 'Janet' });

      expect(res.status).toBe(200);
      expect(res.body.firstName).toBe('Janet');
    });

    it('should return 400 for invalid linkedIn URL', async () => {
      const res = await request(app)
        .put('/api/v1/contacts/contact-int-1')
        .set(authHeaders())
        .send({ linkedIn: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  // ================================================================
  // DELETE /api/v1/contacts/:id
  // ================================================================
  describe('DELETE /api/v1/contacts/:id', () => {
    it('should delete a contact and return 204', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(sampleContact);
      mockPrisma.contact.delete.mockResolvedValue(sampleContact);

      const res = await request(app)
        .delete('/api/v1/contacts/contact-int-1')
        .set(authHeaders());

      expect(res.status).toBe(204);
    });

    it('should return 500 when contact does not exist (service throws)', async () => {
      mockPrisma.contact.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/v1/contacts/nonexistent')
        .set(authHeaders());

      // The service throws Error('Contact not found') which becomes 500 via error handler
      expect(res.status).toBe(500);
    });
  });
});
