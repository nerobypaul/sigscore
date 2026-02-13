import { prisma } from '../config/database';

export interface SearchResult {
  type: 'contact' | 'company' | 'deal' | 'signal';
  id: string;
  title: string;
  subtitle?: string;
  score: number;
}

export interface SearchResults {
  results: SearchResult[];
  total: number;
  query: string;
}

/**
 * Performs a global full-text search across contacts, companies, deals, and signals
 * using PostgreSQL tsvector indexes with weighted relevance scoring.
 *
 * @param organizationId - Tenant scope
 * @param query - Raw search string (split into prefix-matching tsquery tokens)
 * @param options.limit - Max results per entity type (capped at 50)
 * @param options.types - Entity types to include (defaults to all four)
 */
export async function globalSearch(
  organizationId: string,
  query: string,
  options?: { limit?: number; types?: string[] },
): Promise<SearchResults> {
  const limit = Math.min(options?.limit || 20, 50);
  const types = options?.types || ['contact', 'company', 'deal', 'signal'];

  // Build a prefix-matching tsquery: each word gets :* for autocomplete behaviour,
  // joined with & (AND) so all terms must match.
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w + ':*')
    .join(' & ');

  if (!tsQuery) {
    return { results: [], total: 0, query };
  }

  const results: SearchResult[] = [];

  // --- Contacts ---
  if (types.includes('contact')) {
    const contacts = await prisma.$queryRaw<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        title: string | null;
        rank: number;
      }>
    >`
      SELECT id, "firstName", "lastName", email, title,
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
      FROM contacts
      WHERE "organizationId" = ${organizationId}
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    contacts.forEach((c) =>
      results.push({
        type: 'contact',
        id: c.id,
        title: `${c.firstName} ${c.lastName}`,
        subtitle: c.email || c.title || undefined,
        score: Number(c.rank),
      }),
    );
  }

  // --- Companies ---
  if (types.includes('company')) {
    const companies = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        domain: string | null;
        industry: string | null;
        rank: number;
      }>
    >`
      SELECT id, name, domain, industry,
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
      FROM companies
      WHERE "organizationId" = ${organizationId}
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    companies.forEach((c) =>
      results.push({
        type: 'company',
        id: c.id,
        title: c.name,
        subtitle: c.domain || c.industry || undefined,
        score: Number(c.rank),
      }),
    );
  }

  // --- Deals ---
  if (types.includes('deal')) {
    const deals = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        stage: string;
        amount: number | null;
        rank: number;
      }>
    >`
      SELECT id, title, stage, amount,
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
      FROM deals
      WHERE "organizationId" = ${organizationId}
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    deals.forEach((d) =>
      results.push({
        type: 'deal',
        id: d.id,
        title: d.title,
        subtitle: d.stage + (d.amount ? ` - $${d.amount.toLocaleString()}` : ''),
        score: Number(d.rank),
      }),
    );
  }

  // --- Signals ---
  if (types.includes('signal')) {
    const signals = await prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        timestamp: Date;
        rank: number;
      }>
    >`
      SELECT id, type, timestamp,
             ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
      FROM signals
      WHERE "organizationId" = ${organizationId}
        AND search_vector @@ to_tsquery('english', ${tsQuery})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    signals.forEach((s) =>
      results.push({
        type: 'signal',
        id: s.id,
        title: s.type,
        subtitle: new Date(s.timestamp).toLocaleDateString(),
        score: Number(s.rank),
      }),
    );
  }

  // Merge all entity results by relevance score (descending)
  results.sort((a, b) => b.score - a.score);

  return {
    results: results.slice(0, limit),
    total: results.length,
    query,
  };
}
