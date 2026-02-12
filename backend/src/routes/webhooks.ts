import { Router } from 'express';
import { getWebhooks, createWebhook, deleteWebhook } from '../controllers/webhooks';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

const createWebhookSchema = z.object({
  url: z.string().url()
    .refine(url => url.startsWith('https://'), { message: 'Webhook URLs must use HTTPS' })
    .refine(url => {
      const hostname = new URL(url).hostname;
      return !hostname.match(/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[::1\])/);
    }, { message: 'Webhook URLs must point to public endpoints' }),
  events: z.array(z.string()).min(1),
});

/**
 * @openapi
 * /webhooks:
 *   get:
 *     tags: [Webhooks]
 *     summary: List webhook endpoints
 *     description: Returns all webhook endpoints for the organization, including delivery counts.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: List of webhook endpoints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 webhooks:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WebhookEndpointListItem'
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
router.get('/', getWebhooks);

/**
 * @openapi
 * /webhooks:
 *   post:
 *     tags: [Webhooks]
 *     summary: Create a webhook endpoint
 *     description: |
 *       Registers a new webhook endpoint. The URL must use HTTPS and point to a public endpoint (no localhost or private IPs).
 *       A signing secret is automatically generated and returned in the response. Use it to verify webhook payloads via the X-DevSignal-Signature header.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateWebhookRequest'
 *     responses:
 *       201:
 *         description: Webhook endpoint created. The response includes the signing secret.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WebhookEndpoint'
 *       400:
 *         description: Validation error (invalid URL, private IP, missing events)
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
router.post('/', validate(createWebhookSchema), createWebhook);

/**
 * @openapi
 * /webhooks/{id}:
 *   delete:
 *     tags: [Webhooks]
 *     summary: Delete a webhook endpoint
 *     description: Permanently deletes a webhook endpoint and all its delivery records.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Webhook endpoint ID
 *     responses:
 *       204:
 *         description: Webhook endpoint deleted
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
 *         description: Webhook endpoint not found
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
router.delete('/:id', deleteWebhook);

export default router;
