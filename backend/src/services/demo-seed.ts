import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import bcrypt from 'bcrypt';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_ORG_NAME = 'DevSignal Demo';
const DEMO_ORG_SLUG = 'devsignal-demo';
const DEMO_TAG_NAME = '__demo_data';
const DEMO_TAG_COLOR = '#6366f1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DemoSeedResult {
  accessToken: string;
  refreshToken: string;
  organizationId: string;
  userId: string;
  counts: {
    companies: number;
    contacts: number;
    deals: number;
    signals: number;
    workflows: number;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a demo org already exists and return its tokens if so.
 */
export async function getDemoStatus(): Promise<{ exists: boolean; organizationId?: string }> {
  const org = await prisma.organization.findUnique({
    where: { slug: DEMO_ORG_SLUG },
  });
  return org ? { exists: true, organizationId: org.id } : { exists: false };
}

/**
 * Creates a full demo environment: org, user, JWT tokens, and rich seed data.
 * If the demo org already exists, cleans it up and re-seeds fresh data.
 */
export async function createDemoEnvironment(): Promise<DemoSeedResult> {
  // Clean up existing demo org if present
  const existingOrg = await prisma.organization.findUnique({
    where: { slug: DEMO_ORG_SLUG },
  });

  if (existingOrg) {
    await cleanupDemoOrg(existingOrg.id);
  }

  // Create demo user
  const passwordHash = await bcrypt.hash('demo-password-not-real', 10);
  const demoUser = await prisma.user.create({
    data: {
      email: `demo-${Date.now()}@devsignal.dev`,
      password: passwordHash,
      firstName: 'Demo',
      lastName: 'User',
      role: 'ADMIN',
    },
  });

  // Create demo organization
  const demoOrg = await prisma.organization.create({
    data: {
      name: DEMO_ORG_NAME,
      slug: DEMO_ORG_SLUG,
      domain: 'devsignal.dev',
      settings: { plan: 'pro', demo: true } as unknown as Prisma.InputJsonValue,
    },
  });

  // Link user to org as OWNER
  await prisma.userOrganization.create({
    data: {
      userId: demoUser.id,
      organizationId: demoOrg.id,
      role: 'OWNER',
    },
  });

  // Generate tokens
  const accessToken = generateAccessToken(demoUser.id, demoUser.email, demoUser.role);
  const refreshToken = generateRefreshToken(demoUser.id);

  // Store refresh token
  await prisma.user.update({
    where: { id: demoUser.id },
    data: { refreshToken },
  });

  // Seed all demo data
  const counts = await seedFullDemoData(demoOrg.id, demoUser.id);

  logger.info('Demo environment created', { organizationId: demoOrg.id, userId: demoUser.id, counts });

  return {
    accessToken,
    refreshToken,
    organizationId: demoOrg.id,
    userId: demoUser.id,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanupDemoOrg(orgId: string): Promise<void> {
  // Find users linked to this org
  const userOrgs = await prisma.userOrganization.findMany({
    where: { organizationId: orgId },
    select: { userId: true },
  });
  const userIds = userOrgs.map((uo) => uo.userId);

  // Delete org (cascades to most child records)
  await prisma.organization.delete({ where: { id: orgId } });

  // Delete orphaned demo users (only those with demo emails)
  if (userIds.length > 0) {
    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
        email: { contains: '@devsignal.dev' },
      },
    });
  }

  logger.info('Cleaned up existing demo org', { orgId, userIds });
}

// ---------------------------------------------------------------------------
// Full Demo Seed
// ---------------------------------------------------------------------------

async function seedFullDemoData(
  organizationId: string,
  userId: string,
): Promise<DemoSeedResult['counts']> {
  const now = new Date();

  // Create sentinel tag + visible tags
  const demoTag = await prisma.tag.create({
    data: { organizationId, name: DEMO_TAG_NAME, color: DEMO_TAG_COLOR },
  });

  const [hotTag, warmTag, coldTag, enterpriseTag, expansionTag] = await Promise.all([
    prisma.tag.create({ data: { organizationId, name: 'hot-account', color: '#ef4444' } }),
    prisma.tag.create({ data: { organizationId, name: 'warm-account', color: '#f59e0b' } }),
    prisma.tag.create({ data: { organizationId, name: 'cold-account', color: '#3b82f6' } }),
    prisma.tag.create({ data: { organizationId, name: 'enterprise', color: '#8b5cf6' } }),
    prisma.tag.create({ data: { organizationId, name: 'expansion', color: '#10b981' } }),
  ]);

  // ── Companies ──────────────────────────────────────────────────────────

  const companyDefs = [
    {
      name: 'Acme DevTools',
      domain: 'acmedev.io',
      industry: 'Developer Tools',
      size: 'SMALL' as const,
      githubOrg: 'acmedev',
      website: 'https://acmedev.io',
      description: 'Modern CLI tooling for cloud-native development workflows. Series A, 45 employees. Power users of our SDK with 8 active developers.',
      score: 92,
      tier: 'HOT' as const,
      trend: 'RISING' as const,
      signalCount: 210,
      userCount: 8,
      tags: [hotTag.id, enterpriseTag.id, expansionTag.id],
    },
    {
      name: 'NovaCLI',
      domain: 'novacli.com',
      industry: 'Developer Tools',
      size: 'STARTUP' as const,
      githubOrg: 'novacli',
      website: 'https://novacli.com',
      description: 'Next-generation command-line framework with built-in AI assistance. Seed stage, 12 employees. Rapidly adopting our API.',
      score: 84,
      tier: 'HOT' as const,
      trend: 'RISING' as const,
      signalCount: 130,
      userCount: 5,
      tags: [hotTag.id],
    },
    {
      name: 'CloudForge',
      domain: 'cloudforge.dev',
      industry: 'Cloud Infrastructure',
      size: 'MEDIUM' as const,
      githubOrg: 'cloudforge-io',
      website: 'https://cloudforge.dev',
      description: 'Infrastructure-as-code platform for multi-cloud deployments. Series B, 120 employees. Evaluating our enterprise tier.',
      score: 71,
      tier: 'WARM' as const,
      trend: 'RISING' as const,
      signalCount: 95,
      userCount: 4,
      tags: [warmTag.id, enterpriseTag.id],
    },
    {
      name: 'DataPipe Labs',
      domain: 'datapipe.io',
      industry: 'Data Infrastructure',
      size: 'SMALL' as const,
      githubOrg: 'datapipe-labs',
      website: 'https://datapipe.io',
      description: 'Real-time data pipeline orchestration for engineering teams. Series A, 30 employees. Active open-source contributor.',
      score: 67,
      tier: 'WARM' as const,
      trend: 'STABLE' as const,
      signalCount: 65,
      userCount: 3,
      tags: [warmTag.id, expansionTag.id],
    },
    {
      name: 'Synthwave AI',
      domain: 'synthwave.ai',
      industry: 'AI/ML Infrastructure',
      size: 'STARTUP' as const,
      githubOrg: 'synthwave-ai',
      website: 'https://synthwave.ai',
      description: 'AI model serving and inference optimization platform. Pre-seed, 8 employees. Early adopter with growing usage.',
      score: 55,
      tier: 'WARM' as const,
      trend: 'RISING' as const,
      signalCount: 45,
      userCount: 2,
      tags: [warmTag.id],
    },
    {
      name: 'ByteShift',
      domain: 'byteshift.dev',
      industry: 'Developer Tools',
      size: 'STARTUP' as const,
      githubOrg: 'byteshift',
      website: 'https://byteshift.dev',
      description: 'Lightweight serverless runtime for edge computing. Seed stage, 6 employees. Occasional API usage.',
      score: 42,
      tier: 'COLD' as const,
      trend: 'STABLE' as const,
      signalCount: 25,
      userCount: 1,
      tags: [coldTag.id],
    },
    {
      name: 'Lumina Systems',
      domain: 'lumina.systems',
      industry: 'Enterprise Software',
      size: 'MEDIUM' as const,
      githubOrg: undefined,
      website: 'https://lumina.systems',
      description: 'Enterprise workflow automation platform. Series C, 200 employees. Low engagement, browsed docs only.',
      score: 31,
      tier: 'COLD' as const,
      trend: 'FALLING' as const,
      signalCount: 18,
      userCount: 1,
      tags: [coldTag.id],
    },
    {
      name: 'OpenGrid',
      domain: 'opengrid.org',
      industry: 'Open Source',
      size: 'STARTUP' as const,
      githubOrg: 'opengrid-project',
      website: 'https://opengrid.org',
      description: 'Open-source distributed computing framework. Community project, 3 maintainers. Minimal interaction.',
      score: 18,
      tier: 'COLD' as const,
      trend: 'STABLE' as const,
      signalCount: 12,
      userCount: 1,
      tags: [coldTag.id],
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
          customFields: c.name === 'Acme DevTools'
            ? {
                aiBrief: `## Acme DevTools - Account Intelligence Brief\n\n**Company Overview:** Acme DevTools builds modern CLI tooling for cloud-native development. Series A ($12M), 45 employees, HQ in San Francisco.\n\n**Product Usage Signals:**\n- 8 active developers using our SDK (up from 3 last month)\n- 147 signals in the last 30 days (2.4x increase)\n- Heaviest usage: API calls (62%), GitHub integrations (24%), npm downloads (14%)\n- Sarah Chen (VP Eng) personally tested the enterprise features last week\n\n**Expansion Indicators:**\n- Team size grew from 3 to 8 users in 30 days\n- Opened GitHub issue requesting SSO support (enterprise signal)\n- npm downloads spiked 300% after internal hackathon\n- Marcus Johnson starred 3 of our repos in one day\n\n**Recommended Next Steps:**\n1. Reach out to Sarah Chen about enterprise tier - she's the decision maker\n2. Offer a technical deep-dive with their DevOps lead Priya Patel\n3. Propose a 30-day enterprise trial with SSO and audit logging\n\n**Risk Factors:** None identified. Strong momentum across all signals.`,
              } as unknown as Prisma.InputJsonValue
            : undefined,
        },
      }),
    ),
  );

  // Tag companies
  const companyTagData: { companyId: string; tagId: string }[] = [];
  companyDefs.forEach((def, i) => {
    companyTagData.push({ companyId: companies[i].id, tagId: demoTag.id });
    def.tags.forEach((tagId) => {
      companyTagData.push({ companyId: companies[i].id, tagId });
    });
  });
  await prisma.companyTag.createMany({ data: companyTagData, skipDuplicates: true });

  // ── Account Scores ──────────────────────────────────────────────────────

  await Promise.all(
    companyDefs.map((def, i) =>
      prisma.accountScore.create({
        data: {
          organizationId,
          accountId: companies[i].id,
          score: def.score,
          tier: def.tier,
          trend: def.trend,
          signalCount: def.signalCount,
          userCount: def.userCount,
          lastSignalAt: daysAgo(def.tier === 'HOT' ? 0 : def.tier === 'WARM' ? 2 : 10),
          computedAt: now,
          factors: [
            { name: 'Signal Volume', weight: 0.3, value: Math.min(100, def.score + 10), description: `${def.signalCount} signals in last 30d` },
            { name: 'User Growth', weight: 0.25, value: Math.min(100, def.score + 5), description: `${def.userCount} active users` },
            { name: 'Feature Breadth', weight: 0.2, value: Math.max(0, def.score - 5), description: 'Distinct features used' },
            { name: 'Recency', weight: 0.15, value: Math.min(100, def.score + 15), description: 'Time since last signal' },
            { name: 'Team Size', weight: 0.1, value: Math.max(0, def.score - 10), description: 'Estimated team members' },
          ] as unknown as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  // ── Score Snapshots (14-day history) ──

  const snapshotData: Prisma.ScoreSnapshotCreateManyInput[] = [];

  companyDefs.forEach((def, companyIdx) => {
    const currentScore = def.score;

    // Determine starting score 14 days ago based on trend behaviour
    let startOffset: number;
    switch (def.trend) {
      case 'RISING':
        // HOT rising gets a steeper climb, WARM rising a moderate one
        startOffset = currentScore >= 80 ? -18 : -12;
        break;
      case 'FALLING':
        startOffset = 10; // was higher 14 days ago
        break;
      case 'STABLE':
      default:
        startOffset = 0; // flat with minor variance only
        break;
    }

    const startScore = Math.max(0, Math.min(100, currentScore + startOffset));

    for (let day = 14; day >= 1; day--) {
      // Linear interpolation from startScore toward currentScore
      const progress = (14 - day) / 13; // 0 at day 14, 1 at day 1
      const interpolated = startScore + (currentScore - startScore) * progress;

      // Add realistic daily variance: smaller for stable, larger for moving
      const varianceRange = def.trend === 'STABLE' ? 2 : 4;
      const variance = (Math.random() * 2 - 1) * varianceRange;

      const dayScore = Math.round(
        Math.max(0, Math.min(100, interpolated + variance)),
      );

      // Build breakdown proportional to the day's score
      const ratio = dayScore / 100;
      const breakdown = {
        userCount: Math.round(ratio * def.userCount * 12),
        velocity: Math.round(ratio * 85 + (Math.random() * 10 - 5)),
        featureBreadth: Math.round(ratio * 70 + (Math.random() * 8 - 4)),
        engagement: Math.round(ratio * 90 + (Math.random() * 6 - 3)),
        seniority: Math.round(ratio * 60 + (Math.random() * 4 - 2)),
        firmographic: Math.round(ratio * 75 + (Math.random() * 6 - 3)),
      };

      // Clamp breakdown values to 0-100
      for (const key of Object.keys(breakdown) as Array<keyof typeof breakdown>) {
        breakdown[key] = Math.max(0, Math.min(100, breakdown[key]));
      }

      const capturedAt = new Date(now);
      capturedAt.setDate(capturedAt.getDate() - day);
      capturedAt.setHours(2, 0, 0, 0); // Mimic the 2 AM daily cron

      snapshotData.push({
        organizationId,
        companyId: companies[companyIdx].id,
        score: dayScore,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        capturedAt,
      });
    }
  });

  await prisma.scoreSnapshot.createMany({ data: snapshotData });

  // ── Contacts ────────────────────────────────────────────────────────────

  const contactDefs = [
    // Acme DevTools (3 contacts)
    { firstName: 'Sarah', lastName: 'Chen', email: 'sarah@acmedev.io', title: 'VP Engineering', companyIdx: 0, github: 'sarahchen-dev', linkedIn: 'https://linkedin.com/in/sarahchen', customFields: { seniority: 'VP', department: 'Engineering' } },
    { firstName: 'Marcus', lastName: 'Johnson', email: 'marcus@acmedev.io', title: 'Sr Backend Engineer', companyIdx: 0, github: 'marcusj', linkedIn: 'https://linkedin.com/in/marcusjohnson', customFields: { seniority: 'Senior', department: 'Engineering' } },
    { firstName: 'Priya', lastName: 'Patel', email: 'priya@acmedev.io', title: 'DevOps Lead', companyIdx: 0, github: 'priyapatel', linkedIn: 'https://linkedin.com/in/priyapatel', customFields: { seniority: 'Lead', department: 'DevOps' } },
    // NovaCLI (2 contacts)
    { firstName: 'Alex', lastName: 'Rivera', email: 'alex@novacli.com', title: 'CTO', companyIdx: 1, github: 'alexrivera', linkedIn: 'https://linkedin.com/in/alexrivera', customFields: { seniority: 'C-Level', department: 'Engineering' } },
    { firstName: 'Jamie', lastName: 'Lee', email: 'jamie@novacli.com', title: 'Staff Engineer', companyIdx: 1, github: 'jamielee-dev', linkedIn: 'https://linkedin.com/in/jamielee', customFields: { seniority: 'Staff', department: 'Engineering' } },
    // CloudForge (2 contacts)
    { firstName: 'Jordan', lastName: 'Park', email: 'jordan@cloudforge.dev', title: 'Engineering Manager', companyIdx: 2, github: 'jordanpark', linkedIn: 'https://linkedin.com/in/jordanpark', customFields: { seniority: 'Manager', department: 'Engineering' } },
    { firstName: 'Sam', lastName: 'Torres', email: 'sam@cloudforge.dev', title: 'Frontend Lead', companyIdx: 2, github: 'samtorres', linkedIn: 'https://linkedin.com/in/samtorres', customFields: { seniority: 'Lead', department: 'Frontend' } },
    // DataPipe Labs (1 contact)
    { firstName: 'Morgan', lastName: 'Chen', email: 'morgan@datapipe.io', title: 'Principal Engineer', companyIdx: 3, github: 'morganchen', linkedIn: 'https://linkedin.com/in/morganchen', customFields: { seniority: 'Principal', department: 'Engineering' } },
    // Synthwave AI (2 contacts)
    { firstName: 'Riley', lastName: 'Kim', email: 'riley@synthwave.ai', title: 'Founder & CEO', companyIdx: 4, github: 'rileykim', linkedIn: 'https://linkedin.com/in/rileykim', customFields: { seniority: 'C-Level', department: 'Executive' } },
    { firstName: 'Casey', lastName: 'Nguyen', email: 'casey@synthwave.ai', title: 'ML Engineer', companyIdx: 4, github: 'caseynguyen', linkedIn: 'https://linkedin.com/in/caseynguyen', customFields: { seniority: 'Mid', department: 'Engineering' } },
    // ByteShift (1 contact)
    { firstName: 'Taylor', lastName: 'Smith', email: 'taylor@byteshift.dev', title: 'Full-Stack Developer', companyIdx: 5, github: 'taylorsmith', linkedIn: 'https://linkedin.com/in/taylorsmith', customFields: { seniority: 'Mid', department: 'Engineering' } },
    // Lumina Systems (1 contact)
    { firstName: 'Avery', lastName: 'Williams', email: 'avery@lumina.systems', title: 'Solutions Architect', companyIdx: 6, github: 'averyw', linkedIn: 'https://linkedin.com/in/averywilliams', customFields: { seniority: 'Senior', department: 'Architecture' } },
    // OpenGrid (1 contact)
    { firstName: 'Quinn', lastName: 'Davis', email: 'quinn@opengrid.org', title: 'Core Maintainer', companyIdx: 7, github: 'quinndavis', linkedIn: 'https://linkedin.com/in/quinndavis', customFields: { seniority: 'Senior', department: 'Open Source' } },
    // Extra contacts for Acme (to reach ~15-20)
    { firstName: 'Kai', lastName: 'Yamamoto', email: 'kai@acmedev.io', title: 'Platform Engineer', companyIdx: 0, github: 'kaiyamamoto', linkedIn: 'https://linkedin.com/in/kaiyamamoto', customFields: { seniority: 'Mid', department: 'Platform' } },
    { firstName: 'Elena', lastName: 'Rodriguez', email: 'elena@acmedev.io', title: 'Security Engineer', companyIdx: 0, github: 'elenarodriguez', linkedIn: 'https://linkedin.com/in/elenarodriguez', customFields: { seniority: 'Senior', department: 'Security' } },
    // Extra for NovaCLI
    { firstName: 'Devi', lastName: 'Rao', email: 'devi@novacli.com', title: 'Backend Engineer', companyIdx: 1, github: 'devirao', linkedIn: 'https://linkedin.com/in/devirao', customFields: { seniority: 'Mid', department: 'Engineering' } },
    // Extra for CloudForge
    { firstName: 'Logan', lastName: 'Fischer', email: 'logan@cloudforge.dev', title: 'SRE Lead', companyIdx: 2, github: 'loganfischer', linkedIn: 'https://linkedin.com/in/loganfischer', customFields: { seniority: 'Lead', department: 'SRE' } },
    // Extra for DataPipe
    { firstName: 'Zara', lastName: 'Ahmed', email: 'zara@datapipe.io', title: 'Data Engineer', companyIdx: 3, github: 'zaraahmed', linkedIn: 'https://linkedin.com/in/zaraahmed', customFields: { seniority: 'Mid', department: 'Data' } },
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
          github: `https://github.com/${c.github}`,
          linkedIn: c.linkedIn,
          customFields: c.customFields as unknown as Prisma.InputJsonValue,
        },
      }),
    ),
  );

  // Tag contacts with sentinel
  await prisma.contactTag.createMany({
    data: contacts.map((c) => ({ contactId: c.id, tagId: demoTag.id })),
    skipDuplicates: true,
  });

  // ── Deals ────────────────────────────────────────────────────────────────

  const dealDefs = [
    {
      title: 'Acme DevTools - Enterprise Expansion',
      amount: 50000,
      stage: 'NEGOTIATION' as const,
      companyIdx: 0,
      contactIdx: 0, // Sarah Chen
      probability: 75,
      daysCreated: 21,
    },
    {
      title: 'NovaCLI - Pro Plan Upgrade',
      amount: 25000,
      stage: 'ACTIVATED' as const,
      companyIdx: 1,
      contactIdx: 3, // Alex Rivera
      probability: 45,
      daysCreated: 14,
    },
    {
      title: 'CloudForge - Team License',
      amount: 15000,
      stage: 'SALES_QUALIFIED' as const,
      companyIdx: 2,
      contactIdx: 5, // Jordan Park
      probability: 60,
      daysCreated: 10,
    },
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
          expectedCloseDate: daysFromNow(30 + Math.round(Math.random() * 30)),
          createdAt: daysAgo(d.daysCreated),
        },
      }),
    ),
  );

  // Tag deals with sentinel
  await prisma.dealTag.createMany({
    data: deals.map((d) => ({ dealId: d.id, tagId: demoTag.id })),
    skipDuplicates: true,
  });

  // ── Signal Source ────────────────────────────────────────────────────────

  const [githubSource, npmSource, productSource, communitySource, segmentSource, discordSource] = await Promise.all([
    prisma.signalSource.create({
      data: {
        organizationId,
        type: 'GITHUB',
        name: 'GitHub',
        config: { demo: true } as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastSyncAt: now,
      },
    }),
    prisma.signalSource.create({
      data: {
        organizationId,
        type: 'NPM',
        name: 'npm Registry',
        config: { demo: true } as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastSyncAt: now,
      },
    }),
    prisma.signalSource.create({
      data: {
        organizationId,
        type: 'PRODUCT_API',
        name: 'Product Analytics',
        config: { demo: true } as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastSyncAt: now,
      },
    }),
    prisma.signalSource.create({
      data: {
        organizationId,
        type: 'CUSTOM_WEBHOOK',
        name: 'Community Signals',
        config: { demo: true } as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastSyncAt: now,
      },
    }),
    prisma.signalSource.create({
      data: {
        organizationId,
        type: 'SEGMENT',
        name: 'Segment',
        config: { demo: true } as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastSyncAt: now,
      },
    }),
    prisma.signalSource.create({
      data: {
        organizationId,
        type: 'DISCORD',
        name: 'Discord',
        config: { demo: true } as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        lastSyncAt: now,
      },
    }),
  ]);

  // ── Signals ──────────────────────────────────────────────────────────────

  const signalData: Prisma.SignalCreateManyInput[] = [];

  // Helper to get contacts for a company index
  const contactsByCompany = (companyIdx: number) =>
    contactDefs
      .map((def, i) => (def.companyIdx === companyIdx ? contacts[i] : null))
      .filter(Boolean) as typeof contacts;

  // Signal templates per company, weighted by score
  const signalTemplates: Array<{
    type: string;
    sourceId: string;
    metadata: (companyName: string) => Record<string, unknown>;
  }> = [
    { type: 'github_star', sourceId: githubSource.id, metadata: (n) => ({ repo: `${slugify(n)}/sdk`, stargazer: 'demo-user', totalStars: rand(500, 2500) }) },
    { type: 'github_fork', sourceId: githubSource.id, metadata: (n) => ({ repo: `${slugify(n)}/sdk`, forkedBy: 'demo-user', totalForks: rand(50, 400) }) },
    { type: 'github_issue', sourceId: githubSource.id, metadata: (n) => ({ repo: `${slugify(n)}/sdk`, title: 'Feature request: custom config support', number: rand(1, 200) }) },
    { type: 'github_pr', sourceId: githubSource.id, metadata: (n) => ({ repo: `${slugify(n)}/sdk`, title: 'Add retry logic to HTTP client', number: rand(1, 150), action: 'opened' }) },
    { type: 'npm_download', sourceId: npmSource.id, metadata: (n) => ({ package: `@${slugify(n)}/core`, version: '2.3.1', downloads: rand(100, 1200) }) },
    { type: 'pypi_download', sourceId: npmSource.id, metadata: (n) => ({ package: slugify(n), version: '1.5.0', downloads: rand(50, 600) }) },
    { type: 'stackoverflow_question', sourceId: communitySource.id, metadata: (n) => ({ title: `How to configure ${n} SDK for production?`, tags: ['sdk', slugify(n)], views: rand(50, 500) }) },
    { type: 'stackoverflow_answer', sourceId: communitySource.id, metadata: (n) => ({ questionTitle: `${n} SDK timeout configuration`, accepted: true, score: rand(1, 25) }) },
    { type: 'twitter_mention', sourceId: communitySource.id, metadata: (n) => ({ text: `Just shipped our integration with ${n} SDK - game changer for our workflow!`, username: 'dev_user', likes: rand(5, 100) }) },
    { type: 'twitter_praise', sourceId: communitySource.id, metadata: (n) => ({ text: `${n} has the best developer experience I've seen. Seriously impressed.`, username: 'tech_lead', likes: rand(10, 200) }) },
    { type: 'reddit_discussion', sourceId: communitySource.id, metadata: (n) => ({ subreddit: 'devtools', title: `Anyone using ${n}? Looking for alternatives`, upvotes: rand(10, 150), comments: rand(5, 40) }) },
    { type: 'reddit_question', sourceId: communitySource.id, metadata: (n) => ({ subreddit: 'programming', title: `${n} vs competitors - which is better for startups?`, upvotes: rand(5, 80), comments: rand(3, 25) }) },
    { type: 'discord_message', sourceId: communitySource.id, metadata: (n) => ({ channel: 'general', content: `Love the new ${n} release. The API improvements are huge.`, guildName: `${n} Community` }) },
    { type: 'slack_message', sourceId: communitySource.id, metadata: (n) => ({ channel: '#devtools', content: `Team, I just integrated ${n} into our pipeline`, workspace: 'Engineering' }) },
    { type: 'page_view', sourceId: productSource.id, metadata: () => ({ url: '/docs/getting-started', referrer: 'https://google.com', userAgent: 'Mozilla/5.0' }) },
    { type: 'signup', sourceId: productSource.id, metadata: () => ({ plan: 'free', source: 'organic', referrer: 'https://github.com' }) },
    { type: 'feature_usage', sourceId: productSource.id, metadata: () => ({ feature: 'api-dashboard', action: 'viewed', duration: rand(30, 300) }) },
    { type: 'api_call', sourceId: productSource.id, metadata: () => ({ endpoint: '/api/v1/signals', method: 'POST', statusCode: 200, latencyMs: rand(20, 200) }) },
    { type: 'segment_identify', sourceId: segmentSource.id, metadata: (n) => ({ userId: `user-${rand(1000,9999)}`, traits: { company: n, plan: 'pro' }, source: 'web' }) },
    { type: 'segment_track', sourceId: segmentSource.id, metadata: () => ({ event: 'Feature Activated', properties: { feature: 'webhooks', plan: 'pro' }, source: 'server' }) },
    { type: 'discord_join', sourceId: discordSource.id, metadata: (n) => ({ guildName: `${n} Community`, memberCount: rand(50, 500), channel: 'introductions' }) },
    { type: 'discord_thread', sourceId: discordSource.id, metadata: (n) => ({ guildName: `${n} Community`, channel: 'help', title: 'Best practices for SDK integration?', replies: rand(3, 15) }) },
    { type: 'docs_read', sourceId: productSource.id, metadata: () => ({ page: '/docs/api-reference', timeOnPage: rand(60, 600), scrollDepth: rand(40, 100) }) },
    { type: 'github_commit', sourceId: githubSource.id, metadata: (n) => ({ repo: `${slugify(n)}/sdk`, message: 'feat: add custom config support', additions: rand(20, 200), deletions: rand(5, 50) }) },
  ];

  // Distribute signals across companies proportional to their scores
  // HOT companies get more recent signals
  companyDefs.forEach((def, companyIdx) => {
    const companyContacts = contactsByCompany(companyIdx);
    const signalCount = def.signalCount;

    for (let s = 0; s < signalCount; s++) {
      const template = signalTemplates[s % signalTemplates.length];
      // Higher-score companies get more recent signals
      const maxDaysAgo = def.tier === 'HOT' ? 15 : def.tier === 'WARM' ? 25 : 30;
      const dayOffset = Math.round((s / signalCount) * maxDaysAgo);
      const hoursOffset = rand(0, 23);

      const actor = companyContacts.length > 0
        ? companyContacts[s % companyContacts.length]
        : undefined;

      const timestamp = new Date(now);
      timestamp.setDate(timestamp.getDate() - dayOffset);
      timestamp.setHours(timestamp.getHours() - hoursOffset);

      signalData.push({
        organizationId,
        sourceId: template.sourceId,
        type: template.type,
        accountId: companies[companyIdx].id,
        actorId: actor?.id ?? null,
        timestamp,
        metadata: template.metadata(def.name) as unknown as Prisma.InputJsonValue,
      });
    }
  });

  // Create signals in batches to avoid hitting DB limits
  const BATCH_SIZE = 100;
  for (let i = 0; i < signalData.length; i += BATCH_SIZE) {
    const batch = signalData.slice(i, i + BATCH_SIZE);
    await prisma.signal.createMany({ data: batch });
  }

  // ── Activities ───────────────────────────────────────────────────────────

  const activityDefs = [
    { type: 'MEETING' as const, title: 'Intro call with Sarah Chen (Acme DevTools)', contactIdx: 0, companyIdx: 0, dealIdx: 0, daysAgo: 18, status: 'COMPLETED' as const },
    { type: 'EMAIL' as const, title: 'Sent enterprise pricing to Acme DevTools', contactIdx: 0, companyIdx: 0, dealIdx: 0, daysAgo: 14, status: 'COMPLETED' as const },
    { type: 'CALL' as const, title: 'Technical deep-dive with Marcus (Acme)', contactIdx: 1, companyIdx: 0, dealIdx: 0, daysAgo: 10, status: 'COMPLETED' as const },
    { type: 'MEETING' as const, title: 'Demo with Alex Rivera (NovaCLI)', contactIdx: 3, companyIdx: 1, dealIdx: 1, daysAgo: 7, status: 'COMPLETED' as const },
    { type: 'EMAIL' as const, title: 'Follow-up: NovaCLI Pro plan features', contactIdx: 3, companyIdx: 1, dealIdx: 1, daysAgo: 5, status: 'COMPLETED' as const },
    { type: 'MEETING' as const, title: 'CloudForge evaluation kickoff', contactIdx: 5, companyIdx: 2, dealIdx: 2, daysAgo: 3, status: 'COMPLETED' as const },
    { type: 'TASK' as const, title: 'Prepare SOW for Acme DevTools enterprise deal', contactIdx: 0, companyIdx: 0, dealIdx: 0, daysAgo: 0, status: 'PENDING' as const, priority: 'HIGH' as const },
    { type: 'CALL' as const, title: 'Follow up with Jordan Park on team license', contactIdx: 5, companyIdx: 2, dealIdx: 2, daysAgo: 0, status: 'PENDING' as const },
  ];

  await Promise.all(
    activityDefs.map((a) =>
      prisma.activity.create({
        data: {
          organizationId,
          type: a.type,
          title: a.title,
          status: a.status,
          priority: ('priority' in a ? a.priority : 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
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

  // ── Workflows ────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.workflow.create({
      data: {
        organizationId,
        name: 'Slack alert on HOT account',
        description: 'Sends a Slack notification when any account score crosses above 80.',
        trigger: {
          event: 'score_changed',
          filters: {},
        } as unknown as Prisma.InputJsonValue,
        conditions: [
          { field: 'score', operator: 'gte', value: 80 },
        ] as unknown as Prisma.InputJsonValue,
        actions: [
          { type: 'slack_notify', params: { channel: '#sales-alerts', message: 'Account {{account.name}} just became HOT (score: {{score}})' } },
        ] as unknown as Prisma.InputJsonValue,
        enabled: true,
        runCount: 14,
        lastTriggeredAt: daysAgo(1),
      },
    }),
    prisma.workflow.create({
      data: {
        organizationId,
        name: 'Auto-sync to HubSpot',
        description: 'Automatically syncs new contacts to HubSpot CRM when they are created.',
        trigger: {
          event: 'contact_created',
          filters: {},
        } as unknown as Prisma.InputJsonValue,
        actions: [
          { type: 'hubspot_sync', params: { objectType: 'contact', mappings: { email: '{{contact.email}}', firstname: '{{contact.firstName}}', lastname: '{{contact.lastName}}' } } },
        ] as unknown as Prisma.InputJsonValue,
        enabled: true,
        runCount: 23,
        lastTriggeredAt: daysAgo(0),
      },
    }),
  ]);

  // ── Account Brief for Acme ───────────────────────────────────────────────

  // AI briefs for top 3 companies (shows the feature works across accounts)
  await prisma.accountBrief.create({
    data: {
      organizationId,
      accountId: companies[0].id, // Acme DevTools
      content: `## Acme DevTools - Account Intelligence Brief

**Company Overview:** Acme DevTools builds modern CLI tooling for cloud-native development. Series A ($12M raised), 45 employees, headquartered in San Francisco. Founded 2022.

**Product Usage Signals (Last 30 Days):**
- 8 active developers using the SDK (up from 3 last month - 167% growth)
- 147 total signals detected across GitHub, npm, and product analytics
- Heaviest usage patterns: API calls (62%), GitHub integrations (24%), npm downloads (14%)
- Sarah Chen (VP Engineering) personally evaluated enterprise features last week

**Key Expansion Indicators:**
- Team size grew from 3 to 8 users in 30 days - fastest organic growth we have seen
- Opened GitHub issue requesting SSO support (strong enterprise buying signal)
- npm download spike of 300% coincided with internal hackathon mention on Twitter
- Marcus Johnson (Sr Backend Engineer) starred 3 SDK repos in a single session

**Competitive Intelligence:**
- Currently evaluating Common Room alongside DevSignal
- Price-sensitive: mentioned "12x cheaper" in a Reddit thread comparing tools

**Recommended Next Steps:**
1. Schedule executive briefing with Sarah Chen - she is the budget holder
2. Offer a technical deep-dive session with Priya Patel (DevOps Lead)
3. Propose 30-day enterprise trial including SSO, audit logging, and dedicated support
4. Send case study from a similar Series A devtool company

**Risk Factors:** Low risk. Strong momentum across all signal types. No churn indicators detected.`,
      generatedAt: daysAgo(1),
      validUntil: daysFromNow(6),
      promptTokens: 2400,
      outputTokens: 850,
    },
  });

  await prisma.accountBrief.create({
    data: {
      organizationId,
      accountId: companies[1].id, // NovaCLI
      content: `## NovaCLI - Account Intelligence Brief

**Company Overview:** NovaCLI builds a next-generation command-line framework with built-in AI assistance. Seed stage, 12 employees, founded 2024. Backed by Y Combinator (W24 batch).

**Product Usage Signals (Last 30 Days):**
- 5 active developers using the SDK (CTO Alex Rivera is a daily user)
- 130 total signals across GitHub, npm, and Segment
- Rapid adoption curve: went from first API call to 5 active users in 18 days
- Heavy focus on API endpoints and webhook integrations

**Key Expansion Indicators:**
- Alex Rivera (CTO) personally building integrations - strong technical champion
- Jamie Lee (Staff Engineer) opened 2 feature requests on GitHub (advanced config, batch API)
- npm download volume growing 40% week-over-week
- Devi Rao onboarded independently without docs - strong product-market fit signal

**Competitive Intelligence:**
- Not currently evaluating alternatives (early stage, moving fast)
- Mentioned us positively in their Discord community

**Recommended Next Steps:**
1. Invite Alex Rivera to beta program for upcoming batch API feature
2. Offer founder-friendly pricing: lock in annual deal before Series A
3. Feature NovaCLI as a case study (fast adoption story resonates with other seed-stage teams)

**Risk Factors:** Low. Fast-growing seed stage with technical champion. Main risk is budget constraints pre-Series A.`,
      generatedAt: daysAgo(2),
      validUntil: daysFromNow(5),
      promptTokens: 2100,
      outputTokens: 720,
    },
  });

  await prisma.accountBrief.create({
    data: {
      organizationId,
      accountId: companies[2].id, // CloudForge
      content: `## CloudForge - Account Intelligence Brief

**Company Overview:** CloudForge is an infrastructure-as-code platform for multi-cloud deployments. Series B ($45M raised), 120 employees, HQ in Austin TX. Known for enterprise-grade reliability.

**Product Usage Signals (Last 30 Days):**
- 4 active users, led by Jordan Park (Engineering Manager) and Logan Fischer (SRE Lead)
- 95 signals detected, predominantly GitHub and product analytics
- Usage pattern suggests evaluation phase: heavy docs reading, API exploration, limited production usage
- Sam Torres (Frontend Lead) integrated our dashboard widget last week

**Key Expansion Indicators:**
- Jordan Park requested a security questionnaire - procurement signal
- Logan Fischer tested our webhook reliability with 1000+ test events
- Company blog mentioned "evaluating developer signal tools" in their Q1 planning post
- 3 separate team members browsing enterprise pricing page

**Competitive Intelligence:**
- Currently using Common Room ($18K/year) - unhappy with pricing
- Mentioned "looking for something 10x cheaper" in an internal Slack leak on Reddit
- Decision timeline: Q1 2026 (within next 6 weeks)

**Recommended Next Steps:**
1. Send Jordan Park a tailored ROI comparison: DevSignal vs Common Room
2. Offer a migration path: free data import from Common Room
3. Schedule a joint call with Jordan + Logan to address SRE-specific requirements
4. Fast-track their security questionnaire to accelerate procurement

**Risk Factors:** Medium. Active evaluation of multiple tools. Price is the primary driver - we have a strong advantage here. Timeline pressure from Q1 budget cycle works in our favor.`,
      generatedAt: daysAgo(1),
      validUntil: daysFromNow(6),
      promptTokens: 2600,
      outputTokens: 880,
    },
  });

  return {
    companies: companies.length,
    contacts: contacts.length,
    deals: deals.length,
    signals: signalData.length,
    workflows: 2,
  };
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

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}
