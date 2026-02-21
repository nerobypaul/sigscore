import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireOrganization, requireOrgRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  configureClearbit,
  getClearbitConfig,
  disconnectClearbit,
  enrichCompany,
  enrichContact,
  getEnrichmentStats,
} from '../services/clearbit-enrichment';
import { enqueueBulkEnrichment } from '../jobs/producers';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

// All enrichment routes require JWT auth + org context
router.use(authenticate);
router.use(requireOrganization);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const connectSchema = z.object({
  apiKey: z.string().min(1, 'Clearbit API key is required'),
});

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/connect
// Save Clearbit API key (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/connect',
  requireOrgRole('ADMIN'),
  validate(connectSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { apiKey } = req.body;

      await configureClearbit(organizationId, apiKey);

      logger.info('Clearbit connected via API', { organizationId });

      res.json({
        connected: true,
        message: 'Clearbit connected successfully. You can now enrich company and contact records.',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/enrichment/status
// Get Clearbit config + enrichment stats (ADMIN only)
// ---------------------------------------------------------------------------

router.get(
  '/status',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const [config, stats] = await Promise.all([
        getClearbitConfig(organizationId),
        getEnrichmentStats(organizationId),
      ]);

      res.json({
        ...config,
        ...stats,
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/companies/:companyId
// Enrich a single company (MEMBER+)
// ---------------------------------------------------------------------------

router.post(
  '/companies/:companyId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { companyId } = req.params;

      const result = await enrichCompany(organizationId, companyId);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/contacts/:contactId
// Enrich a single contact (MEMBER+)
// Gracefully degrades when Clearbit is not connected -- returns available data
// ---------------------------------------------------------------------------

router.post(
  '/contacts/:contactId',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { contactId } = req.params;

      const result = await enrichContact(organizationId, contactId);

      res.json(result);
    } catch (error) {
      // If Clearbit is not connected (400) or API key issues, degrade gracefully
      if (error instanceof Error && (
        error.message.includes('not connected') ||
        error.message.includes('API key')
      )) {
        try {
          const profile = await buildContactProfile(req.organizationId!, req.params.contactId);
          res.json({
            success: false,
            fieldsUpdated: [],
            error: 'Clearbit is not connected. Showing available data from existing records.',
            availableData: profile,
            configurationRequired: {
              message: 'Connect a Clearbit API key in Settings > Enrichment to enable full enrichment.',
              settingsPath: '/settings',
            },
          });
        } catch (profileError) {
          next(profileError);
        }
        return;
      }
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/enrichment/contacts/:contactId/profile
// Return all available enrichment data for a contact from existing records.
// Does NOT require any external API key -- shows whatever data is available
// from the contact record, company, signals, and customFields.
// ---------------------------------------------------------------------------

router.get(
  '/contacts/:contactId/profile',
  requireOrgRole('MEMBER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;
      const { contactId } = req.params;

      const profile = await buildContactProfile(organizationId, contactId);

      if (!profile) {
        res.status(404).json({ error: 'Contact not found' });
        return;
      }

      res.json(profile);
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/bulk/companies
// Trigger bulk company enrichment via BullMQ (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/bulk/companies',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      // Verify Clearbit is connected
      const config = await getClearbitConfig(organizationId);
      if (!config.connected) {
        res.status(400).json({ error: 'Clearbit is not connected. Add your API key first.' });
        return;
      }

      await enqueueBulkEnrichment(organizationId, 'companies');

      logger.info('Bulk company enrichment triggered', { organizationId });

      res.json({
        message: 'Bulk company enrichment has been queued and will begin shortly.',
        type: 'companies',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/enrichment/bulk/contacts
// Trigger bulk contact enrichment via BullMQ (ADMIN only)
// ---------------------------------------------------------------------------

router.post(
  '/bulk/contacts',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      const config = await getClearbitConfig(organizationId);
      if (!config.connected) {
        res.status(400).json({ error: 'Clearbit is not connected. Add your API key first.' });
        return;
      }

      await enqueueBulkEnrichment(organizationId, 'contacts');

      logger.info('Bulk contact enrichment triggered', { organizationId });

      res.json({
        message: 'Bulk contact enrichment has been queued and will begin shortly.',
        type: 'contacts',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/enrichment/disconnect
// Remove Clearbit config (ADMIN only)
// ---------------------------------------------------------------------------

router.delete(
  '/disconnect',
  requireOrgRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organizationId!;

      await disconnectClearbit(organizationId);

      logger.info('Clearbit disconnected via API', { organizationId });

      res.json({
        connected: false,
        message: 'Clearbit has been disconnected. Existing enrichment data remains.',
      });
    } catch (error) {
      next(error);
    }
  },
);

// ---------------------------------------------------------------------------
// Helper: build a contact enrichment profile from existing data
// ---------------------------------------------------------------------------

interface ContactProfile {
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    title: string | null;
    avatar: string | null;
    github: string | null;
    linkedIn: string | null;
    twitter: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
  };
  company: {
    id: string;
    name: string;
    domain: string | null;
    industry: string | null;
    size: string | null;
    description: string | null;
    website: string | null;
    githubOrg: string | null;
  } | null;
  enrichmentData: Record<string, unknown>;
  signalSummary: {
    totalSignals: number;
    recentSignals: number;
    signalTypes: Record<string, number>;
    lastSignalAt: string | null;
  };
  sources: string[];
}

async function buildContactProfile(
  organizationId: string,
  contactId: string,
): Promise<ContactProfile | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [contact, signals] = await Promise.all([
    prisma.contact.findFirst({
      where: { id: contactId, organizationId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            domain: true,
            industry: true,
            size: true,
            description: true,
            website: true,
            githubOrg: true,
            customFields: true,
          },
        },
      },
    }),
    prisma.signal.findMany({
      where: {
        actorId: contactId,
        organizationId,
      },
      orderBy: { timestamp: 'desc' },
      select: {
        type: true,
        metadata: true,
        timestamp: true,
      },
      take: 200,
    }),
  ]);

  if (!contact) return null;

  // Build signal summary
  const signalTypes: Record<string, number> = {};
  let recentSignals = 0;
  for (const signal of signals) {
    signalTypes[signal.type] = (signalTypes[signal.type] || 0) + 1;
    if (signal.timestamp >= thirtyDaysAgo) {
      recentSignals++;
    }
  }

  // Extract enrichment data from customFields
  const contactCustomFields = (contact.customFields as Record<string, unknown>) || {};
  const companyCustomFields = (contact.company?.customFields as Record<string, unknown>) || {};

  // Collect data sources that have contributed
  const sources: string[] = [];
  if (contactCustomFields.clearbitEnrichedAt || contactCustomFields.enrichmentSource === 'clearbit') {
    sources.push('clearbit');
  }
  if (contact.github) {
    sources.push('github');
  }
  if (signals.some((s) => s.type.includes('npm') || s.type.includes('pypi'))) {
    sources.push('npm/pypi');
  }
  if (signals.length > 0) {
    sources.push('signals');
  }

  // Merge useful enrichment data from customFields
  const enrichmentData: Record<string, unknown> = {};

  // Contact-level enrichment fields
  const contactEnrichmentKeys = [
    'seniority', 'role', 'location', 'twitterHandle', 'linkedinHandle',
    'clearbitEnrichedAt', 'enrichmentSource', 'inferredRole',
    'inferredSeniority', 'interests', 'engagementLevel', 'summary',
  ];
  for (const key of contactEnrichmentKeys) {
    if (contactCustomFields[key] !== undefined) {
      enrichmentData[key] = contactCustomFields[key];
    }
  }

  // Company-level enrichment fields
  const companyEnrichmentKeys = [
    'logo', 'country', 'city', 'annualRevenue', 'totalFunding',
    'techStack', 'twitterHandle', 'linkedinHandle', 'sector',
    'subIndustry', 'foundedYear',
  ];
  for (const key of companyEnrichmentKeys) {
    if (companyCustomFields[key] !== undefined) {
      enrichmentData[`company_${key}`] = companyCustomFields[key];
    }
  }

  return {
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone,
      title: contact.title,
      avatar: contact.avatar,
      github: contact.github,
      linkedIn: contact.linkedIn,
      twitter: contact.twitter,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      country: contact.country,
    },
    company: contact.company ? {
      id: contact.company.id,
      name: contact.company.name,
      domain: contact.company.domain,
      industry: contact.company.industry,
      size: contact.company.size,
      description: contact.company.description,
      website: contact.company.website,
      githubOrg: contact.company.githubOrg,
    } : null,
    enrichmentData,
    signalSummary: {
      totalSignals: signals.length,
      recentSignals,
      signalTypes,
      lastSignalAt: signals.length > 0 ? signals[0].timestamp.toISOString() : null,
    },
    sources,
  };
}

export default router;
