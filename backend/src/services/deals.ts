import { Prisma, DealStage } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

const VALID_DEAL_STAGES = new Set<string>(Object.values(DealStage));

export interface DealFilters {
  stage?: string;
  ownerId?: string;
  companyId?: string;
  page?: number;
  limit?: number;
}

export const getDeals = async (organizationId: string, filters: DealFilters) => {
  const { stage, ownerId, companyId, page = 1, limit } = filters;
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 20));
  const skip = (page - 1) * clampedLimit;

  const where: Prisma.DealWhereInput = {
    organizationId,
    ...(stage && VALID_DEAL_STAGES.has(stage) && { stage: stage as DealStage }),
    ...(ownerId && { ownerId }),
    ...(companyId && { companyId }),
  };

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      skip,
      take: clampedLimit,
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
      limit: clampedLimit,
      total,
      totalPages: Math.ceil(total / clampedLimit),
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
  const existing = await prisma.deal.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError('Deal not found', 404);
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
  const existing = await prisma.deal.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError('Deal not found', 404);
  return prisma.deal.delete({
    where: { id },
  });
};
