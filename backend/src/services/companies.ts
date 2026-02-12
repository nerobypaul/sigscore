import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

export interface CompanyFilters {
  search?: string;
  industry?: string;
  page?: number;
  limit?: number;
}

export const getCompanies = async (organizationId: string, filters: CompanyFilters) => {
  const { search, industry, page = 1, limit } = filters;
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 20));
  const skip = (page - 1) * clampedLimit;

  const where: Prisma.CompanyWhereInput = {
    organizationId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(industry && { industry }),
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip,
      take: clampedLimit,
      include: {
        _count: {
          select: { contacts: true, deals: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    companies,
    pagination: {
      page,
      limit: clampedLimit,
      total,
      totalPages: Math.ceil(total / clampedLimit),
    },
  };
};

export const getCompanyById = async (id: string, organizationId: string) => {
  return prisma.company.findFirst({
    where: { id, organizationId },
    include: {
      contacts: {
        orderBy: { createdAt: 'desc' },
      },
      deals: {
        orderBy: { createdAt: 'desc' },
      },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const createCompany = async (organizationId: string, data: Prisma.CompanyCreateInput) => {
  return prisma.company.create({
    data: {
      ...data,
      organization: { connect: { id: organizationId } },
    },
    include: {
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const updateCompany = async (id: string, organizationId: string, data: Prisma.CompanyUpdateInput) => {
  const existing = await prisma.company.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError('Company not found', 404);
  return prisma.company.update({
    where: { id },
    data,
    include: {
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const deleteCompany = async (id: string, organizationId: string) => {
  const existing = await prisma.company.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError('Company not found', 404);
  return prisma.company.delete({
    where: { id },
  });
};
