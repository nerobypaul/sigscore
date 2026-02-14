import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { broadcastSignalCreated } from './websocket';
import { computeAccountScore } from './account-scores';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubUser {
  login: string;
  avatar_url?: string;
  html_url?: string;
  name?: string | null;
  company?: string | null;
  email?: string | null;
  bio?: string | null;
}

interface GitHubRepo {
  full_name: string;
  name: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  owner: { login: string };
}

interface DeveloperRecord {
  login: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  avatarUrl?: string;
  profileUrl?: string;
  signalTypes: Set<string>;
  repos: Set<string>;
}

interface CompanyGroup {
  name: string;
  domain: string | null;
  developers: DeveloperRecord[];
  signalCounts: Record<string, number>;
}

export interface OnboardingSummary {
  companiesFound: number;
  developersFound: number;
  signalsCreated: number;
  topCompanies: Array<{
    name: string;
    domain: string | null;
    developerCount: number;
    signals: number;
  }>;
}

export interface CrawlProgress {
  status: 'idle' | 'fetching_repos' | 'fetching_stargazers' | 'fetching_forkers' | 'fetching_contributors' | 'resolving_companies' | 'creating_records' | 'computing_scores' | 'complete' | 'error';
  phase: string;
  phaseCurrent: number;
  phaseTotal: number;
  developersFound: number;
  companiesFound: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// In-memory progress tracking (per-org)
// ---------------------------------------------------------------------------

const progressMap = new Map<string, CrawlProgress>();

export function getCrawlProgress(organizationId: string): CrawlProgress {
  return progressMap.get(organizationId) || {
    status: 'idle',
    phase: 'Not started',
    phaseCurrent: 0,
    phaseTotal: 0,
    developersFound: 0,
    companiesFound: 0,
  };
}

function setProgress(organizationId: string, update: Partial<CrawlProgress>): void {
  const current = getCrawlProgress(organizationId);
  progressMap.set(organizationId, { ...current, ...update });
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

const GITHUB_API = 'https://api.github.com';

async function ghFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevSignal-Onboarding/1.0',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${path} — ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

/** Fetches all pages up to `maxPages` from a paginated GitHub endpoint. */
async function ghFetchPaginated<T>(
  token: string,
  path: string,
  maxPages = 5,
  perPage = 100,
): Promise<T[]> {
  const results: T[] = [];
  const separator = path.includes('?') ? '&' : '?';

  for (let page = 1; page <= maxPages; page++) {
    const items = await ghFetch<T[]>(token, `${path}${separator}per_page=${perPage}&page=${page}`);
    results.push(...items);
    if (items.length < perPage) break; // last page
  }

  return results;
}

// ---------------------------------------------------------------------------
// Company resolution
// ---------------------------------------------------------------------------

/** Known free email providers — skip these for domain-based company matching. */
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
  'icloud.com', 'protonmail.com', 'proton.me', 'hey.com', 'aol.com',
  'mail.com', 'zoho.com', 'yandex.com', 'gmx.com', 'fastmail.com',
  'pm.me', 'tutanota.com', 'mailbox.org',
]);

function normalizeCompanyName(raw: string): string {
  return raw
    .replace(/@/g, '') // remove leading @
    .replace(/,?\s*(Inc\.?|LLC|Ltd\.?|Corp\.?|GmbH|Co\.?)$/i, '')
    .trim();
}

function domainFromEmail(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const domain = parts[1].toLowerCase();
  if (FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function resolveCompany(dev: GitHubUser): { name: string; domain: string | null } | null {
  // 1. Company field on GitHub profile
  if (dev.company) {
    const cleaned = normalizeCompanyName(dev.company);
    if (cleaned.length > 1) {
      return { name: cleaned, domain: null };
    }
  }

  // 2. Email domain
  if (dev.email) {
    const domain = domainFromEmail(dev.email);
    if (domain) {
      // Use domain as the company name placeholder — will be prettified
      const nameParts = domain.split('.')[0];
      const prettyName = nameParts.charAt(0).toUpperCase() + nameParts.slice(1);
      return { name: prettyName, domain };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core crawl logic
// ---------------------------------------------------------------------------

export async function runGitHubOnboarding(
  organizationId: string,
  token: string,
  repoFilter?: string[],
): Promise<OnboardingSummary> {
  try {
    setProgress(organizationId, {
      status: 'fetching_repos',
      phase: 'Listing your repositories...',
      phaseCurrent: 0,
      phaseTotal: 0,
      developersFound: 0,
      companiesFound: 0,
    });

    // ------------------------------------------------------------------
    // 1. List repos
    // ------------------------------------------------------------------
    let repos: GitHubRepo[];

    if (repoFilter && repoFilter.length > 0) {
      // Fetch specific repos
      repos = await Promise.all(
        repoFilter.map((fullName) => ghFetch<GitHubRepo>(token, `/repos/${fullName}`)),
      );
    } else {
      // List authenticated user's repos (owned + collaborated)
      repos = await ghFetchPaginated<GitHubRepo>(token, '/user/repos?sort=stars&direction=desc', 3);
    }

    // Sort by stars descending and take top 10 to keep the crawl fast
    repos.sort((a, b) => b.stargazers_count - a.stargazers_count);
    repos = repos.slice(0, 10);

    setProgress(organizationId, { phaseTotal: repos.length });

    // ------------------------------------------------------------------
    // 2. For each repo, fetch stargazers, forkers, recent issue/PR authors
    // ------------------------------------------------------------------
    const developerMap = new Map<string, DeveloperRecord>();

    for (let i = 0; i < repos.length; i++) {
      const repo = repos[i];
      setProgress(organizationId, {
        status: 'fetching_stargazers',
        phase: `Scanning ${repo.name}...`,
        phaseCurrent: i + 1,
      });

      // Stargazers (max 3 pages = 300)
      try {
        const stargazers = await ghFetchPaginated<GitHubUser>(
          token,
          `/repos/${repo.full_name}/stargazers`,
          3,
          100,
        );
        for (const user of stargazers) {
          addDeveloper(developerMap, user, 'repo_star', repo.full_name);
        }
      } catch (err) {
        logger.warn('Failed to fetch stargazers', { repo: repo.full_name, error: err });
      }

      // Forkers — we get fork events which contain owner info
      try {
        const forks = await ghFetchPaginated<{ owner: GitHubUser; full_name: string }>(
          token,
          `/repos/${repo.full_name}/forks`,
          2,
          100,
        );
        for (const fork of forks) {
          addDeveloper(developerMap, fork.owner, 'repo_fork', repo.full_name);
        }
      } catch (err) {
        logger.warn('Failed to fetch forks', { repo: repo.full_name, error: err });
      }

      // Recent issue/PR authors (combined via /issues which includes PRs)
      try {
        const issues = await ghFetchPaginated<{
          user: GitHubUser;
          pull_request?: unknown;
          number: number;
        }>(token, `/repos/${repo.full_name}/issues?state=all&sort=created&direction=desc`, 1, 50);

        for (const issue of issues) {
          if (issue.user) {
            const signalType = issue.pull_request ? 'pr_opened' : 'issue_opened';
            addDeveloper(developerMap, issue.user, signalType, repo.full_name);
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch issues', { repo: repo.full_name, error: err });
      }

      setProgress(organizationId, { developersFound: developerMap.size });
    }

    // ------------------------------------------------------------------
    // 3. Enrich developers with full profile (company, email)
    // ------------------------------------------------------------------
    setProgress(organizationId, {
      status: 'resolving_companies',
      phase: 'Resolving companies from GitHub profiles...',
      phaseCurrent: 0,
      phaseTotal: Math.min(developerMap.size, 200),
    });

    // Only enrich up to 200 developers to stay within rate limits
    const devEntries = Array.from(developerMap.values()).slice(0, 200);
    const BATCH_SIZE = 10;

    for (let i = 0; i < devEntries.length; i += BATCH_SIZE) {
      const batch = devEntries.slice(i, i + BATCH_SIZE);
      const enriched = await Promise.allSettled(
        batch.map((dev) =>
          ghFetch<GitHubUser>(token, `/users/${dev.login}`).catch(() => null),
        ),
      );

      for (let j = 0; j < batch.length; j++) {
        const result = enriched[j];
        if (result.status === 'fulfilled' && result.value) {
          const profile = result.value;
          batch[j].name = profile.name || batch[j].name;
          batch[j].email = profile.email || batch[j].email;
          batch[j].company = profile.company || batch[j].company;
          batch[j].avatarUrl = profile.avatar_url || batch[j].avatarUrl;
        }
      }

      setProgress(organizationId, { phaseCurrent: Math.min(i + BATCH_SIZE, devEntries.length) });
    }

    // ------------------------------------------------------------------
    // 4. Group developers by company
    // ------------------------------------------------------------------
    const companyMap = new Map<string, CompanyGroup>();
    let unaffiliated = 0;

    for (const dev of devEntries) {
      const resolved = resolveCompany({
        login: dev.login,
        company: dev.company,
        email: dev.email,
      });

      if (!resolved) {
        unaffiliated++;
        continue;
      }

      const key = resolved.name.toLowerCase();
      if (!companyMap.has(key)) {
        companyMap.set(key, {
          name: resolved.name,
          domain: resolved.domain,
          developers: [],
          signalCounts: {},
        });
      }

      const group = companyMap.get(key)!;
      group.developers.push(dev);

      // If this developer brought a domain and the group doesn't have one yet
      if (!group.domain && resolved.domain) {
        group.domain = resolved.domain;
      }

      for (const sigType of dev.signalTypes) {
        group.signalCounts[sigType] = (group.signalCounts[sigType] || 0) + 1;
      }
    }

    setProgress(organizationId, { companiesFound: companyMap.size });

    logger.info('GitHub onboarding crawl complete', {
      organizationId,
      developers: developerMap.size,
      enriched: devEntries.length,
      companies: companyMap.size,
      unaffiliated,
    });

    // ------------------------------------------------------------------
    // 5. Create records in the database
    // ------------------------------------------------------------------
    setProgress(organizationId, {
      status: 'creating_records',
      phase: 'Creating companies, contacts, and signals...',
      phaseCurrent: 0,
      phaseTotal: companyMap.size,
    });

    // Ensure a GitHub signal source exists for this org
    let source = await prisma.signalSource.findFirst({
      where: { organizationId, type: 'GITHUB', name: 'GitHub Onboarding' },
    });
    if (!source) {
      source = await prisma.signalSource.create({
        data: {
          organizationId,
          type: 'GITHUB',
          name: 'GitHub Onboarding',
          config: {} as Prisma.InputJsonValue,
          status: 'ACTIVE',
        },
      });
    }

    let totalSignals = 0;
    const companyIds: string[] = [];
    let companyIdx = 0;

    for (const [, group] of companyMap) {
      companyIdx++;
      setProgress(organizationId, { phaseCurrent: companyIdx });

      // Upsert company
      let company = await prisma.company.findFirst({
        where: {
          organizationId,
          OR: [
            ...(group.domain ? [{ domain: group.domain }] : []),
            { name: { equals: group.name, mode: 'insensitive' as const } },
          ],
        },
      });

      if (!company) {
        company = await prisma.company.create({
          data: {
            organization: { connect: { id: organizationId } },
            name: group.name,
            domain: group.domain || undefined,
          },
        });
      }

      companyIds.push(company.id);

      // Create contacts + signals for each developer
      for (const dev of group.developers) {
        // Upsert contact by GitHub username
        let contact = await prisma.contact.findFirst({
          where: { organizationId, github: dev.login },
        });

        if (!contact) {
          const nameParts = (dev.name || dev.login).split(' ');
          contact = await prisma.contact.create({
            data: {
              organization: { connect: { id: organizationId } },
              firstName: nameParts[0] || dev.login,
              lastName: nameParts.slice(1).join(' ') || '',
              email: dev.email || undefined,
              github: dev.login,
              avatar: dev.avatarUrl || undefined,
              company: { connect: { id: company.id } },
            },
          });
        }

        // Create signals for each unique signal type per repo
        for (const signalType of dev.signalTypes) {
          for (const repoName of dev.repos) {
            const idempotencyKey = `gh-onboard:${organizationId}:${dev.login}:${signalType}:${repoName}`;

            // Skip if already exists
            const existing = await prisma.signal.findUnique({
              where: { idempotencyKey },
            });
            if (existing) continue;

            const signal = await prisma.signal.create({
              data: {
                organizationId,
                sourceId: source.id,
                type: signalType,
                actorId: contact.id,
                accountId: company.id,
                metadata: {
                  repo_name: repoName,
                  source: 'github_onboarding',
                  actor_login: dev.login,
                } as Prisma.InputJsonValue,
                idempotencyKey,
                timestamp: new Date(),
              },
              include: {
                source: { select: { id: true, name: true, type: true } },
                actor: { select: { id: true, firstName: true, lastName: true, email: true } },
                account: { select: { id: true, name: true, domain: true } },
              },
            });

            broadcastSignalCreated(organizationId, signal);
            totalSignals++;
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // 6. Compute PQA scores
    // ------------------------------------------------------------------
    setProgress(organizationId, {
      status: 'computing_scores',
      phase: 'Computing PQA scores...',
      phaseCurrent: 0,
      phaseTotal: companyIds.length,
    });

    for (let i = 0; i < companyIds.length; i++) {
      try {
        await computeAccountScore(organizationId, companyIds[i]);
      } catch (err) {
        logger.warn('Failed to compute score', { companyId: companyIds[i], error: err });
      }
      setProgress(organizationId, { phaseCurrent: i + 1 });
    }

    // ------------------------------------------------------------------
    // 7. Build summary
    // ------------------------------------------------------------------
    const topCompanies = Array.from(companyMap.values())
      .sort((a, b) => b.developers.length - a.developers.length)
      .slice(0, 10)
      .map((g) => ({
        name: g.name,
        domain: g.domain,
        developerCount: g.developers.length,
        signals: Object.values(g.signalCounts).reduce((s, c) => s + c, 0),
      }));

    const summary: OnboardingSummary = {
      companiesFound: companyMap.size,
      developersFound: developerMap.size,
      signalsCreated: totalSignals,
      topCompanies,
    };

    setProgress(organizationId, {
      status: 'complete',
      phase: 'Done!',
      phaseCurrent: companyMap.size,
      phaseTotal: companyMap.size,
      developersFound: developerMap.size,
      companiesFound: companyMap.size,
    });

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('GitHub onboarding failed', { organizationId, error: err });
    setProgress(organizationId, {
      status: 'error',
      phase: message,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Repo listing (lightweight — for the UI repo picker)
// ---------------------------------------------------------------------------

export interface RepoInfo {
  fullName: string;
  name: string;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
}

export async function listUserRepos(token: string): Promise<RepoInfo[]> {
  const repos = await ghFetchPaginated<GitHubRepo & { language?: string | null }>(
    token,
    '/user/repos?sort=stars&direction=desc&type=owner',
    3,
    100,
  );

  return repos.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    url: r.html_url,
    stars: r.stargazers_count,
    forks: r.forks_count,
    language: r.language ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDeveloper(
  map: Map<string, DeveloperRecord>,
  user: GitHubUser,
  signalType: string,
  repoName: string,
): void {
  // Skip bots
  if (!user.login || user.login.endsWith('[bot]')) return;

  if (!map.has(user.login)) {
    map.set(user.login, {
      login: user.login,
      name: user.name,
      email: user.email,
      company: user.company,
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      signalTypes: new Set(),
      repos: new Set(),
    });
  }

  const dev = map.get(user.login)!;
  dev.signalTypes.add(signalType);
  dev.repos.add(repoName);
}
