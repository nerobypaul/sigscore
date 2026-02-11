import '../setup';
import { mockRequest, mockResponse, mockNext } from '../helpers';
import { errorHandler, notFoundHandler } from '../../middleware/error';
import { ZodError, ZodIssue } from 'zod';

describe('Error Handler Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('errorHandler', () => {
    it('should return 400 for ZodError with validation details', () => {
      const issues: ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['email'],
          message: 'Expected string, received number',
        },
      ];
      const zodError = new ZodError(issues);

      const req = mockRequest({ path: '/api/v1/auth/register' } as any);
      const res = mockResponse();
      const next = mockNext();

      errorHandler(zodError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation error',
        details: zodError.errors,
      });
    });

    it('should return 401 for JsonWebTokenError', () => {
      const jwtError = new Error('jwt malformed');
      jwtError.name = 'JsonWebTokenError';

      const req = mockRequest({ path: '/api/v1/auth/me' } as any);
      const res = mockResponse();
      const next = mockNext();

      errorHandler(jwtError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 401 for TokenExpiredError', () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';

      const req = mockRequest({ path: '/api/v1/contacts' } as any);
      const res = mockResponse();
      const next = mockNext();

      errorHandler(expiredError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should return 500 for unknown errors', () => {
      const genericError = new Error('Something went wrong');

      const req = mockRequest({ path: '/api/v1/contacts' } as any);
      const res = mockResponse();
      const next = mockNext();

      errorHandler(genericError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should not leak error details in 500 response', () => {
      const sensitiveError = new Error('Connection to postgres://secret:pass@host failed');

      const req = mockRequest({ path: '/api/v1/contacts' } as any);
      const res = mockResponse();
      const next = mockNext();

      errorHandler(sensitiveError, req, res, next);

      const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonCall.error).toBe('Internal server error');
      expect(JSON.stringify(jsonCall)).not.toContain('postgres');
      expect(JSON.stringify(jsonCall)).not.toContain('secret');
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route not found message', () => {
      const req = mockRequest({ path: '/unknown' } as any);
      const res = mockResponse();

      notFoundHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Route not found' });
    });
  });
});
