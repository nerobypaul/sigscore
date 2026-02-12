import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

export interface ContactFilters {
  search?: string;
  companyId?: string;
  page?: number;
  limit?: number;
}

export const getContacts = async (organizationId: string, filters: ContactFilters) => {
  const { search, companyId, page = 1, limit } = filters;
  const clampedLimit = Math.min(100, Math.max(1, limit ?? 20));
  const skip = (page - 1) * clampedLimit;

  const where: Prisma.ContactWhereInput = {
    organizationId,
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    }),
    ...(companyId && { companyId }),
  };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      skip,
      take: clampedLimit,
      include: {
        company: {
          select: { id: true, name: true },
        },
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contact.count({ where }),
  ]);

  return {
    contacts,
    pagination: {
      page,
      limit: clampedLimit,
      total,
      totalPages: Math.ceil(total / clampedLimit),
    },
  };
};

export const getContactById = async (id: string, organizationId: string) => {
  return prisma.contact.findFirst({
    where: { id, organizationId },
    include: {
      company: true,
      deals: true,
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

export const createContact = async (organizationId: string, data: Prisma.ContactCreateInput) => {
  return prisma.contact.create({
    data: {
      ...data,
      organization: { connect: { id: organizationId } },
    },
    include: {
      company: true,
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const updateContact = async (id: string, organizationId: string, data: Prisma.ContactUpdateInput) => {
  const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError('Contact not found', 404);
  return prisma.contact.update({
    where: { id },
    data,
    include: {
      company: true,
      tags: {
        include: { tag: true },
      },
    },
  });
};

export const deleteContact = async (id: string, organizationId: string) => {
  const existing = await prisma.contact.findFirst({ where: { id, organizationId } });
  if (!existing) throw new AppError('Contact not found', 404);
  return prisma.contact.delete({
    where: { id },
  });
};
