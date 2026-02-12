import { Router } from 'express';
import express from 'express';
import { importContactsHandler, importCompaniesHandler } from '../controllers/csv-import';
import { authenticate, requireOrganization } from '../middleware/auth';

const router = Router();

// All routes require authentication + organization context
router.use(authenticate);
router.use(requireOrganization);

// Accept raw text/csv bodies on these routes (up to 10MB for large CSVs).
// The express.text() middleware parses the body as a string when Content-Type
// is text/csv. For JSON bodies, the global express.json() middleware already
// handles parsing (the controller checks for req.body.csv).
router.use(express.text({ type: 'text/csv', limit: '10mb' }));

/**
 * @openapi
 * /import/contacts:
 *   post:
 *     tags: [Import]
 *     summary: Import contacts from CSV
 *     description: |
 *       Imports contacts from a CSV file. Supports exports from HubSpot, Salesforce, Attio,
 *       and Google Sheets. Automatically maps common column names. Duplicates (matching email)
 *       are skipped. Maximum 10,000 rows per import.
 *
 *       Send the CSV content as:
 *       - Raw text body with Content-Type: text/csv
 *       - JSON body with { "csv": "...csv content..." }
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         text/csv:
 *           schema:
 *             type: string
 *           example: |
 *             First Name,Last Name,Email,Phone,Company
 *             John,Doe,john@example.com,+1234567890,Acme Inc
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               csv:
 *                 type: string
 *                 description: The CSV content as a string
 *     responses:
 *       200:
 *         description: Import result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total rows in the CSV
 *                 imported:
 *                   type: integer
 *                   description: Successfully imported contacts
 *                 skipped:
 *                   type: integer
 *                   description: Skipped rows (duplicates or validation failures)
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       row:
 *                         type: integer
 *                       error:
 *                         type: string
 *       400:
 *         description: No CSV content provided
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.post('/contacts', importContactsHandler);

/**
 * @openapi
 * /import/companies:
 *   post:
 *     tags: [Import]
 *     summary: Import companies from CSV
 *     description: |
 *       Imports companies from a CSV file. Supports exports from HubSpot, Salesforce, Attio,
 *       and Google Sheets. Automatically maps common column names. Duplicates (matching name,
 *       case-insensitive) are skipped. Maximum 10,000 rows per import.
 *
 *       Send the CSV content as:
 *       - Raw text body with Content-Type: text/csv
 *       - JSON body with { "csv": "...csv content..." }
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/OrganizationId'
 *     requestBody:
 *       required: true
 *       content:
 *         text/csv:
 *           schema:
 *             type: string
 *           example: |
 *             Company Name,Domain,Industry,Size,Website
 *             Acme Inc,acme.com,Technology,STARTUP,https://acme.com
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               csv:
 *                 type: string
 *                 description: The CSV content as a string
 *     responses:
 *       200:
 *         description: Import result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total rows in the CSV
 *                 imported:
 *                   type: integer
 *                   description: Successfully imported companies
 *                 skipped:
 *                   type: integer
 *                   description: Skipped rows (duplicates or validation failures)
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       row:
 *                         type: integer
 *                       error:
 *                         type: string
 *       400:
 *         description: No CSV content provided
 *       401:
 *         description: Missing or invalid authorization
 *       403:
 *         description: Access to organization denied
 */
router.post('/companies', importCompaniesHandler);

export default router;
