import { Router } from 'express';
import { getCompanies, getCompany, createCompany, updateCompany, deleteCompany, exportCompanies } from '../controllers/companies';
import { authenticate, requireOrganization } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// Validation schemas
const createCompanySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.enum(['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  linkedIn: z.string().url().optional(),
  twitter: z.string().optional(),
  githubOrg: z.string().optional(),
  description: z.string().optional(),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.enum(['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  linkedIn: z.string().url().optional(),
  twitter: z.string().optional(),
  githubOrg: z.string().optional(),
  description: z.string().optional(),
});

/**
 * @openapi
 * /companies:
 *   get:
 *     tags: [Companies]
 *     summary: List companies
 *     description: Returns a paginated list of companies for the organization. Supports search by name or domain and filtering by industry.
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
 *         description: Search by company name or domain (case-insensitive)
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *         description: Filter by industry
 *     responses:
 *       200:
 *         description: Paginated list of companies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companies:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Company'
 *                       - type: object
 *                         properties:
 *                           _count:
 *                             type: object
 *                             properties:
 *                               contacts:
 *                                 type: integer
 *                               deals:
 *                                 type: integer
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
router.get('/', getCompanies);

/**
 * @openapi
 * /companies/export:
 *   get:
 *     tags: [Companies]
 *     summary: Export companies as CSV
 *     description: Returns a CSV file of companies matching the provided filters.
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by company name or domain
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *         description: Filter by industry
 *       - in: query
 *         name: sortField
 *         schema:
 *           type: string
 *         description: Field to sort by
 *       - in: query
 *         name: sortDirection
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export', exportCompanies);

/**
 * @openapi
 * /companies/{id}:
 *   get:
 *     tags: [Companies]
 *     summary: Get a company by ID
 *     description: Returns a single company with its contacts, deals, recent activities, and tags.
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
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Company details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
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
 *         description: Company not found
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
router.get('/:id', getCompany);

/**
 * @openapi
 * /companies:
 *   post:
 *     tags: [Companies]
 *     summary: Create a company
 *     description: Creates a new company in the organization.
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
 *             $ref: '#/components/schemas/CreateCompanyRequest'
 *     responses:
 *       201:
 *         description: Company created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
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
router.post('/', validate(createCompanySchema), createCompany);

/**
 * @openapi
 * /companies/{id}:
 *   put:
 *     tags: [Companies]
 *     summary: Update a company
 *     description: Updates an existing company. Only provided fields are changed.
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
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCompanyRequest'
 *     responses:
 *       200:
 *         description: Company updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Company'
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
 *         description: Company not found
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
router.put('/:id', validate(updateCompanySchema), updateCompany);

/**
 * @openapi
 * /companies/{id}:
 *   delete:
 *     tags: [Companies]
 *     summary: Delete a company
 *     description: Permanently deletes a company. Associated contacts will have their companyId set to null.
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
 *         description: Company ID
 *     responses:
 *       204:
 *         description: Company deleted
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
 *         description: Company not found
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
router.delete('/:id', deleteCompany);

export default router;
