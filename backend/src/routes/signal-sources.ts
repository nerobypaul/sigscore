import { Router } from 'express';
import {
  getSignalSources,
  getSignalSource,
  createSignalSource,
  updateSignalSource,
  deleteSignalSource,
  testSignalSource,
  syncSignalSource,
  getCatalog,
  getSyncHistory,
} from '../controllers/signal-sources';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

const createSourceSchema = z.object({
  type: z.enum(['GITHUB', 'NPM', 'PYPI', 'WEBSITE', 'DOCS', 'PRODUCT_API', 'SEGMENT', 'DISCORD', 'TWITTER', 'STACKOVERFLOW', 'REDDIT', 'POSTHOG', 'LINKEDIN', 'INTERCOM', 'ZENDESK', 'CUSTOM_WEBHOOK']),
  name: z.string().min(1),
  config: z.record(z.unknown()),
});

const updateSourceSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ERROR']).optional(),
});

/**
 * @openapi
 * /sources:
 *   get:
 *     tags: [Signal Sources]
 *     summary: List signal sources
 *     description: Returns all configured signal sources for the organization, including signal counts.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: List of signal sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [GITHUB, NPM, WEBSITE, DOCS, PRODUCT_API, SEGMENT, CUSTOM_WEBHOOK]
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [ACTIVE, PAUSED, ERROR]
 *                       lastSyncAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       errorMessage:
 *                         type: string
 *                         nullable: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       _count:
 *                         type: object
 *                         properties:
 *                           signals:
 *                             type: integer
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
router.get('/', getSignalSources);

/**
 * @openapi
 * /sources/catalog:
 *   get:
 *     tags: [Signal Sources]
 *     summary: Get integration catalog
 *     description: Returns metadata for all available integration types.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Integration catalog
 */
router.get('/catalog', getCatalog);

/**
 * @openapi
 * /sources/{id}:
 *   get:
 *     tags: [Signal Sources]
 *     summary: Get a signal source by ID
 *     description: Returns a single signal source including its configuration and signal count.
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
 *         description: Signal source ID
 *     responses:
 *       200:
 *         description: Signal source details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignalSource'
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
 *         description: Signal source not found
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
router.get('/:id', getSignalSource);

/**
 * @openapi
 * /sources:
 *   post:
 *     tags: [Signal Sources]
 *     summary: Create a signal source
 *     description: Configures a new signal source for the organization. The config object structure depends on the source type (e.g. GitHub App credentials, npm package names, webhook URLs).
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
 *             $ref: '#/components/schemas/CreateSignalSourceRequest'
 *     responses:
 *       201:
 *         description: Signal source created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignalSource'
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
router.post('/', validate(createSourceSchema), createSignalSource);

/**
 * @openapi
 * /sources/{id}:
 *   put:
 *     tags: [Signal Sources]
 *     summary: Update a signal source
 *     description: Updates a signal source's name, configuration, or status.
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
 *         description: Signal source ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateSignalSourceRequest'
 *     responses:
 *       200:
 *         description: Signal source updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SignalSource'
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
 *       404:
 *         description: Signal source not found
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
router.put('/:id', validate(updateSourceSchema), updateSignalSource);

/**
 * @openapi
 * /sources/{id}:
 *   delete:
 *     tags: [Signal Sources]
 *     summary: Delete a signal source
 *     description: Permanently deletes a signal source and all its associated signals.
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
 *         description: Signal source ID
 *     responses:
 *       204:
 *         description: Signal source deleted
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
 *         description: Signal source not found
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
router.delete('/:id', deleteSignalSource);

/**
 * @openapi
 * /sources/{id}/test:
 *   post:
 *     tags: [Signal Sources]
 *     summary: Test a signal source connection
 *     description: Tests connectivity for a signal source and returns its health status.
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
 *         description: Signal source ID
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 type:
 *                   type: string
 *                   enum: [GITHUB, NPM, WEBSITE, DOCS, PRODUCT_API, SEGMENT, CUSTOM_WEBHOOK]
 *                 name:
 *                   type: string
 *                 healthy:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   enum: [ACTIVE, PAUSED, ERROR]
 *                 lastSyncAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
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
 *         description: Signal source not found
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
router.post('/:id/test', testSignalSource);

/**
 * @openapi
 * /sources/{id}/sync:
 *   post:
 *     tags: [Signal Sources]
 *     summary: Trigger a manual sync
 *     description: Enqueues a sync job for the signal source and returns the sync tracking ID.
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
 *     responses:
 *       200:
 *         description: Sync job enqueued
 *       404:
 *         description: Signal source not found
 */
router.post('/:id/sync', syncSignalSource);

/**
 * @openapi
 * /sources/{id}/history:
 *   get:
 *     tags: [Signal Sources]
 *     summary: Get sync history for a source
 *     description: Returns the sync history for a signal source, most recent first.
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
 *     responses:
 *       200:
 *         description: Sync history entries
 */
router.get('/:id/history', getSyncHistory);

export default router;
