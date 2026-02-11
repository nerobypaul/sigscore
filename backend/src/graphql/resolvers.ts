import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';
import type { PrismaClient, Company, Contact, Deal, Signal, AccountScore } from '@prisma/client';

// ============================================================
// Context type used by all resolvers
// ============================================================

export interface GraphQLContext {
  userId: string;
  organizationId: string;
  prisma: PrismaClient;
}

// ============================================================
// JSON scalar — pass-through for arbitrary JSON
// ============================================================

function parseJsonLiteral(ast: ValueNode): unknown {
  switch (ast.kind) {
    case Kind.STRING:
      return ast.value;
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
      return parseInt(ast.value, 10);
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {};
      for (const field of ast.fields) {
        obj[field.name.value] = parseJsonLiteral(field.value);
      }
      return obj;
    }
    case Kind.LIST:
      return ast.values.map((v) => parseJsonLiteral(v));
    case Kind.NULL:
      return null;
    default:
      return null;
  }
}

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value: unknown) {
    return value;
  },
  parseValue(value: unknown) {
    return value;
  },
  parseLiteral: parseJsonLiteral,
});

// ============================================================
// Helper — pagination defaults
// ============================================================

function paginate(page?: number | null, limit?: number | null) {
  const p = Math.max(1, page ?? 1);
  const l = Math.min(100, Math.max(1, limit ?? 20));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

// ============================================================
// Resolvers
// ============================================================

const resolvers = {
  JSON: JSONScalar,

  // ============================================================
  // Query resolvers
  // ============================================================

  Query: {
    // ---- Accounts (Company model) ----

    accounts: async (
      _parent: unknown,
      args: { page?: number; limit?: number; search?: string },
      ctx: GraphQLContext,
    ) => {
      const { skip, take, page, limit } = paginate(args.page, args.limit);
      const where: Record<string, unknown> = { organizationId: ctx.organizationId };

      if (args.search) {
        where.OR = [
          { name: { contains: args.search, mode: 'insensitive' } },
          { domain: { contains: args.search, mode: 'insensitive' } },
          { industry: { contains: args.search, mode: 'insensitive' } },
        ];
      }

      const [items, total] = await Promise.all([
        ctx.prisma.company.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        ctx.prisma.company.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    },

    account: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      return ctx.prisma.company.findFirst({
        where: { id: args.id, organizationId: ctx.organizationId },
      });
    },

    // ---- Contacts ----

    contacts: async (
      _parent: unknown,
      args: { page?: number; limit?: number; search?: string; companyId?: string },
      ctx: GraphQLContext,
    ) => {
      const { skip, take, page, limit } = paginate(args.page, args.limit);
      const where: Record<string, unknown> = { organizationId: ctx.organizationId };

      if (args.companyId) {
        where.companyId = args.companyId;
      }

      if (args.search) {
        where.OR = [
          { firstName: { contains: args.search, mode: 'insensitive' } },
          { lastName: { contains: args.search, mode: 'insensitive' } },
          { email: { contains: args.search, mode: 'insensitive' } },
        ];
      }

      const [items, total] = await Promise.all([
        ctx.prisma.contact.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        ctx.prisma.contact.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    },

    contact: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      return ctx.prisma.contact.findFirst({
        where: { id: args.id, organizationId: ctx.organizationId },
      });
    },

    // ---- Deals ----

    deals: async (
      _parent: unknown,
      args: { page?: number; limit?: number; stage?: string; companyId?: string },
      ctx: GraphQLContext,
    ) => {
      const { skip, take, page, limit } = paginate(args.page, args.limit);
      const where: Record<string, unknown> = { organizationId: ctx.organizationId };

      if (args.stage) {
        where.stage = args.stage;
      }

      if (args.companyId) {
        where.companyId = args.companyId;
      }

      const [items, total] = await Promise.all([
        ctx.prisma.deal.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
        ctx.prisma.deal.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    },

    deal: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext,
    ) => {
      return ctx.prisma.deal.findFirst({
        where: { id: args.id, organizationId: ctx.organizationId },
      });
    },

    // ---- Signals ----

    signals: async (
      _parent: unknown,
      args: { page?: number; limit?: number; type?: string; accountId?: string; from?: string; to?: string },
      ctx: GraphQLContext,
    ) => {
      const { skip, take, page, limit } = paginate(args.page, args.limit);
      const where: Record<string, unknown> = { organizationId: ctx.organizationId };

      if (args.type) {
        where.type = args.type;
      }

      if (args.accountId) {
        where.accountId = args.accountId;
      }

      if (args.from || args.to) {
        const timestamp: Record<string, Date> = {};
        if (args.from) timestamp.gte = new Date(args.from);
        if (args.to) timestamp.lte = new Date(args.to);
        where.timestamp = timestamp;
      }

      const [items, total] = await Promise.all([
        ctx.prisma.signal.findMany({ where, skip, take, orderBy: { timestamp: 'desc' } }),
        ctx.prisma.signal.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    },

    // ---- Top Accounts (scoring) ----

    topAccounts: async (
      _parent: unknown,
      args: { limit?: number; tier?: string },
      ctx: GraphQLContext,
    ) => {
      const take = Math.min(100, Math.max(1, args.limit ?? 10));
      const where: Record<string, unknown> = { organizationId: ctx.organizationId };

      if (args.tier) {
        where.tier = args.tier;
      }

      return ctx.prisma.accountScore.findMany({
        where,
        take,
        orderBy: { score: 'desc' },
      });
    },

    // ---- Signal Sources ----

    signalSources: async (
      _parent: unknown,
      _args: unknown,
      ctx: GraphQLContext,
    ) => {
      return ctx.prisma.signalSource.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: 'desc' },
      });
    },
  },

  // ============================================================
  // Field resolvers — Account (Company)
  // ============================================================

  Account: {
    contacts: async (parent: Company, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.contact.findMany({
        where: { companyId: parent.id, organizationId: ctx.organizationId },
      });
    },

    deals: async (parent: Company, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.deal.findMany({
        where: { companyId: parent.id, organizationId: ctx.organizationId },
      });
    },

    signals: async (parent: Company, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.signal.findMany({
        where: { accountId: parent.id, organizationId: ctx.organizationId },
        orderBy: { timestamp: 'desc' },
      });
    },

    score: async (parent: Company, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.accountScore.findFirst({
        where: { accountId: parent.id, organizationId: ctx.organizationId },
      });
    },

    brief: async (parent: Company, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.accountBrief.findFirst({
        where: { accountId: parent.id, organizationId: ctx.organizationId },
        orderBy: { generatedAt: 'desc' },
      });
    },
  },

  // ============================================================
  // Field resolvers — Contact
  // ============================================================

  Contact: {
    company: async (parent: Contact, _args: unknown, ctx: GraphQLContext) => {
      if (!parent.companyId) return null;
      return ctx.prisma.company.findFirst({
        where: { id: parent.companyId, organizationId: ctx.organizationId },
      });
    },

    identities: async (parent: Contact, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.contactIdentity.findMany({
        where: { contactId: parent.id },
      });
    },

    signals: async (parent: Contact, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.signal.findMany({
        where: { actorId: parent.id, organizationId: ctx.organizationId },
        orderBy: { timestamp: 'desc' },
      });
    },
  },

  // ============================================================
  // Field resolvers — Deal
  // ============================================================

  Deal: {
    contact: async (parent: Deal, _args: unknown, ctx: GraphQLContext) => {
      if (!parent.contactId) return null;
      return ctx.prisma.contact.findFirst({
        where: { id: parent.contactId, organizationId: ctx.organizationId },
      });
    },

    company: async (parent: Deal, _args: unknown, ctx: GraphQLContext) => {
      if (!parent.companyId) return null;
      return ctx.prisma.company.findFirst({
        where: { id: parent.companyId, organizationId: ctx.organizationId },
      });
    },

    owner: async (parent: Deal, _args: unknown, ctx: GraphQLContext) => {
      if (!parent.ownerId) return null;
      return ctx.prisma.user.findUnique({ where: { id: parent.ownerId } });
    },
  },

  // ============================================================
  // Field resolvers — Signal
  // ============================================================

  Signal: {
    actor: async (parent: Signal, _args: unknown, ctx: GraphQLContext) => {
      if (!parent.actorId) return null;
      return ctx.prisma.contact.findFirst({
        where: { id: parent.actorId, organizationId: ctx.organizationId },
      });
    },

    account: async (parent: Signal, _args: unknown, ctx: GraphQLContext) => {
      if (!parent.accountId) return null;
      return ctx.prisma.company.findFirst({
        where: { id: parent.accountId, organizationId: ctx.organizationId },
      });
    },

    source: async (parent: Signal, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.signalSource.findFirst({
        where: { id: parent.sourceId, organizationId: ctx.organizationId },
      });
    },
  },

  // ============================================================
  // Field resolvers — AccountScore
  // ============================================================

  AccountScore: {
    account: async (parent: AccountScore, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.company.findFirst({
        where: { id: parent.accountId, organizationId: ctx.organizationId },
      });
    },
  },
};

export default resolvers;
