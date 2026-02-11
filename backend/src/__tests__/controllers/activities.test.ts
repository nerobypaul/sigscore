import '../setup';
import { mockRequest, mockResponse, mockNext, testData } from '../helpers';

jest.mock('../../services/activities');

import {
  getActivities,
  getActivity,
  createActivity,
  updateActivity,
  deleteActivity,
} from '../../controllers/activities';

import * as activityService from '../../services/activities';

// Cast as any to avoid strict Prisma type requirements on mock data
const mockedService = activityService as any;

describe('Activities Controller', () => {
  const orgId = 'org-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // GET /activities (list)
  // ================================================================
  describe('getActivities', () => {
    it('should return paginated activities with default filters', async () => {
      const activities = [testData.activity()];
      const result = testData.paginatedResult(activities, 'activities');

      mockedService.getActivities.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {},
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getActivities(req, res, next);

      expect(mockedService.getActivities).toHaveBeenCalledWith(orgId, {
        type: undefined,
        status: undefined,
        userId: undefined,
        contactId: undefined,
        companyId: undefined,
        dealId: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should parse all filter query params', async () => {
      const result = testData.paginatedResult([], 'activities');
      mockedService.getActivities.mockResolvedValue(result);

      const req = mockRequest({
        organizationId: orgId,
        query: {
          type: 'CALL',
          status: 'PENDING',
          userId: 'user-1',
          contactId: 'contact-1',
          companyId: 'company-1',
          dealId: 'deal-1',
          page: '2',
          limit: '10',
        },
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getActivities(req, res, next);

      expect(mockedService.getActivities).toHaveBeenCalledWith(orgId, {
        type: 'CALL',
        status: 'PENDING',
        userId: 'user-1',
        contactId: 'contact-1',
        companyId: 'company-1',
        dealId: 'deal-1',
        page: 2,
        limit: 10,
      });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Service error');
      mockedService.getActivities.mockRejectedValue(err);

      const req = mockRequest({ organizationId: orgId, query: {} } as any);
      const res = mockResponse();
      const next = mockNext();

      await getActivities(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // GET /activities/:id
  // ================================================================
  describe('getActivity', () => {
    it('should return an activity by id', async () => {
      const activity = testData.activity();
      mockedService.getActivityById.mockResolvedValue(activity);

      const req = mockRequest({
        params: { id: 'activity-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getActivity(req, res, next);

      expect(mockedService.getActivityById).toHaveBeenCalledWith('activity-1', orgId);
      expect(res.json).toHaveBeenCalledWith(activity);
    });

    it('should return 404 when activity is not found', async () => {
      mockedService.getActivityById.mockResolvedValue(null);

      const req = mockRequest({
        params: { id: 'nonexistent' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getActivity(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Activity not found' });
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('DB error');
      mockedService.getActivityById.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'activity-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await getActivity(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // POST /activities
  // ================================================================
  describe('createActivity', () => {
    const createBody = {
      type: 'MEETING',
      title: 'Product Demo',
      description: 'Demo the new dashboard',
      status: 'PENDING',
      priority: 'HIGH',
      contactId: 'contact-1',
      dealId: 'deal-1',
    };

    it('should create an activity with userId from req.user and return 201', async () => {
      const created = testData.activity({ ...createBody, id: 'activity-new' });
      mockedService.createActivity.mockResolvedValue(created);

      const req = mockRequest({
        organizationId: orgId,
        user: testData.user(),
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createActivity(req, res, next);

      expect(mockedService.createActivity).toHaveBeenCalledWith(orgId, userId, createBody);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(created);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('FK violation');
      mockedService.createActivity.mockRejectedValue(err);

      const req = mockRequest({
        organizationId: orgId,
        user: testData.user(),
        body: createBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await createActivity(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // PUT /activities/:id
  // ================================================================
  describe('updateActivity', () => {
    const updateBody = {
      status: 'COMPLETED',
      completedAt: '2024-02-01T12:00:00.000Z',
    };

    it('should update an activity and return the result', async () => {
      const updated = testData.activity({ status: 'COMPLETED' });
      mockedService.updateActivity.mockResolvedValue(updated);

      const req = mockRequest({
        params: { id: 'activity-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateActivity(req, res, next);

      expect(mockedService.updateActivity).toHaveBeenCalledWith('activity-1', orgId, updateBody);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Not found');
      mockedService.updateActivity.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'activity-1' },
        organizationId: orgId,
        body: updateBody,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await updateActivity(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  // ================================================================
  // DELETE /activities/:id
  // ================================================================
  describe('deleteActivity', () => {
    it('should delete an activity and return 204', async () => {
      mockedService.deleteActivity.mockResolvedValue(testData.activity());

      const req = mockRequest({
        params: { id: 'activity-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteActivity(req, res, next);

      expect(mockedService.deleteActivity).toHaveBeenCalledWith('activity-1', orgId);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should call next(error) on service failure', async () => {
      const err = new Error('Constraint violation');
      mockedService.deleteActivity.mockRejectedValue(err);

      const req = mockRequest({
        params: { id: 'activity-1' },
        organizationId: orgId,
      } as any);
      const res = mockResponse();
      const next = mockNext();

      await deleteActivity(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
