import { Router } from 'express';
import { createApiKey, listApiKeys, revokeApiKey, deleteApiKey } from '../controllers/api-keys';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All API key management routes require JWT authentication + organization context
// (only logged-in users can manage API keys, not API keys themselves)
router.use(authenticate);
router.use(requireOrganization);

// Validation schemas
const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().datetime().optional(),
});

/**
 * @openapi
 * /api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List API keys
 *     description: Returns all API keys for the organization. The full key value is never returned here -- only the key prefix for identification.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: List of API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKeys:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       keyPrefix:
 *                         type: string
 *                         description: First 12 characters of the key
 *                       scopes:
 *                         type: array
 *                         items:
 *                           type: string
 *                       lastUsedAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       active:
 *                         type: boolean
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Missing or invalid authorization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access to organization denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', listApiKeys);

/**
 * @openapi
 * /api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create an API key
 *     description: Generates a new API key for the organization. The full key is returned only in this response and cannot be retrieved again. Store it securely.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateApiKeyRequest'
 *     responses:
 *       201:
 *         description: API key created. The `key` field contains the full key -- store it now as it will not be shown again.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                   description: Full API key (ds_live_...). Only returned at creation time.
 *                   example: ds_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
 *                 apiKey:
 *                   $ref: '#/components/schemas/ApiKey'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Missing or invalid authorization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access to organization denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', requireOrgRole('ADMIN'), validate(createApiKeySchema), createApiKey);

/**
 * @openapi
 * /api-keys/{id}/revoke:
 *   put:
 *     tags: [API Keys]
 *     summary: Revoke an API key
 *     description: Deactivates an API key so it can no longer be used for authentication. The key record is preserved for audit purposes.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       200:
 *         description: API key revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 apiKey:
 *                   $ref: '#/components/schemas/ApiKey'
 *       401:
 *         description: Missing or invalid authorization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access to organization denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id/revoke', requireOrgRole('ADMIN'), revokeApiKey);

/**
 * @openapi
 * /api-keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Delete an API key
 *     description: Permanently deletes an API key record.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: API key ID
 *     responses:
 *       204:
 *         description: API key deleted
 *       401:
 *         description: Missing or invalid authorization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access to organization denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', requireOrgRole('ADMIN'), deleteApiKey);

export default router;
