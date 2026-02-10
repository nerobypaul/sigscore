import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export interface DealFilters {
  stage?: string;
  ownerId?: string;
  companyId?: string;
  page?: number;
  limit?: number;
}

export const getDeals = async (organizationId: string, filters: DealFilters) => {
  const { stage, ownerId, companyId, page = 1, limit = 20 } = filters;
  const skip = (page - 1) * limit;

  const where: Prisma.DealWhereInput = {
    organizationId,
    ...(stage && { stage: stage as any }),
    ...(ownerId && { ownerId }),
    ...(companyId && { companyId }),
  };

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      skip,
      take: limit,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
        company: {
          select: { id: true, name: true },
        },
        owner: {
          select: { id: true, firstName: true, lastName: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.deal.count({ where }),
  ]);

  return {
    deals,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getDealById = async (id: string, organizationId: string) => {
  return prisma.deal.findFirst({
    where: { id, organizationId },
    include: {
      contact: true,
      company: true,
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      },
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const createDeal = async (organizationId: string, data: Prisma.DealCreateInput) => {
  return prisma.deal.create({
    data: {
      ...data,
      organization: { connect: { id: organizationId } },
    },
    include: {
      contact: true,
      company: true,
      owner: {
        select: { id: true, firstName: true, lastName: true },
      },
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const updateDeal = async (id: string, organizationId: string, data: Prisma.DealUpdateInput) => {
  return prisma.deal.update({
    where: { id },
    data,
    include: {
      contact: true,
      company: true,
      owner: {
        select: { id: true, firstName: true, lastName: true },
      },
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const deleteDeal = async (id: string, organizationId: string) => {
  return prisma.deal.delete({
    where: { id },
  });
};
