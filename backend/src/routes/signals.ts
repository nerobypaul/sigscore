import { Router } from 'express';
import {
  ingestSignal,
  ingestSignalBatch,
  getSignals,
  getAccountSignals,
  getAccountTimeline,
  getAccountScore,
  computeAccountScore,
  getTopAccounts,
  getDeduplicationStats,
} from '../controllers/signals';
import { authenticate, requireOrganization } from '../middleware/auth';
import { enforceSignalLimit } from '../middleware/usage-limits';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireOrganization);

// Signal ingest schemas
const ingestSignalSchema = z.object({
  sourceId: z.string().min(1, 'sourceId is required'),
  type: z.string().min(1, 'type is required'),
  actorId: z.string().optional(),
  accountId: z.string().optional(),
  anonymousId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  idempotencyKey: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

const ingestBatchSchema = z.object({
  signals: z.array(ingestSignalSchema).min(1, 'At least one signal required').max(1000, 'Maximum 1000 signals per batch'),
});

/**
 * @openapi
 * /signals:
 *   post:
 *     tags: [Signals]
 *     summary: Ingest a single signal
 *     description: |
 *       Ingests a single signal event. The system automatically resolves accountId from the actor's contact company if not provided.
 *       If the signal includes an email-like anonymousId, domain matching is attempted to resolve the account.
 *       On successful ingest, webhooks are dispatched asynchronously and the account score is recomputed if an account was resolved.
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
 *             $ref: '#/components/schemas/IngestSignalRequest'
 *     responses:
 *       201:
 *         description: Signal ingested
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Signal'
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
router.post('/', enforceSignalLimit, validate(ingestSignalSchema), ingestSignal);

/**
 * @openapi
 * /signals/batch:
 *   post:
 *     tags: [Signals]
 *     summary: Ingest signals in batch
 *     description: |
 *       Ingests up to 1000 signals in a single request. Each signal is processed independently --
 *       failures in individual signals do not block others. The response includes per-signal success/failure status and a summary.
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
 *             $ref: '#/components/schemas/IngestSignalBatchRequest'
 *     responses:
 *       201:
 *         description: Batch ingest results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BatchIngestResult'
 *       400:
 *         description: Validation error or signals is not an array
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
router.post('/batch', enforceSignalLimit, validate(ingestBatchSchema), ingestSignalBatch);

/**
 * @openapi
 * /signals:
 *   get:
 *     tags: [Signals]
 *     summary: Query signals
 *     description: Returns a paginated, filtered list of signals ordered by timestamp descending.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - $ref: '#/components/parameters/PageParam'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Items per page (max 100, default 50)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by signal type (e.g. repo_clone, page_view)
 *       - in: query
 *         name: sourceId
 *         schema:
 *           type: string
 *         description: Filter by signal source ID
 *       - in: query
 *         name: accountId
 *         schema:
 *           type: string
 *         description: Filter by account (company) ID
 *       - in: query
 *         name: actorId
 *         schema:
 *           type: string
 *         description: Filter by actor (contact) ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter signals from this timestamp (inclusive)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter signals up to this timestamp (inclusive)
 *     responses:
 *       200:
 *         description: Paginated list of signals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 signals:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Signal'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
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
router.get('/', getSignals);

/**
 * @openapi
 * /signals/dedup-stats:
 *   get:
 *     tags: [Signals]
 *     summary: Get signal deduplication statistics
 *     description: |
 *       Returns deduplication statistics for the organization including total signals
 *       ingested, deduplicated count, and dedup rate percentage for the last 24 hours
 *       and last 7 days.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Deduplication statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 last24h:
 *                   type: object
 *                   properties:
 *                     totalIngested:
 *                       type: integer
 *                       description: Total signals attempted (stored + deduplicated)
 *                     totalStored:
 *                       type: integer
 *                       description: Total unique signals stored
 *                     deduplicated:
 *                       type: integer
 *                       description: Number of duplicate signals blocked
 *                     dedupEligible:
 *                       type: integer
 *                       description: Signals with dedup keys (dedup-enabled)
 *                     dedupRate:
 *                       type: number
 *                       format: float
 *                       description: Deduplication rate as a percentage
 *                 last7d:
 *                   type: object
 *                   properties:
 *                     totalIngested:
 *                       type: integer
 *                     totalStored:
 *                       type: integer
 *                     deduplicated:
 *                       type: integer
 *                     dedupEligible:
 *                       type: integer
 *                     dedupRate:
 *                       type: number
 *                       format: float
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
router.get('/dedup-stats', getDeduplicationStats);

/**
 * @openapi
 * /signals/accounts/top:
 *   get:
 *     tags: [Signals]
 *     summary: Get top-scored accounts
 *     description: Returns the highest-scoring accounts by PQA score, optionally filtered by tier.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of accounts to return (default 20)
 *       - in: query
 *         name: tier
 *         schema:
 *           type: string
 *           enum: [HOT, WARM, COLD, INACTIVE]
 *         description: Filter by score tier
 *     responses:
 *       200:
 *         description: Top accounts by PQA score
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accounts:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/AccountScore'
 *                       - type: object
 *                         properties:
 *                           account:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               domain:
 *                                 type: string
 *                               size:
 *                                 type: string
 *                                 enum: [STARTUP, SMALL, MEDIUM, LARGE, ENTERPRISE]
 *                                 nullable: true
 *                               industry:
 *                                 type: string
 *                                 nullable: true
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
router.get('/accounts/top', getTopAccounts);

/**
 * @openapi
 * /signals/accounts/{accountId}/signals:
 *   get:
 *     tags: [Signals]
 *     summary: Get signals for an account
 *     description: Returns the most recent signals for a specific account (company), ordered by timestamp descending.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Account (company) ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of signals to return (default 50)
 *     responses:
 *       200:
 *         description: Account signals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 signals:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Signal'
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
router.get('/accounts/:accountId/signals', getAccountSignals);

/**
 * @openapi
 * /signals/accounts/{accountId}/timeline:
 *   get:
 *     tags: [Signals]
 *     summary: Get account timeline
 *     description: Returns a merged and chronologically sorted timeline of signals and CRM activities for an account.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Account (company) ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum timeline entries to return (default 100)
 *     responses:
 *       200:
 *         description: Account timeline
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timeline:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       kind:
 *                         type: string
 *                         enum: [signal, activity]
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                       data:
 *                         type: object
 *                         description: Either a Signal or Activity object depending on kind
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
router.get('/accounts/:accountId/timeline', getAccountTimeline);

/**
 * @openapi
 * /signals/accounts/{accountId}/score:
 *   get:
 *     tags: [Signals]
 *     summary: Get account PQA score
 *     description: Returns the most recently computed Product-Qualified Account score for the given account.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Account (company) ID
 *     responses:
 *       200:
 *         description: Account score
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccountScore'
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
 *         description: No score computed for this account yet
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
router.get('/accounts/:accountId/score', getAccountScore);

/**
 * @openapi
 * /signals/accounts/{accountId}/score:
 *   post:
 *     tags: [Signals]
 *     summary: Compute account PQA score
 *     description: |
 *       Recomputes the Product-Qualified Account score for the given account based on signals from the last 30 days.
 *       The score factors include: user count, usage velocity, feature breadth, engagement recency, seniority signals, and firmographic fit.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *         description: Account (company) ID
 *     responses:
 *       200:
 *         description: Newly computed account score
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AccountScore'
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
router.post('/accounts/:accountId/score', computeAccountScore);

export default router;
