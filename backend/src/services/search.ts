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
  const likePattern = `%${query.trim()}%`;

  // Helper: run a tsvector search with ILIKE fallback when the search_vector
  // column hasn't been created yet (migration not applied).
  async function searchEntity<T>(
    fn: () => Promise<T[]>,
    fallbackFn: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('search_vector') || msg.includes('42703')) {
        return fallbackFn();
      }
      throw err;
    }
  }

  // --- Contacts ---
  if (types.includes('contact')) {
    const contacts = await searchEntity(
      () =>
        prisma.$queryRaw<
          Array<{ id: string; firstName: string; lastName: string; email: string | null; title: string | null; rank: number }>
        >`
          SELECT id, "firstName", "lastName", email, title,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
          FROM contacts
          WHERE "organizationId" = ${organizationId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC
          LIMIT ${limit}
        `,
      () =>
        prisma.$queryRaw<
          Array<{ id: string; firstName: string; lastName: string; email: string | null; title: string | null; rank: number }>
        >`
          SELECT id, "firstName", "lastName", email, title, 1.0 as rank
          FROM contacts
          WHERE "organizationId" = ${organizationId}
            AND (CONCAT("firstName", ' ', "lastName", ' ', COALESCE(email, '')) ILIKE ${likePattern})
          ORDER BY "updatedAt" DESC
          LIMIT ${limit}
        `,
    );

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
    const companies = await searchEntity(
      () =>
        prisma.$queryRaw<
          Array<{ id: string; name: string; domain: string | null; industry: string | null; rank: number }>
        >`
          SELECT id, name, domain, industry,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
          FROM companies
          WHERE "organizationId" = ${organizationId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC
          LIMIT ${limit}
        `,
      () =>
        prisma.$queryRaw<
          Array<{ id: string; name: string; domain: string | null; industry: string | null; rank: number }>
        >`
          SELECT id, name, domain, industry, 1.0 as rank
          FROM companies
          WHERE "organizationId" = ${organizationId}
            AND (CONCAT(name, ' ', COALESCE(domain, '')) ILIKE ${likePattern})
          ORDER BY "updatedAt" DESC
          LIMIT ${limit}
        `,
    );

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
    const deals = await searchEntity(
      () =>
        prisma.$queryRaw<
          Array<{ id: string; title: string; stage: string; amount: number | null; rank: number }>
        >`
          SELECT id, title, stage, amount,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
          FROM deals
          WHERE "organizationId" = ${organizationId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC
          LIMIT ${limit}
        `,
      () =>
        prisma.$queryRaw<
          Array<{ id: string; title: string; stage: string; amount: number | null; rank: number }>
        >`
          SELECT id, title, stage, amount, 1.0 as rank
          FROM deals
          WHERE "organizationId" = ${organizationId}
            AND title ILIKE ${likePattern}
          ORDER BY "updatedAt" DESC
          LIMIT ${limit}
        `,
    );

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
    const signals = await searchEntity(
      () =>
        prisma.$queryRaw<
          Array<{ id: string; type: string; timestamp: Date; rank: number }>
        >`
          SELECT id, type, timestamp,
                 ts_rank(search_vector, to_tsquery('english', ${tsQuery})) as rank
          FROM signals
          WHERE "organizationId" = ${organizationId}
            AND search_vector @@ to_tsquery('english', ${tsQuery})
          ORDER BY rank DESC
          LIMIT ${limit}
        `,
      () =>
        prisma.$queryRaw<
          Array<{ id: string; type: string; timestamp: Date; rank: number }>
        >`
          SELECT id, type, timestamp, 1.0 as rank
          FROM signals
          WHERE "organizationId" = ${organizationId}
            AND type ILIKE ${likePattern}
          ORDER BY timestamp DESC
          LIMIT ${limit}
        `,
    );

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

// ---------------------------------------------------------------------------
// Grouped search for the Command Palette (Cmd+K)
// Returns results categorized by type with richer metadata.
// ---------------------------------------------------------------------------

export interface GroupedContactResult {
  id: string;
  name: string;
  email: string | null;
  title: string | null;
  companyName: string | null;
}

export interface GroupedCompanyResult {
  id: string;
  name: string;
  domain: string | null;
  pqaScore: number | null;
}

export interface GroupedSignalResult {
  id: string;
  type: string;
  source: string | null;
  timestamp: string;
}

export interface GroupedSearchResults {
  contacts: GroupedContactResult[];
  companies: GroupedCompanyResult[];
  signals: GroupedSignalResult[];
  query: string;
}

/**
 * Grouped search for the Command Palette.
 * Returns up to `limit` results per category with richer metadata
 * (e.g. company name on contacts, PQA score on companies, source on signals).
 */
export async function groupedSearch(
  organizationId: string,
  query: string,
  limit = 5,
): Promise<GroupedSearchResults> {
  const cap = Math.min(limit, 10);
  const likePattern = `%${query.trim()}%`;

  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w + ':*')
    .join(' & ');

  if (!tsQuery) {
    return { contacts: [], companies: [], signals: [], query };
  }

  // Helper: tsvector search with ILIKE fallback
  async function trySearch<T>(fn: () => Promise<T[]>, fallbackFn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('search_vector') || msg.includes('42703')) {
        return fallbackFn();
      }
      throw err;
    }
  }

  // --- Contacts (join company for name) ---
  type ContactRow = { id: string; firstName: string; lastName: string; email: string | null; title: string | null; companyName: string | null };
  const contacts = await trySearch<ContactRow>(
    () =>
      prisma.$queryRaw`
        SELECT c.id, c."firstName", c."lastName", c.email, c.title,
               co.name as "companyName"
        FROM contacts c
        LEFT JOIN companies co ON c."companyId" = co.id
        WHERE c."organizationId" = ${organizationId}
          AND c.search_vector @@ to_tsquery('english', ${tsQuery})
        ORDER BY ts_rank(c.search_vector, to_tsquery('english', ${tsQuery})) DESC
        LIMIT ${cap}
      `,
    () =>
      prisma.$queryRaw`
        SELECT c.id, c."firstName", c."lastName", c.email, c.title,
               co.name as "companyName"
        FROM contacts c
        LEFT JOIN companies co ON c."companyId" = co.id
        WHERE c."organizationId" = ${organizationId}
          AND CONCAT(c."firstName", ' ', c."lastName", ' ', COALESCE(c.email, '')) ILIKE ${likePattern}
        ORDER BY c."updatedAt" DESC
        LIMIT ${cap}
      `,
  );

  // --- Companies (join account_scores for PQA) ---
  type CompanyRow = { id: string; name: string; domain: string | null; pqaScore: number | null };
  const companies = await trySearch<CompanyRow>(
    () =>
      prisma.$queryRaw`
        SELECT co.id, co.name, co.domain,
               a.score as "pqaScore"
        FROM companies co
        LEFT JOIN account_scores a ON a."accountId" = co.id
        WHERE co."organizationId" = ${organizationId}
          AND co.search_vector @@ to_tsquery('english', ${tsQuery})
        ORDER BY ts_rank(co.search_vector, to_tsquery('english', ${tsQuery})) DESC
        LIMIT ${cap}
      `,
    () =>
      prisma.$queryRaw`
        SELECT co.id, co.name, co.domain,
               a.score as "pqaScore"
        FROM companies co
        LEFT JOIN account_scores a ON a."accountId" = co.id
        WHERE co."organizationId" = ${organizationId}
          AND co.name ILIKE ${likePattern}
        ORDER BY co."updatedAt" DESC
        LIMIT ${cap}
      `,
  );

  // --- Signals (join signal_sources for name) ---
  type SignalRow = { id: string; type: string; source: string | null; timestamp: Date };
  const signals = await trySearch<SignalRow>(
    () =>
      prisma.$queryRaw`
        SELECT s.id, s.type, ss.name as source, s.timestamp
        FROM signals s
        LEFT JOIN signal_sources ss ON s."sourceId" = ss.id
        WHERE s."organizationId" = ${organizationId}
          AND s.search_vector @@ to_tsquery('english', ${tsQuery})
        ORDER BY ts_rank(s.search_vector, to_tsquery('english', ${tsQuery})) DESC
        LIMIT ${cap}
      `,
    () =>
      prisma.$queryRaw`
        SELECT s.id, s.type, ss.name as source, s.timestamp
        FROM signals s
        LEFT JOIN signal_sources ss ON s."sourceId" = ss.id
        WHERE s."organizationId" = ${organizationId}
          AND s.type ILIKE ${likePattern}
        ORDER BY s.timestamp DESC
        LIMIT ${cap}
      `,
  );

  return {
    contacts: contacts.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      email: c.email,
      title: c.title,
      companyName: c.companyName,
    })),
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      pqaScore: c.pqaScore != null ? Number(c.pqaScore) : null,
    })),
    signals: signals.map((s) => ({
      id: s.id,
      type: s.type,
      source: s.source,
      timestamp: new Date(s.timestamp).toISOString(),
    })),
    query,
  };
}
