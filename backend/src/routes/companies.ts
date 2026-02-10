import { Router } from 'express';
import { getCompanies, getCompany, createCompany, updateCompany, deleteCompany } from '../controllers/companies';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createCompanySchema = z.object({
  body: z.object({
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
    description: z.string().optional(),
  }),
});

const updateCompanySchema = z.object({
  body: z.object({
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
    description: z.string().optional(),
  }),
});

// Routes
router.get('/', getCompanies);
router.get('/:id', getCompany);
router.post('/', validate(createCompanySchema), createCompany);
router.put('/:id', validate(updateCompanySchema), updateCompany);
router.delete('/:id', deleteCompany);

export default router;
