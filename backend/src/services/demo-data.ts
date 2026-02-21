import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_TAG_NAME = '__demo_data';
const DEMO_TAG_COLOR = '#6366f1';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SeedCounts {
  companies: number;
  contacts: number;
  deals: number;
  signals: number;
  activities: number;
}

/**
 * Check whether demo data has already been seeded for the given organization
 * by looking for the sentinel tag.
 */
export async function hasDemoData(organizationId: string): Promise<boolean> {
  const tag = await prisma.tag.findUnique({
    where: { organizationId_name: { organizationId, name: DEMO_TAG_NAME } },
  });
  return !!tag;
}

/**
 * Seed an organization with realistic demo data so new users can experience
 * the product immediately.
 */
export async function seedDemoData(
  organizationId: string,
  userId: string,
): Promise<SeedCounts> {
  // Idempotency: skip if already seeded
  if (await hasDemoData(organizationId)) {
    logger.info('Demo data already seeded, skipping', { organizationId });
    return { companies: 0, contacts: 0, deals: 0, signals: 0, activities: 0 };
  }

  logger.info('Seeding demo data', { organizationId, userId });

  // Create the sentinel tag + visible tags
  const demoTag = await prisma.tag.create({
    data: { organizationId, name: DEMO_TAG_NAME, color: DEMO_TAG_COLOR },
  });

  const [enterpriseTag, expansionTag, atRiskTag] = await Promise.all([
    prisma.tag.create({ data: { organizationId, name: 'enterprise', color: '#8b5cf6' } }),
    prisma.tag.create({ data: { organizationId, name: 'expansion', color: '#10b981' } }),
    prisma.tag.create({ data: { organizationId, name: 'at-risk', color: '#ef4444' } }),
  ]);

  // ── Companies ──────────────────────────────────────────────────────────

  const companyDefs = [
    {
      name: 'Arcline Tools',
      domain: 'arcline.dev',
      industry: 'Developer Tools',
      size: 'SMALL' as const,
      githubOrg: 'arcline-dev',
      website: 'https://arcline.dev',
      description: 'Modern CLI tooling for cloud-native development workflows.',
      score: 87,
      tier: 'HOT' as const,
      trend: 'RISING' as const,
      tags: [enterpriseTag.id, expansionTag.id],
    },
    {
      name: 'NovaCLI',
      domain: 'novacli.com',
      industry: 'Developer Tools',
      size: 'STARTUP' as const,
      githubOrg: 'novacli',
      website: 'https://novacli.com',
      description: 'Next-generation command-line framework with built-in AI.',
      score: 64,
      tier: 'WARM' as const,
      trend: 'RISING' as const,
      tags: [],
    },
    {
      name: 'CloudForge',
      domain: 'cloudforge.dev',
      industry: 'Cloud Infrastructure',
      size: 'MEDIUM' as const,
      githubOrg: undefined,
      website: 'https://cloudforge.dev',
      description: 'Infrastructure-as-code platform for multi-cloud deployments.',
      score: 45,
      tier: 'WARM' as const,
      trend: 'STABLE' as const,
      tags: [enterpriseTag.id],
    },
    {
      name: 'DataPipe Labs',
      domain: 'datapipe.io',
      industry: 'Data Infrastructure',
      size: 'SMALL' as const,
      githubOrg: undefined,
      website: 'https://datapipe.io',
      description: 'Real-time data pipeline orchestration for engineering teams.',
      score: 72,
      tier: 'WARM' as const,
      trend: 'RISING' as const,
      tags: [expansionTag.id],
    },
    {
      name: 'ByteStack',
      domain: 'bytestack.co',
      industry: 'Developer Tools',
      size: 'STARTUP' as const,
      githubOrg: undefined,
      website: 'https://bytestack.co',
      description: 'Lightweight serverless runtime for edge computing.',
      score: 23,
      tier: 'COLD' as const,
      trend: 'FALLING' as const,
      tags: [atRiskTag.id],
    },
  ];

  const companies = await Promise.all(
    companyDefs.map((c) =>
      prisma.company.create({
        data: {
          organizationId,
          name: c.name,
          domain: c.domain,
          industry: c.industry,
          size: c.size,
          githubOrg: c.githubOrg,
          website: c.website,
          description: c.description,
        },
      }),
    ),
  );

  // Tag companies
  const companyTagData: { companyId: string; tagId: string }[] = [];
  companyDefs.forEach((def, i) => {
    // Always add the demo sentinel tag
    companyTagData.push({ companyId: companies[i].id, tagId: demoTag.id });
    def.tags.forEach((tagId) => {
      companyTagData.push({ companyId: companies[i].id, tagId });
    });
  });
  await prisma.companyTag.createMany({ data: companyTagData, skipDuplicates: true });

  // ── Account Scores ─────────────────────────────────────────────────────

  const now = new Date();
  await Promise.all(
    companyDefs.map((def, i) =>
      prisma.accountScore.create({
        data: {
          organizationId,
          accountId: companies[i].id,
          score: def.score,
          tier: def.tier,
          trend: def.trend,
          signalCount: Math.round(def.score * 1.2),
          userCount: Math.max(1, Math.round(def.score / 20)),
          lastSignalAt: daysAgo(Math.round((100 - def.score) / 10)),
          computedAt: now,
          factors: [
            { name: 'Signal Volume', weight: 0.3, value: Math.min(100, def.score + 10), description: 'Total signals in last 30d' },
            { name: 'User Growth', weight: 0.25, value: Math.min(100, def.score + 5), description: 'New unique users' },
            { name: 'Feature Breadth', weight: 0.2, value: Math.max(0, def.score - 5), description: 'Distinct features used' },
            { name: 'Recency', weight: 0.15, value: Math.min(100, def.score + 15), description: 'Time since last signal' },
            { name: 'Team Size', weight: 0.1, value: Math.max(0, def.score - 10), description: 'Estimated team members' },
          ] as unknown as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  // ── Contacts ───────────────────────────────────────────────────────────

  const contactDefs = [
    // Arcline Tools (3 contacts)
    { firstName: 'Sarah', lastName: 'Chen', email: 'sarah@arcline.dev', title: 'CTO', companyIdx: 0, linkedIn: 'https://linkedin.com/in/sarahchen', github: 'https://github.com/sarahchen' },
    { firstName: 'Marcus', lastName: 'Williams', email: 'marcus@arcline.dev', title: 'Senior Engineer', companyIdx: 0, linkedIn: 'https://linkedin.com/in/marcuswilliams', github: 'https://github.com/marcuswilliams' },
    { firstName: 'Priya', lastName: 'Patel', email: 'priya@arcline.dev', title: 'DevRel Lead', companyIdx: 0, linkedIn: 'https://linkedin.com/in/priyapatel', github: 'https://github.com/priyapatel' },
    // NovaCLI (2 contacts)
    { firstName: 'James', lastName: 'Rodriguez', email: 'james@novacli.com', title: 'Co-founder & CEO', companyIdx: 1, linkedIn: 'https://linkedin.com/in/jamesrodriguez', github: 'https://github.com/jamesrod' },
    { firstName: 'Aisha', lastName: 'Khan', email: 'aisha@novacli.com', title: 'Staff Engineer', companyIdx: 1, linkedIn: 'https://linkedin.com/in/aishakhan', github: 'https://github.com/aishak' },
    // CloudForge (3 contacts)
    { firstName: 'David', lastName: 'Kim', email: 'david.kim@cloudforge.dev', title: 'VP Engineering', companyIdx: 2, linkedIn: 'https://linkedin.com/in/davidkim', github: 'https://github.com/dkim' },
    { firstName: 'Elena', lastName: 'Vasquez', email: 'elena@cloudforge.dev', title: 'Platform Lead', companyIdx: 2, linkedIn: 'https://linkedin.com/in/elenavasquez', github: 'https://github.com/elenavasq' },
    { firstName: 'Tom', lastName: 'Nguyen', email: 'tom.nguyen@cloudforge.dev', title: 'Senior DevOps Engineer', companyIdx: 2, linkedIn: 'https://linkedin.com/in/tomnguyen', github: 'https://github.com/tomnguyen' },
    // DataPipe Labs (2 contacts)
    { firstName: 'Rachel', lastName: 'Foster', email: 'rachel@datapipe.io', title: 'Founder & CTO', companyIdx: 3, linkedIn: 'https://linkedin.com/in/rachelfoster', github: 'https://github.com/rachelf' },
    { firstName: 'Alex', lastName: 'Murphy', email: 'alex@datapipe.io', title: 'Lead Backend Engineer', companyIdx: 3, linkedIn: 'https://linkedin.com/in/alexmurphy', github: 'https://github.com/alexmurph' },
    // ByteStack (2 contacts)
    { firstName: 'Jordan', lastName: 'Lee', email: 'jordan@bytestack.co', title: 'CEO', companyIdx: 4, linkedIn: 'https://linkedin.com/in/jordanlee', github: 'https://github.com/jordanlee' },
    { firstName: 'Nina', lastName: 'Petrova', email: 'nina@bytestack.co', title: 'Engineer', companyIdx: 4, linkedIn: 'https://linkedin.com/in/ninapetrova', github: 'https://github.com/ninap' },
  ];

  const contacts = await Promise.all(
    contactDefs.map((c) =>
      prisma.contact.create({
        data: {
          organizationId,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          title: c.title,
          companyId: companies[c.companyIdx].id,
          linkedIn: c.linkedIn,
          github: c.github,
        },
      }),
    ),
  );

  // Tag contacts with the demo sentinel
  await prisma.contactTag.createMany({
    data: contacts.map((c) => ({ contactId: c.id, tagId: demoTag.id })),
    skipDuplicates: true,
  });

  // ── Deals ──────────────────────────────────────────────────────────────

  const dealDefs = [
    { title: 'Arcline Tools - Team Expansion', amount: 24000, stage: 'TEAM_ADOPTION' as const, companyIdx: 0, contactIdx: 0, probability: 60 },
    { title: 'DataPipe Labs - Team Plan', amount: 12000, stage: 'TEAM_ADOPTION' as const, companyIdx: 3, contactIdx: 8, probability: 55 },
    { title: 'NovaCLI - Pro Upgrade', amount: 9480, stage: 'ACTIVATED' as const, companyIdx: 1, contactIdx: 3, probability: 40 },
    { title: 'CloudForge - Platform Integration', amount: 36000, stage: 'ACTIVATED' as const, companyIdx: 2, contactIdx: 5, probability: 35 },
    { title: 'Arcline Tools - Enterprise Expansion', amount: 48000, stage: 'EXPANSION_SIGNAL' as const, companyIdx: 0, contactIdx: 0, probability: 70 },
    { title: 'DataPipe Labs - Scale Tier', amount: 35880, stage: 'SALES_QUALIFIED' as const, companyIdx: 3, contactIdx: 8, probability: 75 },
    { title: 'CloudForge - Annual License (Won)', amount: 18000, stage: 'CLOSED_WON' as const, companyIdx: 2, contactIdx: 5, probability: 100, closedAt: daysAgo(15) },
    { title: 'ByteStack - Free Trial', amount: 0, stage: 'IDENTIFIED' as const, companyIdx: 4, contactIdx: 10, probability: 10 },
  ];

  const deals = await Promise.all(
    dealDefs.map((d) =>
      prisma.deal.create({
        data: {
          organizationId,
          title: d.title,
          amount: d.amount,
          stage: d.stage,
          probability: d.probability,
          companyId: companies[d.companyIdx].id,
          contactId: contacts[d.contactIdx].id,
          ownerId: userId,
          expectedCloseDate: daysFromNow(30 + Math.round(Math.random() * 60)),
          closedAt: d.closedAt ?? null,
        },
      }),
    ),
  );

  // Tag deals with the demo sentinel
  await prisma.dealTag.createMany({
    data: deals.map((d) => ({ dealId: d.id, tagId: demoTag.id })),
    skipDuplicates: true,
  });

  // ── Signal Source ──────────────────────────────────────────────────────

  const signalSource = await prisma.signalSource.create({
    data: {
      organizationId,
      type: 'CUSTOM_WEBHOOK',
      name: 'Demo Signal Source',
      config: { demo: true } as unknown as Prisma.InputJsonValue,
      status: 'ACTIVE',
      lastSyncAt: now,
    },
  });

  // ── Signals ────────────────────────────────────────────────────────────

  const signalTypes = [
    'npm_download',
    'pypi_download',
    'github_star',
    'github_fork',
    'github_issue',
    'api_call',
    'page_view',
    'signup',
  ];

  // Weighted distribution: Acme gets the most, ByteStack the fewest
  const companySignalWeights = [10, 6, 5, 7, 2]; // 30 total
  const signalData: Prisma.SignalCreateManyInput[] = [];

  let signalIdx = 0;
  companySignalWeights.forEach((weight, companyIndex) => {
    for (let s = 0; s < weight; s++) {
      const type = signalTypes[signalIdx % signalTypes.length];
      const dayOffset = Math.round((s / weight) * 30);
      const contactsForCompany = contacts.filter(
        (c) => contactDefs[contacts.indexOf(c)]?.companyIdx === companyIndex,
      );
      const actor = contactsForCompany.length > 0
        ? contactsForCompany[s % contactsForCompany.length]
        : undefined;

      signalData.push({
        organizationId,
        sourceId: signalSource.id,
        type,
        accountId: companies[companyIndex].id,
        actorId: actor?.id ?? null,
        timestamp: daysAgo(dayOffset),
        metadata: buildSignalMetadata(type, companies[companyIndex].name) as unknown as Prisma.InputJsonValue,
      });

      signalIdx++;
    }
  });

  await prisma.signal.createMany({ data: signalData });

  // ── Activities ─────────────────────────────────────────────────────────

  const activityDefs = [
    { type: 'MEETING' as const, title: 'Intro call with Arcline Tools', contactIdx: 0, companyIdx: 0, dealIdx: 0, daysAgo: 14, status: 'COMPLETED' as const },
    { type: 'CALL' as const, title: 'Follow-up with NovaCLI on Pro features', contactIdx: 3, companyIdx: 1, dealIdx: 2, daysAgo: 7, status: 'COMPLETED' as const },
    { type: 'EMAIL' as const, title: 'Sent pricing proposal to DataPipe Labs', contactIdx: 8, companyIdx: 3, dealIdx: 5, daysAgo: 3, status: 'COMPLETED' as const },
    { type: 'MEETING' as const, title: 'Quarterly review with CloudForge', contactIdx: 5, companyIdx: 2, dealIdx: 3, daysAgo: 1, status: 'PENDING' as const },
    { type: 'TASK' as const, title: 'Prepare enterprise proposal for Acme expansion', contactIdx: 0, companyIdx: 0, dealIdx: 4, daysAgo: 0, status: 'PENDING' as const },
  ];

  await Promise.all(
    activityDefs.map((a) =>
      prisma.activity.create({
        data: {
          organizationId,
          type: a.type,
          title: a.title,
          status: a.status,
          priority: 'MEDIUM',
          userId,
          contactId: contacts[a.contactIdx].id,
          companyId: companies[a.companyIdx].id,
          dealId: deals[a.dealIdx].id,
          dueDate: daysAgo(a.daysAgo),
          completedAt: a.status === 'COMPLETED' ? daysAgo(a.daysAgo) : null,
        },
      }),
    ),
  );

  // ── Workflow ───────────────────────────────────────────────────────────

  await prisma.workflow.create({
    data: {
      organizationId,
      name: 'Auto-tag GitHub stargazers',
      description: 'Adds the "github-engaged" tag when a company receives a github_star signal.',
      trigger: {
        event: 'signal_received',
        filters: { type: 'github_star' },
      } as unknown as Prisma.InputJsonValue,
      actions: [
        { type: 'add_tag', params: { tagName: 'github-engaged' } },
      ] as unknown as Prisma.InputJsonValue,
      enabled: true,
    },
  });

  const counts: SeedCounts = {
    companies: companies.length,
    contacts: contacts.length,
    deals: deals.length,
    signals: signalData.length,
    activities: activityDefs.length,
  };

  logger.info('Demo data seeded successfully', { organizationId, counts });
  return counts;
}

/**
 * Remove all demo data from an organization. Identified by entities tagged
 * with the __demo_data sentinel tag.
 */
export async function clearDemoData(organizationId: string): Promise<void> {
  const demoTag = await prisma.tag.findUnique({
    where: { organizationId_name: { organizationId, name: DEMO_TAG_NAME } },
  });

  if (!demoTag) {
    logger.info('No demo data found to clear', { organizationId });
    return;
  }

  // Find all entities tagged with the demo sentinel
  const [companyTags, contactTags, dealTags] = await Promise.all([
    prisma.companyTag.findMany({ where: { tagId: demoTag.id }, select: { companyId: true } }),
    prisma.contactTag.findMany({ where: { tagId: demoTag.id }, select: { contactId: true } }),
    prisma.dealTag.findMany({ where: { tagId: demoTag.id }, select: { dealId: true } }),
  ]);

  const companyIds = companyTags.map((ct) => ct.companyId);
  const contactIds = contactTags.map((ct) => ct.contactId);
  const dealIds = dealTags.map((dt) => dt.dealId);

  // Delete in dependency order: signals (via accountId) -> scores -> activities -> deals -> contacts -> companies
  // Also delete the demo signal source, workflows, and the demo tags.

  // Signals referencing demo companies or contacts
  await prisma.signal.deleteMany({
    where: {
      organizationId,
      OR: [
        { accountId: { in: companyIds } },
        { actorId: { in: contactIds } },
      ],
    },
  });

  // Signal source (demo)
  await prisma.signalSource.deleteMany({
    where: { organizationId, name: 'Demo Signal Source' },
  });

  // Account scores for demo companies
  await prisma.accountScore.deleteMany({
    where: { organizationId, accountId: { in: companyIds } },
  });

  // Activities linked to demo contacts/companies/deals
  await prisma.activity.deleteMany({
    where: {
      organizationId,
      OR: [
        { contactId: { in: contactIds } },
        { companyId: { in: companyIds } },
        { dealId: { in: dealIds } },
      ],
    },
  });

  // Deals
  await prisma.deal.deleteMany({ where: { id: { in: dealIds }, organizationId } });

  // Contacts
  await prisma.contact.deleteMany({ where: { id: { in: contactIds }, organizationId } });

  // Companies
  await prisma.company.deleteMany({ where: { id: { in: companyIds }, organizationId } });

  // Demo workflow
  await prisma.workflow.deleteMany({
    where: { organizationId, name: 'Auto-tag GitHub stargazers' },
  });

  // Demo tags (sentinel + the three visible ones)
  await prisma.tag.deleteMany({
    where: {
      organizationId,
      name: { in: [DEMO_TAG_NAME, 'enterprise', 'expansion', 'at-risk'] },
    },
  });

  logger.info('Demo data cleared', { organizationId, companyIds, contactIds, dealIds });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function buildSignalMetadata(type: string, companyName: string): Record<string, unknown> {
  switch (type) {
    case 'npm_download':
      return { package: `@${companyName.toLowerCase().replace(/\s+/g, '-')}/core`, version: '2.1.0', downloads: Math.round(Math.random() * 500 + 100) };
    case 'pypi_download':
      return { package: companyName.toLowerCase().replace(/\s+/g, '-'), version: '1.4.2', downloads: Math.round(Math.random() * 200 + 50) };
    case 'github_star':
      return { repo: `${companyName.toLowerCase().replace(/\s+/g, '-')}/sdk`, stargazer: 'demo-user', totalStars: Math.round(Math.random() * 2000 + 500) };
    case 'github_fork':
      return { repo: `${companyName.toLowerCase().replace(/\s+/g, '-')}/sdk`, forkedBy: 'demo-user', totalForks: Math.round(Math.random() * 300 + 50) };
    case 'github_issue':
      return { repo: `${companyName.toLowerCase().replace(/\s+/g, '-')}/sdk`, title: 'Feature request: support for custom config', number: Math.round(Math.random() * 200 + 1) };
    case 'api_call':
      return { endpoint: '/api/v1/data', method: 'POST', statusCode: 200, latencyMs: Math.round(Math.random() * 200 + 20) };
    case 'page_view':
      return { url: '/docs/getting-started', referrer: 'https://google.com', userAgent: 'Mozilla/5.0' };
    case 'signup':
      return { plan: 'free', source: 'organic', referrer: 'https://github.com' };
    default:
      return { type };
  }
}
