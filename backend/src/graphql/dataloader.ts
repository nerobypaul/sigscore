import DataLoader from 'dataloader';
import type {
  PrismaClient,
  Company,
  Contact,
  Deal,
  Signal,
  AccountScore,
  AccountBrief,
  ContactIdentity,
  SignalSource,
  User,
} from '@prisma/client';

// ============================================================
// DataLoader types
// ============================================================

export interface DataLoaders {
  // One-to-many by foreign key
  contactsByCompanyId: DataLoader<string, Contact[]>;
  dealsByCompanyId: DataLoader<string, Deal[]>;
  signalsByAccountId: DataLoader<string, Signal[]>;
  signalsByActorId: DataLoader<string, Signal[]>;
  identitiesByContactId: DataLoader<string, ContactIdentity[]>;

  // One-to-one by unique/primary key
  scoreByAccountId: DataLoader<string, AccountScore | null>;
  briefByAccountId: DataLoader<string, AccountBrief | null>;
  companyById: DataLoader<string, Company | null>;
  contactById: DataLoader<string, Contact | null>;
  userById: DataLoader<string, User | null>;
  signalSourceById: DataLoader<string, SignalSource | null>;
}

// ============================================================
// Factory — creates a fresh set of loaders per request
// ============================================================

export function createLoaders(
  prisma: PrismaClient,
  organizationId: string,
): DataLoaders {
  // ----------------------------------------------------------
  // One-to-many loaders
  // ----------------------------------------------------------

  const contactsByCompanyId = new DataLoader<string, Contact[]>(
    async (companyIds) => {
      const contacts = await prisma.contact.findMany({
        where: { companyId: { in: [...companyIds] }, organizationId },
      });
      const map = new Map<string, Contact[]>();
      companyIds.forEach((id) => map.set(id, []));
      contacts.forEach((c) => {
        if (c.companyId) {
          map.get(c.companyId)?.push(c);
        }
      });
      return companyIds.map((id) => map.get(id) || []);
    },
  );

  const dealsByCompanyId = new DataLoader<string, Deal[]>(
    async (companyIds) => {
      const deals = await prisma.deal.findMany({
        where: { companyId: { in: [...companyIds] }, organizationId },
      });
      const map = new Map<string, Deal[]>();
      companyIds.forEach((id) => map.set(id, []));
      deals.forEach((d) => {
        if (d.companyId) {
          map.get(d.companyId)?.push(d);
        }
      });
      return companyIds.map((id) => map.get(id) || []);
    },
  );

  const signalsByAccountId = new DataLoader<string, Signal[]>(
    async (accountIds) => {
      const signals = await prisma.signal.findMany({
        where: { accountId: { in: [...accountIds] }, organizationId },
        orderBy: { timestamp: 'desc' },
      });
      const map = new Map<string, Signal[]>();
      accountIds.forEach((id) => map.set(id, []));
      signals.forEach((s) => {
        if (s.accountId) {
          map.get(s.accountId)?.push(s);
        }
      });
      return accountIds.map((id) => map.get(id) || []);
    },
  );

  const signalsByActorId = new DataLoader<string, Signal[]>(
    async (actorIds) => {
      const signals = await prisma.signal.findMany({
        where: { actorId: { in: [...actorIds] }, organizationId },
        orderBy: { timestamp: 'desc' },
      });
      const map = new Map<string, Signal[]>();
      actorIds.forEach((id) => map.set(id, []));
      signals.forEach((s) => {
        if (s.actorId) {
          map.get(s.actorId)?.push(s);
        }
      });
      return actorIds.map((id) => map.get(id) || []);
    },
  );

  const identitiesByContactId = new DataLoader<string, ContactIdentity[]>(
    async (contactIds) => {
      const identities = await prisma.contactIdentity.findMany({
        where: { contactId: { in: [...contactIds] } },
      });
      const map = new Map<string, ContactIdentity[]>();
      contactIds.forEach((id) => map.set(id, []));
      identities.forEach((i) => map.get(i.contactId)?.push(i));
      return contactIds.map((id) => map.get(id) || []);
    },
  );

  // ----------------------------------------------------------
  // One-to-one loaders (by unique key)
  // ----------------------------------------------------------

  const scoreByAccountId = new DataLoader<string, AccountScore | null>(
    async (accountIds) => {
      const scores = await prisma.accountScore.findMany({
        where: { accountId: { in: [...accountIds] }, organizationId },
      });
      const map = new Map<string, AccountScore>(
        scores.map((s) => [s.accountId, s]),
      );
      return accountIds.map((id) => map.get(id) ?? null);
    },
  );

  const briefByAccountId = new DataLoader<string, AccountBrief | null>(
    async (accountIds) => {
      // Fetch the latest brief per account. We pull all briefs for these accounts
      // ordered by generatedAt desc, then pick the first per accountId.
      const briefs = await prisma.accountBrief.findMany({
        where: { accountId: { in: [...accountIds] }, organizationId },
        orderBy: { generatedAt: 'desc' },
      });
      const map = new Map<string, AccountBrief>();
      // First occurrence per accountId is the latest (due to desc ordering)
      briefs.forEach((b) => {
        if (!map.has(b.accountId)) {
          map.set(b.accountId, b);
        }
      });
      return accountIds.map((id) => map.get(id) ?? null);
    },
  );

  const companyById = new DataLoader<string, Company | null>(
    async (ids) => {
      const companies = await prisma.company.findMany({
        where: { id: { in: [...ids] }, organizationId },
      });
      const map = new Map<string, Company>(
        companies.map((c) => [c.id, c]),
      );
      return ids.map((id) => map.get(id) ?? null);
    },
  );

  const contactById = new DataLoader<string, Contact | null>(
    async (ids) => {
      const contacts = await prisma.contact.findMany({
        where: { id: { in: [...ids] }, organizationId },
      });
      const map = new Map<string, Contact>(
        contacts.map((c) => [c.id, c]),
      );
      return ids.map((id) => map.get(id) ?? null);
    },
  );

  const userById = new DataLoader<string, User | null>(
    async (ids) => {
      // Users are not scoped to organizationId
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
      });
      const map = new Map<string, User>(
        users.map((u) => [u.id, u]),
      );
      return ids.map((id) => map.get(id) ?? null);
    },
  );

  const signalSourceById = new DataLoader<string, SignalSource | null>(
    async (ids) => {
      const sources = await prisma.signalSource.findMany({
        where: { id: { in: [...ids] }, organizationId },
      });
      const map = new Map<string, SignalSource>(
        sources.map((s) => [s.id, s]),
      );
      return ids.map((id) => map.get(id) ?? null);
    },
  );

  return {
    contactsByCompanyId,
    dealsByCompanyId,
    signalsByAccountId,
    signalsByActorId,
    identitiesByContactId,
    scoreByAccountId,
    briefByAccountId,
    companyById,
    contactById,
    userById,
    signalSourceById,
  };
}
