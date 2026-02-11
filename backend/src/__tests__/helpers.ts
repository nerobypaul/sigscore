import { Request, Response, NextFunction } from 'express';

/**
 * Creates a mock Express request object with sensible defaults.
 */
export function mockRequest(overrides: Partial<Request> = {}): Request {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: undefined,
    organizationId: undefined,
    ...overrides,
  } as unknown as Request;
  return req;
}

/**
 * Creates a mock Express response object that tracks calls to json/status/send.
 */
export function mockResponse(): Response & {
  _status: number | null;
  _json: any;
  _sent: boolean;
} {
  const res: any = {
    _status: null,
    _json: undefined,
    _sent: false,
  };

  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  });

  res.json = jest.fn((data: any) => {
    res._json = data;
    return res;
  });

  res.send = jest.fn(() => {
    res._sent = true;
    return res;
  });

  return res as Response & { _status: number | null; _json: any; _sent: boolean };
}

/**
 * Creates a mock next function for Express middleware.
 */
export function mockNext(): NextFunction & jest.Mock {
  return jest.fn() as NextFunction & jest.Mock;
}

/**
 * Factory for creating realistic test data.
 */
export const testData = {
  user(overrides: Record<string, any> = {}) {
    return {
      id: 'user-1',
      email: 'test@example.com',
      password: '$2b$10$hashedpassword',
      firstName: 'Test',
      lastName: 'User',
      avatar: null,
      role: 'USER',
      refreshToken: null,
      lastLoginAt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    };
  },

  contact(overrides: Record<string, any> = {}) {
    return {
      id: 'contact-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+1234567890',
      mobile: null,
      title: 'CTO',
      companyId: 'company-1',
      organizationId: 'org-1',
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
      ...overrides,
    };
  },

  company(overrides: Record<string, any> = {}) {
    return {
      id: 'company-1',
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
      organizationId: 'org-1',
      customFields: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      tags: [],
      ...overrides,
    };
  },

  deal(overrides: Record<string, any> = {}) {
    return {
      id: 'deal-1',
      title: 'Enterprise Plan',
      amount: 50000,
      currency: 'USD',
      stage: 'SALES_QUALIFIED',
      probability: 60,
      contactId: 'contact-1',
      companyId: 'company-1',
      ownerId: 'user-1',
      organizationId: 'org-1',
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
      ...overrides,
    };
  },

  activity(overrides: Record<string, any> = {}) {
    return {
      id: 'activity-1',
      type: 'CALL',
      title: 'Follow-up call',
      description: 'Discuss proposal',
      status: 'PENDING',
      priority: 'MEDIUM',
      dueDate: new Date('2024-02-01'),
      completedAt: null,
      userId: 'user-1',
      contactId: 'contact-1',
      companyId: null,
      dealId: 'deal-1',
      organizationId: 'org-1',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      user: { id: 'user-1', firstName: 'Test', lastName: 'User' },
      contact: { id: 'contact-1', firstName: 'Jane', lastName: 'Doe' },
      company: null,
      deal: { id: 'deal-1', title: 'Enterprise Plan' },
      ...overrides,
    };
  },

  apiKey(overrides: Record<string, any> = {}) {
    return {
      id: 'apikey-1',
      organizationId: 'org-1',
      name: 'Production Key',
      keyHash: 'sha256hash',
      keyPrefix: 'ds_live_a1b2',
      scopes: ['contacts:read', 'contacts:write'],
      lastUsedAt: null,
      expiresAt: null,
      active: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      ...overrides,
    };
  },

  paginatedResult<T>(items: T[], key: string, overrides: Record<string, any> = {}) {
    return {
      [key]: items,
      pagination: {
        page: 1,
        limit: 20,
        total: items.length,
        totalPages: 1,
        ...overrides,
      },
    };
  },
};
