import { Router } from 'express';
import { getContacts, getContact, createContact, updateContact, deleteContact } from '../controllers/contacts';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const createContactSchema = z.object({
  body: z.object({
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
    notes: z.string().optional(),
  }),
});

const updateContactSchema = z.object({
  body: z.object({
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
    notes: z.string().optional(),
  }),
});

// Routes
router.get('/', getContacts);
router.get('/:id', getContact);
router.post('/', validate(createContactSchema), createContact);
router.put('/:id', validate(updateContactSchema), updateContact);
router.delete('/:id', deleteContact);

export default router;
