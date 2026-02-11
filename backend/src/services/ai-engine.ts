import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Anthropic client (lazy-initialized so we can check for API key at call time)
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!config.anthropic.apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Set the environment variable to enable AI features.');
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BRIEF_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface AccountContext {
  company: Awaited<ReturnType<typeof gatherAccountContext>>['company'];
  contacts: Awaited<ReturnType<typeof gatherAccountContext>>['contacts'];
  signals: Awaited<ReturnType<typeof gatherAccountContext>>['signals'];
  score: Awaited<ReturnType<typeof gatherAccountContext>>['score'];
  deals: Awaited<ReturnType<typeof gatherAccountContext>>['deals'];
}

async function gatherAccountContext(organizationId: string, accountId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [company, contacts, signals, score, deals] = await Promise.all([
    prisma.company.findFirst({
      where: { id: accountId, organizationId },
      select: {
        id: true,
        name: true,
        domain: true,
        industry: true,
        size: true,
        githubOrg: true,
        description: true,
        website: true,
      },
    }),
    prisma.contact.findMany({
      where: { companyId: accountId, organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        github: true,
      },
      take: 50,
    }),
    prisma.signal.findMany({
      where: {
        accountId,
        organizationId,
        timestamp: { gte: thirtyDaysAgo },
      },
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        type: true,
        metadata: true,
        timestamp: true,
        actorId: true,
      },
      take: 200,
    }),
    prisma.accountScore.findFirst({
      where: { accountId, organizationId },
      select: {
        score: true,
        tier: true,
        factors: true,
        signalCount: true,
        userCount: true,
        trend: true,
      },
    }),
    prisma.deal.findMany({
      where: { companyId: accountId, organizationId },
      select: {
        id: true,
        title: true,
        amount: true,
        stage: true,
        expectedCloseDate: true,
      },
      take: 20,
    }),
  ]);

  if (!company) {
    throw new Error(`Account ${accountId} not found in organization ${organizationId}`);
  }

  return { company, contacts, signals, score, deals };
}

function buildBriefPrompt(ctx: AccountContext): string {
  const { company, contacts, signals, score, deals } = ctx;

  const signalSummary = signals.length > 0
    ? signals.slice(0, 50).map((s) => `- [${s.timestamp.toISOString().slice(0, 10)}] ${s.type}: ${JSON.stringify(s.metadata)}`).join('\n')
    : 'No signals in the last 30 days.';

  const contactList = contacts.length > 0
    ? contacts.map((c) => `- ${c.firstName} ${c.lastName}${c.title ? ` (${c.title})` : ''}${c.email ? ` <${c.email}>` : ''}${c.github ? ` @${c.github}` : ''}`).join('\n')
    : 'No contacts found.';

  const dealList = deals.length > 0
    ? deals.map((d) => `- ${d.title} | Stage: ${d.stage}${d.amount != null ? ` | $${d.amount}` : ''}${d.expectedCloseDate ? ` | Close: ${d.expectedCloseDate.toISOString().slice(0, 10)}` : ''}`).join('\n')
    : 'No deals.';

  const scoreInfo = score
    ? `PQA Score: ${score.score}/100 (${score.tier}), Trend: ${score.trend}, Signals: ${score.signalCount}, Users: ${score.userCount}`
    : 'No PQA score computed yet.';

  return `You are an AI assistant for a developer-tool CRM called DevSignal.
Generate a concise account intelligence brief in markdown for the following account.

## Account Data

**Company:** ${company.name}
**Domain:** ${company.domain || 'N/A'}
**Industry:** ${company.industry || 'N/A'}
**Size:** ${company.size || 'N/A'}
**GitHub Org:** ${company.githubOrg || 'N/A'}
**Description:** ${company.description || 'N/A'}
**Website:** ${company.website || 'N/A'}

**${scoreInfo}**

### Recent Signals (last 30 days)
${signalSummary}

### Key Contacts
${contactList}

### Deals
${dealList}

## Instructions
Produce a brief using exactly this structure:

## ${company.name} — PQA Score: ${score?.score ?? '?'} (${score?.tier ?? 'N/A'})

**What's happening:** (summary of recent signals — what is the account doing? any usage spikes, new users, or interesting patterns?)

**Company:** (firmographic data in 1-2 sentences)

**Current usage:** (signal-derived usage summary: what features, how often, how many users)

**Key contacts:** (list contacts with roles/titles and any notable activity)

**Suggested approach:** (AI-generated outreach strategy based on the data — be specific and actionable)

Keep it concise but insightful. Focus on actionable intelligence for a sales/DevRel team.`;
}

function buildActionsPrompt(ctx: AccountContext): string {
  const { company, contacts, signals, score, deals } = ctx;

  const signalTypes = signals.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {});

  const signalTypeSummary = Object.entries(signalTypes)
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  const contactList = contacts.slice(0, 10).map(
    (c) => `${c.firstName} ${c.lastName}${c.title ? ` (${c.title})` : ''}`
  ).join(', ');

  const dealStages = deals.map((d) => `${d.title}: ${d.stage}`).join(', ');

  return `You are an AI assistant for a developer-tool CRM called DevSignal.
Based on the following account data, suggest 3-5 concrete next-best-actions for the sales/DevRel team.

**Account:** ${company.name} (${company.domain || 'N/A'})
**PQA Score:** ${score?.score ?? 'N/A'}/100 (${score?.tier ?? 'N/A'}), Trend: ${score?.trend ?? 'N/A'}
**Signals (last 30 days):** ${signals.length} total — ${signalTypeSummary || 'none'}
**Contacts:** ${contactList || 'none'}
**Deals:** ${dealStages || 'none'}

Respond with a JSON array of objects, each with:
- "action": a short imperative title (e.g. "Schedule a demo call with CTO")
- "reasoning": 1-2 sentences explaining why this action matters based on the data
- "priority": "high" | "medium" | "low"
- "contact": name of the relevant contact (if applicable, otherwise null)

Return ONLY the JSON array, no other text.`;
}

function buildEnrichPrompt(
  contact: { firstName: string; lastName: string; email: string | null; title: string | null; github: string | null },
  signals: Array<{ type: string; metadata: unknown; timestamp: Date }>
): string {
  const signalList = signals.slice(0, 100).map(
    (s) => `- [${s.timestamp.toISOString().slice(0, 10)}] ${s.type}: ${JSON.stringify(s.metadata)}`
  ).join('\n');

  return `You are an AI assistant for a developer-tool CRM called DevSignal.
Analyze the following contact's signal activity and infer additional profile information.

**Contact:** ${contact.firstName} ${contact.lastName}
**Email:** ${contact.email || 'N/A'}
**Title:** ${contact.title || 'N/A'}
**GitHub:** ${contact.github || 'N/A'}

### Recent Signal Activity
${signalList || 'No signals found.'}

Respond with a JSON object containing:
- "inferredRole": best guess at their role/function (e.g. "Backend Engineer", "Engineering Manager")
- "inferredSeniority": "junior" | "mid" | "senior" | "lead" | "director" | "executive"
- "interests": array of technology/product interests inferred from signals
- "engagementLevel": "high" | "medium" | "low" based on signal frequency and depth
- "summary": 1-2 sentence summary of this person's engagement and likely needs

Return ONLY the JSON object, no other text.`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a fresh account brief by calling Claude, store it in the AccountBrief table.
 */
export async function generateAccountBrief(organizationId: string, accountId: string) {
  const client = getClient();
  const ctx = await gatherAccountContext(organizationId, accountId);
  const prompt = buildBriefPrompt(ctx);

  logger.info(`Generating account brief for ${ctx.company.name} (${accountId})`);

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  // Extract text content from the response
  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const now = new Date();
  const validUntil = new Date(now.getTime() + BRIEF_TTL_MS);

  const brief = await prisma.accountBrief.create({
    data: {
      organization: { connect: { id: organizationId } },
      account: { connect: { id: accountId } },
      content,
      generatedAt: now,
      validUntil,
      promptTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });

  logger.info(`Account brief generated for ${accountId}: ${response.usage.input_tokens} prompt tokens, ${response.usage.output_tokens} output tokens`);

  return brief;
}

/**
 * Return a cached brief if still valid, otherwise generate a fresh one.
 */
export async function getAccountBrief(organizationId: string, accountId: string) {
  const now = new Date();

  const cached = await prisma.accountBrief.findFirst({
    where: {
      accountId,
      organizationId,
      validUntil: { gt: now },
    },
    orderBy: { generatedAt: 'desc' },
  });

  if (cached) {
    logger.debug(`Returning cached brief for account ${accountId}`);
    return { brief: cached, cached: true };
  }

  const brief = await generateAccountBrief(organizationId, accountId);
  return { brief, cached: false };
}

/**
 * Ask Claude for 3-5 concrete next-best-actions for the given account.
 */
export async function suggestNextActions(organizationId: string, accountId: string) {
  const client = getClient();
  const ctx = await gatherAccountContext(organizationId, accountId);
  const prompt = buildActionsPrompt(ctx);

  logger.info(`Generating next-best-actions for ${ctx.company.name} (${accountId})`);

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  // Parse the JSON response
  let actions: unknown;
  try {
    actions = JSON.parse(text);
  } catch {
    logger.warn(`Failed to parse actions JSON for account ${accountId}, returning raw text`);
    actions = [{ action: 'Review AI output', reasoning: text, priority: 'medium', contact: null }];
  }

  return {
    accountId,
    company: ctx.company.name,
    actions,
    usage: {
      promptTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

/**
 * Analyze a contact's signal activity to infer role, seniority, and interests.
 */
export async function enrichContactFromSignals(organizationId: string, contactId: string) {
  const client = getClient();

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      title: true,
      github: true,
    },
  });

  if (!contact) {
    throw new Error(`Contact ${contactId} not found in organization ${organizationId}`);
  }

  const signals = await prisma.signal.findMany({
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
  });

  const prompt = buildEnrichPrompt(contact, signals);

  logger.info(`Enriching contact ${contact.firstName} ${contact.lastName} (${contactId})`);

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  let enrichment: unknown;
  try {
    enrichment = JSON.parse(text);
  } catch {
    logger.warn(`Failed to parse enrichment JSON for contact ${contactId}, returning raw text`);
    enrichment = { summary: text };
  }

  return {
    contactId,
    contact: {
      name: `${contact.firstName} ${contact.lastName}`,
      email: contact.email,
      title: contact.title,
    },
    enrichment,
    signalCount: signals.length,
    usage: {
      promptTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
