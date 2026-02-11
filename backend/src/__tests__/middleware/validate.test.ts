import '../setup';
import { mockRequest, mockResponse, mockNext } from '../helpers';
import { validate } from '../../middleware/validate';
import { z } from 'zod';

describe('Validate Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    age: z.number().min(0).optional(),
  });

  it('should pass validation and set parsed body on request', async () => {
    const middleware = validate(schema);

    const req = mockRequest({
      body: { email: 'test@example.com', name: 'John', age: 30 },
    });
    const res = mockResponse();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'test@example.com', name: 'John', age: 30 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should strip unknown fields from body', async () => {
    const middleware = validate(schema);

    const req = mockRequest({
      body: { email: 'test@example.com', name: 'John', unknownField: 'hack' },
    });
    const res = mockResponse();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    // Zod strips unknown fields by default
    expect(req.body).toEqual({ email: 'test@example.com', name: 'John' });
  });

  it('should return 400 with error details for invalid email', async () => {
    const middleware = validate(schema);

    const req = mockRequest({
      body: { email: 'not-an-email', name: 'John' },
    });
    const res = mockResponse();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.error).toBe('Validation failed');
    expect(jsonCall.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'email',
          message: expect.any(String),
        }),
      ])
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 with error details for missing required fields', async () => {
    const middleware = validate(schema);

    const req = mockRequest({ body: {} });
    const res = mockResponse();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.error).toBe('Validation failed');
    expect(jsonCall.details.length).toBeGreaterThanOrEqual(2); // email + name
  });

  it('should return 400 with error details for wrong types', async () => {
    const middleware = validate(schema);

    const req = mockRequest({
      body: { email: 'test@example.com', name: 'John', age: 'not-a-number' },
    });
    const res = mockResponse();
    const next = mockNext();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as jest.Mock).mock.calls[0][0];
    expect(jsonCall.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'age',
        }),
      ])
    );
  });

  it('should accept valid data with only required fields', async () => {
    const middleware = validate(schema);

    const req = mockRequest({
      body: { email: 'valid@test.com', name: 'A' },
    });
    const res = mockResponse();
    const next = mockNext();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body).toEqual({ email: 'valid@test.com', name: 'A' });
  });
});
