import '../setup';

// Mock the database module before importing the service
const mockApiKey = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../config/database', () => ({
  prisma: {
    apiKey: mockApiKey,
  },
}));

import {
  generateApiKey,
  validateApiKey,
  listApiKeys,
  revokeApiKey,
  deleteApiKey,
} from '../../services/api-keys';

describe('API Keys Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // generateApiKey
  // ================================================================
  describe('generateApiKey', () => {
    it('should generate a key with ds_live_ prefix and create a database record', async () => {
      const dbResult = {
        id: 'key-1',
        organizationId: 'org-1',
        name: 'Test Key',
        keyPrefix: 'ds_live_xxxx',
        scopes: ['contacts:read'],
        expiresAt: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockApiKey.create.mockResolvedValue(dbResult);

      const result = await generateApiKey('org-1', 'Test Key', ['contacts:read']);

      expect(result.key).toMatch(/^ds_live_[a-f0-9]{64}$/);
      expect(result.apiKey).toEqual(dbResult);

      expect(mockApiKey.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Test Key',
          keyHash: expect.any(String),
          keyPrefix: expect.stringMatching(/^ds_live_[a-f0-9]{4}$/),
          scopes: ['contacts:read'],
          expiresAt: null,
        },
        select: {
          id: true,
          organizationId: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    it('should pass expiresAt to the database when provided', async () => {
      const expiresAt = new Date('2025-12-31');
      mockApiKey.create.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        name: 'Expiring',
        keyPrefix: 'ds_live_xxxx',
        scopes: ['*'],
        expiresAt,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await generateApiKey('org-1', 'Expiring', ['*'], expiresAt);

      expect(mockApiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expiresAt,
          }),
        })
      );
    });

    it('should generate unique keys on successive calls', async () => {
      mockApiKey.create.mockResolvedValue({
        id: 'key-1',
        organizationId: 'org-1',
        name: 'Key',
        keyPrefix: 'ds_live_xxxx',
        scopes: ['*'],
        expiresAt: null,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result1 = await generateApiKey('org-1', 'Key 1', ['*']);
      const result2 = await generateApiKey('org-1', 'Key 2', ['*']);

      expect(result1.key).not.toBe(result2.key);
    });
  });

  // ================================================================
  // validateApiKey
  // ================================================================
  describe('validateApiKey', () => {
    it('should return the API key when valid and active', async () => {
      const apiKey = {
        id: 'key-1',
        organizationId: 'org-1',
        active: true,
        expiresAt: null,
        keyPrefix: 'ds_live_xxxx',
        scopes: ['*'],
      };

      mockApiKey.findUnique.mockResolvedValue(apiKey);
      mockApiKey.update.mockResolvedValue(apiKey);

      const result = await validateApiKey('ds_live_somerawkey');

      expect(mockApiKey.findUnique).toHaveBeenCalledWith({
        where: { keyHash: expect.any(String) },
      });
      expect(result).toEqual(apiKey);
    });

    it('should return null when key is not found', async () => {
      mockApiKey.findUnique.mockResolvedValue(null);

      const result = await validateApiKey('ds_live_nonexistent');

      expect(result).toBeNull();
    });

    it('should return null when key is inactive', async () => {
      mockApiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        active: false,
        expiresAt: null,
        keyPrefix: 'ds_live_xxxx',
      });

      const result = await validateApiKey('ds_live_inactivekey');

      expect(result).toBeNull();
    });

    it('should return null when key is expired', async () => {
      const pastDate = new Date('2020-01-01');
      mockApiKey.findUnique.mockResolvedValue({
        id: 'key-1',
        active: true,
        expiresAt: pastDate,
        keyPrefix: 'ds_live_xxxx',
      });

      const result = await validateApiKey('ds_live_expiredkey');

      expect(result).toBeNull();
    });

    it('should return the key when expiresAt is in the future', async () => {
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      const apiKey = {
        id: 'key-1',
        active: true,
        expiresAt: futureDate,
        keyPrefix: 'ds_live_xxxx',
        organizationId: 'org-1',
      };

      mockApiKey.findUnique.mockResolvedValue(apiKey);
      mockApiKey.update.mockResolvedValue(apiKey);

      const result = await validateApiKey('ds_live_validkey');

      expect(result).toEqual(apiKey);
    });

    it('should fire-and-forget update of lastUsedAt on valid key', async () => {
      const apiKey = {
        id: 'key-1',
        active: true,
        expiresAt: null,
        keyPrefix: 'ds_live_xxxx',
        organizationId: 'org-1',
      };

      mockApiKey.findUnique.mockResolvedValue(apiKey);
      mockApiKey.update.mockResolvedValue(apiKey);

      await validateApiKey('ds_live_validkey');

      expect(mockApiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  // ================================================================
  // listApiKeys
  // ================================================================
  describe('listApiKeys', () => {
    it('should return all API keys for an organization', async () => {
      const keys = [
        { id: 'key-1', name: 'Key 1' },
        { id: 'key-2', name: 'Key 2' },
      ];
      mockApiKey.findMany.mockResolvedValue(keys);

      const result = await listApiKeys('org-1');

      expect(mockApiKey.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        select: expect.objectContaining({
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          active: true,
        }),
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(keys);
    });
  });

  // ================================================================
  // revokeApiKey
  // ================================================================
  describe('revokeApiKey', () => {
    it('should set active to false on found key', async () => {
      const apiKey = { id: 'key-1', organizationId: 'org-1' };
      const updated = { ...apiKey, active: false };

      mockApiKey.findFirst.mockResolvedValue(apiKey);
      mockApiKey.update.mockResolvedValue(updated);

      const result = await revokeApiKey('org-1', 'key-1');

      expect(mockApiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-1', organizationId: 'org-1' },
      });
      expect(mockApiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { active: false },
        select: expect.objectContaining({ active: true }),
      });
      expect(result).toEqual(updated);
    });

    it('should return null when key is not found for the organization', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      const result = await revokeApiKey('org-1', 'nonexistent');

      expect(result).toBeNull();
      expect(mockApiKey.update).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // deleteApiKey
  // ================================================================
  describe('deleteApiKey', () => {
    it('should delete the key and return true', async () => {
      mockApiKey.findFirst.mockResolvedValue({ id: 'key-1', organizationId: 'org-1' });
      mockApiKey.delete.mockResolvedValue({});

      const result = await deleteApiKey('org-1', 'key-1');

      expect(mockApiKey.delete).toHaveBeenCalledWith({
        where: { id: 'key-1' },
      });
      expect(result).toBe(true);
    });

    it('should return null when key is not found for the organization', async () => {
      mockApiKey.findFirst.mockResolvedValue(null);

      const result = await deleteApiKey('org-1', 'nonexistent');

      expect(result).toBeNull();
      expect(mockApiKey.delete).not.toHaveBeenCalled();
    });
  });
});
