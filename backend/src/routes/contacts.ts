import { Router } from 'express';
import { getContacts, getContact, createContact, updateContact, deleteContact, getDuplicates, mergeContact } from '../controllers/contacts';
import { authenticate, requireOrganization } from '../middleware/auth';
import { enforceContactLimit } from '../middleware/usage-limits';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// Validation schemas
const createContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  title: z.string().optional(),
  companyId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  linkedIn: z.string().url().optional(),
  twitter: z.string().optional(),
  github: z.string().optional(),
  notes: z.string().optional(),
});

const updateContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  mobile: z.string().optional(),
  title: z.string().optional(),
  companyId: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  linkedIn: z.string().url().optional(),
  twitter: z.string().optional(),
  github: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * @openapi
 * /contacts:
 *   get:
 *     tags: [Contacts]
 *     summary: List contacts
 *     description: Returns a paginated list of contacts for the organization. Supports search by name or email and filtering by company.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search contacts by first name, last name, or email (case-insensitive)
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Filter by company ID
 *     responses:
 *       200:
 *         description: Paginated list of contacts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contacts:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Contact'
 *                       - type: object
 *                         properties:
 *                           company:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                           tags:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 tag:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: string
 *                                     name:
 *                                       type: string
 *                                     color:
 *                                       type: string
 *                                       nullable: true
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
router.get('/', getContacts);

/**
 * @openapi
 * /contacts/duplicates:
 *   get:
 *     tags: [Contacts]
 *     summary: Find duplicate contacts
 *     description: Returns groups of potential duplicate contacts matched by email or shared identities within the organization.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     responses:
 *       200:
 *         description: Duplicate contact groups
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       primaryContactId:
 *                         type: string
 *                       primaryName:
 *                         type: string
 *                       primaryEmail:
 *                         type: string
 *                         nullable: true
 *                       duplicates:
 *                         type: array
 *                         items:
 *                           type: object
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 *       500:
 *         description: Internal server error
 */
router.get('/duplicates', getDuplicates);

/**
 * @openapi
 * /contacts/{id}:
 *   get:
 *     tags: [Contacts]
 *     summary: Get a contact by ID
 *     description: Returns a single contact with related company, deals, recent activities, and tags.
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
 *         description: Contact ID
 *     responses:
 *       200:
 *         description: Contact details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contact'
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
 *         description: Contact not found
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
router.get('/:id', getContact);

/**
 * @openapi
 * /contacts:
 *   post:
 *     tags: [Contacts]
 *     summary: Create a contact
 *     description: Creates a new contact in the organization.
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
 *             $ref: '#/components/schemas/CreateContactRequest'
 *     responses:
 *       201:
 *         description: Contact created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contact'
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
router.post('/', enforceContactLimit, validate(createContactSchema), createContact);

/**
 * @openapi
 * /contacts/{id}:
 *   put:
 *     tags: [Contacts]
 *     summary: Update a contact
 *     description: Updates an existing contact. Only provided fields are changed.
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
 *         description: Contact ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateContactRequest'
 *     responses:
 *       200:
 *         description: Contact updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Contact'
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
 *         description: Contact not found
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
router.put('/:id', validate(updateContactSchema), updateContact);

/**
 * @openapi
 * /contacts/{id}/merge:
 *   post:
 *     tags: [Contacts]
 *     summary: Merge duplicate contacts
 *     description: Merges one or more source contacts into the target (primary) contact. Moves all signals, identities, activities, deals, and tags from the source contacts to the primary, then deletes the source contacts.
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
 *         description: The primary contact ID to merge into
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [duplicateIds]
 *             properties:
 *               duplicateIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: IDs of contacts to merge into the primary
 *     responses:
 *       200:
 *         description: Merge result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 merged:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 *       404:
 *         description: Contact not found
 *       500:
 *         description: Internal server error
 */
router.post('/:id/merge', mergeContact);

/**
 * @openapi
 * /contacts/{id}:
 *   delete:
 *     tags: [Contacts]
 *     summary: Delete a contact
 *     description: Permanently deletes a contact and its associated tag links.
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
 *         description: Contact ID
 *     responses:
 *       204:
 *         description: Contact deleted
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
 *         description: Contact not found
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
router.delete('/:id', deleteContact);

export default router;
