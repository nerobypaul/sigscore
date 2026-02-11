import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export interface ActivityFilters {
  type?: string;
  status?: string;
  userId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  page?: number;
  limit?: number;
}

export const getActivities = async (organizationId: string, filters: ActivityFilters) => {
  const { type, status, userId, contactId, companyId, dealId, page = 1, limit } = filters;
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 20));
  const skip = (page - 1) * clampedLimit;

  const where: Prisma.ActivityWhereInput = {
    organizationId,
    ...(type && { type: type as any }),
    ...(status && { status: status as any }),
    ...(userId && { userId }),
    ...(contactId && { contactId }),
    ...(companyId && { companyId }),
    ...(dealId && { dealId }),
  };

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      skip,
      take: clampedLimit,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
        company: {
          select: { id: true, name: true },
        },
        deal: {
          select: { id: true, title: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activity.count({ where }),
  ]);

  return {
    activities,
    pagination: {
      page,
      limit: clampedLimit,
      total,
      totalPages: Math.ceil(total / clampedLimit),
    },
  };
};

export const getActivityById = async (id: string, organizationId: string) => {
  return prisma.activity.findFirst({
    where: { id, organizationId },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      contact: true,
      company: true,
      deal: true,
    },
  });
};

export const createActivity = async (organizationId: string, userId: string, data: Prisma.ActivityCreateInput) => {
  return prisma.activity.create({
    data: {
      ...data,
      organization: { connect: { id: organizationId } },
      user: { connect: { id: userId } },
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true },
      },
      contact: {
        select: { id: true, firstName: true, lastName: true },
      },
      company: {
        select: { id: true, name: true },
      },
      deal: {
        select: { id: true, title: true },
      },
    },
  });
};

export const updateActivity = async (id: string, organizationId: string, data: Prisma.ActivityUpdateInput) => {
  const existing = await prisma.activity.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error('Activity not found');
  return prisma.activity.update({
    where: { id },
    data,
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true },
      },
      contact: {
        select: { id: true, firstName: true, lastName: true },
      },
      company: {
        select: { id: true, name: true },
      },
      deal: {
        select: { id: true, title: true },
      },
    },
  });
};

export const deleteActivity = async (id: string, organizationId: string) => {
  const existing = await prisma.activity.findFirst({ where: { id, organizationId } });
  if (!existing) throw new Error('Activity not found');
  return prisma.activity.delete({
    where: { id },
  });
};
