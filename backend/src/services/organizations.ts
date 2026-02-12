import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const createOrganization = async (
  userId: string,
  data: { name: string; domain?: string; logo?: string; settings?: Record<string, unknown> }
) => {
  const slug = slugify(data.name);

  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    throw new AppError('An organization with this name already exists', 409);
  }

  const org = await prisma.organization.create({
    data: {
      name: data.name,
      slug,
      domain: data.domain,
      logo: data.logo,
      settings: data.settings as Prisma.InputJsonValue ?? undefined,
      users: {
        create: {
          userId,
          role: 'OWNER',
        },
      },
    },
    include: {
      users: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  return org;
};

export const getOrganizations = async (userId: string) => {
  const userOrgs = await prisma.userOrganization.findMany({
    where: { userId },
    include: {
      organization: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return userOrgs.map((uo) => ({
    ...uo.organization,
    role: uo.role,
  }));
};

export const getOrganization = async (userId: string, orgId: string) => {
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!userOrg) {
    throw new AppError('Organization not found', 404);
  }

  return {
    ...userOrg.organization,
    role: userOrg.role,
  };
};

export const updateOrganization = async (
  userId: string,
  orgId: string,
  data: { name?: string; domain?: string; logo?: string; settings?: Record<string, unknown> }
) => {
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: orgId,
      },
    },
  });

  if (!userOrg) {
    throw new AppError('Organization not found', 404);
  }

  if (userOrg.role !== 'OWNER' && userOrg.role !== 'ADMIN') {
    throw new AppError('Insufficient permissions to update organization', 403);
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
    updateData.slug = slugify(data.name);
  }
  if (data.domain !== undefined) updateData.domain = data.domain;
  if (data.logo !== undefined) updateData.logo = data.logo;
  if (data.settings !== undefined) updateData.settings = data.settings as Prisma.InputJsonValue;

  const org = await prisma.organization.update({
    where: { id: orgId },
    data: updateData,
    include: {
      users: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  return org;
};
