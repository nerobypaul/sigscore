import { Router, Request, Response } from 'express';
import { authenticate, requireOrganization } from '../middleware/auth';
import { createNote, listNotes, updateNote, deleteNote, togglePin } from '../services/notes';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// POST /notes — Create a note
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notes:
 *   post:
 *     tags: [Notes]
 *     summary: Create a note
 *     description: Creates a new note attached to a company, contact, or deal. Automatically extracts @mentions from content.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entityType, entityId, content]
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [company, contact, deal]
 *               entityId:
 *                 type: string
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Note created
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Missing or invalid authorization
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const authorId = req.user!.id;
    const { entityType, entityId, content } = req.body;

    if (!entityType || !entityId || !content) {
      res.status(400).json({ error: 'entityType, entityId, and content are required' });
      return;
    }

    const note = await createNote({
      organizationId,
      authorId,
      entityType,
      entityId,
      content,
    });

    res.status(201).json(note);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    logger.error('Failed to create note', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /notes — List notes for an entity (paginated, pinned first)
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notes:
 *   get:
 *     tags: [Notes]
 *     summary: List notes for an entity
 *     description: Returns a cursor-paginated list of notes for a company, contact, or deal. Pinned notes appear first.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [company, contact, deal]
 *       - in: query
 *         name: entityId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *           default: 50
 *     responses:
 *       200:
 *         description: Paginated list of notes
 *       400:
 *         description: Missing required parameters
 *       401:
 *         description: Missing or invalid authorization
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const entityType = req.query.entityType as string;
    const entityId = req.query.entityId as string;

    if (!entityType || !entityId) {
      res.status(400).json({ error: 'entityType and entityId are required' });
      return;
    }

    const result = await listNotes({
      organizationId,
      entityType,
      entityId,
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    logger.error('Failed to list notes', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /notes/:id — Update note content
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notes/{id}:
 *   patch:
 *     tags: [Notes]
 *     summary: Update a note
 *     description: Updates the content of a note. Only the author or an ADMIN/OWNER can edit.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated note
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Note not found
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const userRole = req.orgRole || 'MEMBER';
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ error: 'content is required' });
      return;
    }

    const note = await updateNote({
      noteId: req.params.id,
      organizationId,
      userId,
      userRole,
      content,
    });

    res.json(note);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    logger.error('Failed to update note', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /notes/:id — Delete a note
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notes/{id}:
 *   delete:
 *     tags: [Notes]
 *     summary: Delete a note
 *     description: Deletes a note. Only the author or an ADMIN/OWNER can delete.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Note deleted
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Note not found
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const userRole = req.orgRole || 'MEMBER';

    await deleteNote({
      noteId: req.params.id,
      organizationId,
      userId,
      userRole,
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    logger.error('Failed to delete note', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /notes/:id/pin — Toggle pin status
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /notes/{id}/pin:
 *   post:
 *     tags: [Notes]
 *     summary: Toggle note pin
 *     description: Toggles the pinned status of a note. Only ADMIN/OWNER can pin or unpin.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated note with toggled pin status
 *       403:
 *         description: Insufficient permissions (ADMIN/OWNER only)
 *       404:
 *         description: Note not found
 */
router.post('/:id/pin', async (req: Request, res: Response) => {
  try {
    const organizationId = req.organizationId!;
    const userId = req.user!.id;
    const userRole = req.orgRole || 'MEMBER';

    const note = await togglePin(req.params.id, organizationId, userId, userRole);
    res.json(note);
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    logger.error('Failed to toggle note pin', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
