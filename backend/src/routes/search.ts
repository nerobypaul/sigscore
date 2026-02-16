import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import { globalSearch, groupedSearch } from '../services/search';

const router = Router();

// All search routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Global full-text search
 *     description: >
 *       Searches across contacts, companies, deals, and signals using
 *       PostgreSQL tsvector full-text search with weighted relevance scoring.
 *       Supports prefix matching for autocomplete-style queries. Multi-word
 *       queries use AND semantics (all terms must match).
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query (minimum 2 characters)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *         description: Maximum number of results (capped at 50)
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: >
 *           Comma-separated entity types to search (contact, company, deal, signal).
 *           Defaults to all types.
 *     responses:
 *       200:
 *         description: Search results sorted by relevance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         enum: [contact, company, deal, signal]
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       subtitle:
 *                         type: string
 *                         nullable: true
 *                       score:
 *                         type: number
 *                         description: Relevance score from PostgreSQL ts_rank
 *                 total:
 *                   type: integer
 *                 query:
 *                   type: string
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
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string;

    if (!q || q.trim().length < 2) {
      res.json({ results: [], total: 0, query: q || '' });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const types = req.query.types
      ? (req.query.types as string).split(',').map((t) => t.trim())
      : undefined;

    const results = await globalSearch(req.organizationId!, q, { limit, types });
    res.json(results);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /search/command-palette:
 *   get:
 *     tags: [Search]
 *     summary: Grouped search for the Command Palette (Cmd+K)
 *     description: >
 *       Returns search results grouped by category (contacts, companies, signals)
 *       with richer metadata for the command palette UI. Each category returns up
 *       to 5 results.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: Search query (minimum 2 characters)
 *     responses:
 *       200:
 *         description: Grouped search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contacts:
 *                   type: array
 *                 companies:
 *                   type: array
 *                 signals:
 *                   type: array
 *                 query:
 *                   type: string
 */
router.get('/command-palette', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q as string;

    if (!q || q.trim().length < 2) {
      res.json({ contacts: [], companies: [], signals: [], query: q || '' });
      return;
    }

    const results = await groupedSearch(req.organizationId!, q, 5);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
