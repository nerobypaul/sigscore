import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

jest.mock('../../services/companies');

import {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
} from '../../controllers/companies';

import * as companyService from '../../services/companies';

// Cast as any to avoid strict Prisma type requirements on mock data
const mockedService = companyService as any;

describe('Companies Controller', () => {
  const orgId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // GET /companies (list)
  // ================================================================
  describe('getCompanies', () => {
    it('should return paginated companies with default filters', async () => {
      const companies = [testData.company()];
      const result = testData.paginatedResult(companies, 'companies');

      mockedService.getCompanies.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {},
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getCompanies(req, res, next);

      expect(mockedService.getCompanies).toHaveBeenCalledWith(orgId, {
        search: undefined,
        industry: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should parse search, industry, page, and limit from query', async () => {
      const result = testData.paginatedResult([], 'companies');
      mockedService.getCompanies.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {
          search: 'Acme',
          industry: 'Technology',
          page: '3',
          limit: '5',
        },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getCompanies(req, res, next);

      expect(mockedService.getCompanies).toHaveBeenCalledWith(orgId, {
        search: 'Acme',
        industry: 'Technology',
        page: 3,
        limit: 5,
      });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Service error');
      mockedService.getCompanies.mockRejectedValue(err);

      const req = mockRequest({ organizationId: orgId, query: {} } as any);
      const res = mockResponse();
      const next = mockNext();

      await getCompanies(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // GET /companies/:id
  // ================================================================
  describe('getCompany', () => {
    it('should return a company by id', async () => {
      const company = testData.company();
      mockedService.getCompanyById.mockResolvedValue(company);

      const req = mockRequest({
        params: { id: 'company-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getCompany(req, res, next);

      expect(mockedService.getCompanyById).toHaveBeenCalledWith('company-1', orgId);
      expect(res.json).toHaveBeenCalledWith(company);
    });

    it('should return 404 when company is not found', async () => {
      mockedService.getCompanyById.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'nonexistent' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getCompany(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Company not found' });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.getCompanyById.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'company-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getCompany(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // POST /companies
  // ================================================================
  describe('createCompany', () => {
    const createBody = {
      name: 'New Corp',
      domain: 'newcorp.com',
      industry: 'Finance',
      size: 'STARTUP',
    };

    it('should create a company and return 201', async () => {
      const created = testData.company({ ...createBody, id: 'company-new' });
      mockedService.createCompany.mockResolvedValue(created);

      const req = mockRequest({
        organizationId: orgId,
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createCompany(req, res, next);

      expect(mockedService.createCompany).toHaveBeenCalledWith(orgId, createBody);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Unique constraint');
      mockedService.createCompany.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createCompany(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // PUT /companies/:id
  // ================================================================
  describe('updateCompany', () => {
    const updateBody = { name: 'Updated Corp', industry: 'Healthcare' };

    it('should update a company and return the result', async () => {
      const updated = testData.company({ ...updateBody });
      mockedService.updateCompany.mockResolvedValue(updated);

      const req = mockRequest({
        params: { id: 'company-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateCompany(req, res, next);

      expect(mockedService.updateCompany).toHaveBeenCalledWith('company-1', orgId, updateBody);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Not found');
      mockedService.updateCompany.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'company-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateCompany(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // DELETE /companies/:id
  // ================================================================
  describe('deleteCompany', () => {
    it('should delete a company and return 204', async () => {
      mockedService.deleteCompany.mockResolvedValue(testData.company());

      const req = mockRequest({
        params: { id: 'company-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteCompany(req, res, next);

      expect(mockedService.deleteCompany).toHaveBeenCalledWith('company-1', orgId);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Constraint violation');
      mockedService.deleteCompany.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'company-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteCompany(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
