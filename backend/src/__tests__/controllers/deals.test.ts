import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

jest.mock('../../services/deals');
jest.mock('../../services/workflows', () => ({
  processEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
  getDeals,
  getDeal,
  createDeal,
  updateDeal,
  deleteDeal,
} from '../../controllers/deals';

import * as dealService from '../../services/deals';

// Cast as any to avoid strict Prisma type requirements on mock data
const mockedService = dealService as any;

describe('Deals Controller', () => {
  const orgId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // GET /deals (list)
  // ================================================================
  describe('getDeals', () => {
    it('should return paginated deals with default filters', async () => {
      const deals = [testData.deal()];
      const result = testData.paginatedResult(deals, 'deals');

      mockedService.getDeals.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {},
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getDeals(req, res, next);

      expect(mockedService.getDeals).toHaveBeenCalledWith(orgId, {
        stage: undefined,
        ownerId: undefined,
        companyId: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should parse stage, ownerId, companyId, page, limit from query', async () => {
      const result = testData.paginatedResult([], 'deals');
      mockedService.getDeals.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {
          stage: 'SALES_QUALIFIED',
          ownerId: 'user-1',
          companyId: 'company-1',
          page: '2',
          limit: '15',
        },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getDeals(req, res, next);

      expect(mockedService.getDeals).toHaveBeenCalledWith(orgId, {
        stage: 'SALES_QUALIFIED',
        ownerId: 'user-1',
        companyId: 'company-1',
        page: 2,
        limit: 15,
      });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Service error');
      mockedService.getDeals.mockRejectedValue(err);

      const req = mockRequest({ organizationId: orgId, query: {} } as any);
      const res = mockResponse();
      const next = mockNext();

      await getDeals(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // GET /deals/:id
  // ================================================================
  describe('getDeal', () => {
    it('should return a deal by id', async () => {
      const deal = testData.deal();
      mockedService.getDealById.mockResolvedValue(deal);

      const req = mockRequest({
        params: { id: 'deal-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getDeal(req, res, next);

      expect(mockedService.getDealById).toHaveBeenCalledWith('deal-1', orgId);
      expect(res.json).toHaveBeenCalledWith(deal);
    });

    it('should return 404 when deal is not found', async () => {
      mockedService.getDealById.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'nonexistent' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getDeal(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Deal not found' });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.getDealById.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'deal-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getDeal(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // POST /deals
  // ================================================================
  describe('createDeal', () => {
    const createBody = {
      title: 'New Enterprise Deal',
      amount: 100000,
      currency: 'USD',
      stage: 'IDENTIFIED',
      companyId: 'company-1',
    };

    it('should create a deal and return 201', async () => {
      const created = testData.deal({ ...createBody, id: 'deal-new' });
      mockedService.createDeal.mockResolvedValue(created);

      const req = mockRequest({
        organizationId: orgId,
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createDeal(req, res, next);

      expect(mockedService.createDeal).toHaveBeenCalledWith(orgId, createBody);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Constraint error');
      mockedService.createDeal.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createDeal(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // PUT /deals/:id
  // ================================================================
  describe('updateDeal', () => {
    const updateBody = {
      stage: 'NEGOTIATION',
      probability: 80,
      amount: 120000,
    };

    it('should update a deal and return the result', async () => {
      const oldDeal = testData.deal({ stage: 'IDENTIFIED' });
      const updated = testData.deal({ ...updateBody });
      mockedService.getDealById.mockResolvedValue(oldDeal);
      mockedService.updateDeal.mockResolvedValue(updated);

      const req = mockRequest({
        params: { id: 'deal-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateDeal(req, res, next);

      expect(mockedService.getDealById).toHaveBeenCalledWith('deal-1', orgId);
      expect(mockedService.updateDeal).toHaveBeenCalledWith('deal-1', orgId, updateBody);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Not found');
      mockedService.getDealById.mockResolvedValue(testData.deal());
      mockedService.updateDeal.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'deal-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateDeal(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // DELETE /deals/:id
  // ================================================================
  describe('deleteDeal', () => {
    it('should delete a deal and return 204', async () => {
      mockedService.deleteDeal.mockResolvedValue(testData.deal());

      const req = mockRequest({
        params: { id: 'deal-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteDeal(req, res, next);

      expect(mockedService.deleteDeal).toHaveBeenCalledWith('deal-1', orgId);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('FK constraint');
      mockedService.deleteDeal.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'deal-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteDeal(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
