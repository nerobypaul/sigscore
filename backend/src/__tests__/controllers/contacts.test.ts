import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

// Mock the contacts service module
jest.mock('../../services/contacts');

import {
  getContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
} from '../../controllers/contacts';

import * as contactService from '../../services/contacts';

// Cast as any to avoid strict Prisma type requirements on mock data
const mockedService = contactService as any;

describe('Contacts Controller', () => {
  const orgId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // GET /contacts (list)
  // ================================================================
  describe('getContacts', () => {
    it('should return paginated contacts with default filters', async () => {
      const contacts = [testData.contact(), testData.contact({ id: 'contact-2' })];
      const result = testData.paginatedResult(contacts, 'contacts');

      mockedService.getContacts.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {},
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getContacts(req, res, next);

      expect(mockedService.getContacts).toHaveBeenCalledWith(orgId, {
        search: undefined,
        companyId: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    it('should pass search and pagination filters from query params', async () => {
      const result = testData.paginatedResult([], 'contacts');
      mockedService.getContacts.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: { search: 'Jane', companyId: 'company-1', page: '2', limit: '10' },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getContacts(req, res, next);

      expect(mockedService.getContacts).toHaveBeenCalledWith(orgId, {
        search: 'Jane',
        companyId: 'company-1',
        page: 2,
        limit: 10,
      });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Service down');
      mockedService.getContacts.mockRejectedValue(err);

      const req = mockRequest({ organizationId: orgId, query: {} } as any);
      const res = mockResponse();
      const next = mockNext();

      await getContacts(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // GET /contacts/:id
  // ================================================================
  describe('getContact', () => {
    it('should return a contact by id', async () => {
      const contact = testData.contact();
      mockedService.getContactById.mockResolvedValue(contact);

      const req = mockRequest({
        params: { id: 'contact-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getContact(req, res, next);

      expect(mockedService.getContactById).toHaveBeenCalledWith('contact-1', orgId);
      expect(res.json).toHaveBeenCalledWith(contact);
    });

    it('should return 404 when contact is not found', async () => {
      mockedService.getContactById.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'nonexistent' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getContact(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Contact not found' });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.getContactById.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'contact-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getContact(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // POST /contacts
  // ================================================================
  describe('createContact', () => {
    const createBody = {
      firstName: 'New',
      lastName: 'Contact',
      email: 'new@example.com',
      title: 'Engineer',
    };

    it('should create a contact and return 201', async () => {
      const created = testData.contact({ ...createBody, id: 'contact-new' });
      mockedService.createContact.mockResolvedValue(created);

      const req = mockRequest({
        organizationId: orgId,
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createContact(req, res, next);

      expect(mockedService.createContact).toHaveBeenCalledWith(orgId, createBody);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Unique constraint violated');
      mockedService.createContact.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createContact(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // PUT /contacts/:id
  // ================================================================
  describe('updateContact', () => {
    const updateBody = { firstName: 'Updated', title: 'Senior Engineer' };

    it('should update a contact and return the result', async () => {
      const updated = testData.contact({ ...updateBody });
      mockedService.updateContact.mockResolvedValue(updated);

      const req = mockRequest({
        params: { id: 'contact-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateContact(req, res, next);

      expect(mockedService.updateContact).toHaveBeenCalledWith('contact-1', orgId, updateBody);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Record not found');
      mockedService.updateContact.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'contact-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateContact(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // DELETE /contacts/:id
  // ================================================================
  describe('deleteContact', () => {
    it('should delete a contact and return 204', async () => {
      mockedService.deleteContact.mockResolvedValue(testData.contact());

      const req = mockRequest({
        params: { id: 'contact-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteContact(req, res, next);

      expect(mockedService.deleteContact).toHaveBeenCalledWith('contact-1', orgId);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Foreign key constraint');
      mockedService.deleteContact.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'contact-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteContact(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
