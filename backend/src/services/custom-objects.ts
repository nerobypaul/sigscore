import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export interface FieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
  default?: unknown;
}

export interface CreateSchemaInput {
  name: string;
  description?: string;
  fields: FieldDefinition[];
}

export interface UpdateSchemaInput {
  name?: string;
  description?: string;
  fields?: FieldDefinition[];
}

export interface RecordFilters {
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

// ============================================================
// Helpers
// ============================================================

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateRecordData(
  data: Record<string, unknown>,
  fields: FieldDefinition[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of fields) {
    const value = data[field.name];

    // Check required fields
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push(`Field "${field.name}" is required`);
      continue;
    }

    // Skip validation for absent optional fields
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation and coercion
    switch (field.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`Field "${field.name}" must be a string`);
        }
        break;
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`Field "${field.name}" must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push(`Field "${field.name}" must be a boolean`);
        }
        break;
      case 'date':
        if (isNaN(Date.parse(String(value)))) {
          errors.push(`Field "${field.name}" must be a valid date`);
        }
        break;
    }
  }

  return { valid: errors.length === 0, errors };
}

function coerceRecordData(
  data: Record<string, unknown>,
  fields: FieldDefinition[]
): Record<string, unknown> {
  const coerced: Record<string, unknown> = {};

  for (const field of fields) {
    let value = data[field.name];

    // Apply default if value is absent
    if ((value === undefined || value === null) && field.default !== undefined) {
      value = field.default;
    }

    if (value === undefined || value === null) {
      if (field.required) {
        coerced[field.name] = null;
      }
      continue;
    }

    // Coerce types
    switch (field.type) {
      case 'string':
        coerced[field.name] = String(value);
        break;
      case 'number':
        coerced[field.name] = Number(value);
        break;
      case 'boolean':
        coerced[field.name] = value === true || value === 'true';
        break;
      case 'date':
        coerced[field.name] = new Date(String(value)).toISOString();
        break;
    }
  }

  return coerced;
}

// ============================================================
// Schema CRUD
// ============================================================

export const createSchema = async (organizationId: string, data: CreateSchemaInput) => {
  const slug = slugify(data.name);

  const existing = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (existing) {
    throw new SchemaConflictError(`A custom object with slug "${slug}" already exists`);
  }

  const schema = await prisma.customObjectSchema.create({
    data: {
      organizationId,
      slug,
      name: data.name,
      description: data.description,
      fields: data.fields as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info(`Custom object schema created: ${schema.id} (${slug})`);
  return schema;
};

export const getSchemas = async (organizationId: string) => {
  const schemas = await prisma.customObjectSchema.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { records: true },
      },
    },
  });

  return schemas.map((s) => ({
    ...s,
    recordCount: s._count.records,
    _count: undefined,
  }));
};

export const getSchemaBySlug = async (organizationId: string, slug: string) => {
  return prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
    include: {
      _count: {
        select: { records: true },
      },
    },
  });
};

export const updateSchema = async (
  organizationId: string,
  slug: string,
  data: UpdateSchemaInput
) => {
  const existing = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!existing) {
    return null;
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) {
    updateData.name = data.name;
  }
  if (data.description !== undefined) {
    updateData.description = data.description;
  }
  if (data.fields !== undefined) {
    updateData.fields = data.fields as unknown as Prisma.InputJsonValue;
  }

  const updated = await prisma.customObjectSchema.update({
    where: { organizationId_slug: { organizationId, slug } },
    data: updateData,
  });

  logger.info(`Custom object schema updated: ${updated.id} (${slug})`);
  return updated;
};

export const deleteSchema = async (organizationId: string, slug: string) => {
  const existing = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!existing) {
    return null;
  }

  // Delete all records first (cascade), then the schema
  await prisma.$transaction([
    prisma.customObjectRecord.deleteMany({ where: { schemaId: existing.id } }),
    prisma.customObjectSchema.delete({
      where: { organizationId_slug: { organizationId, slug } },
    }),
  ]);

  logger.info(`Custom object schema deleted: ${existing.id} (${slug})`);
  return existing;
};

// ============================================================
// Record CRUD
// ============================================================

export const createRecord = async (
  organizationId: string,
  slug: string,
  data: Record<string, unknown>
) => {
  const schema = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!schema) {
    throw new SchemaNotFoundError(`Custom object "${slug}" not found`);
  }

  const fields = schema.fields as unknown as FieldDefinition[];
  const validation = validateRecordData(data, fields);

  if (!validation.valid) {
    throw new RecordValidationError('Record validation failed', validation.errors);
  }

  const coercedData = coerceRecordData(data, fields);

  const record = await prisma.customObjectRecord.create({
    data: {
      schemaId: schema.id,
      organizationId,
      data: coercedData as Prisma.InputJsonValue,
    },
  });

  logger.info(`Custom object record created: ${record.id} for schema ${slug}`);
  return record;
};

export const getRecords = async (
  organizationId: string,
  slug: string,
  filters: RecordFilters
) => {
  const schema = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!schema) {
    throw new SchemaNotFoundError(`Custom object "${slug}" not found`);
  }

  const { page = 1, limit = 20, ...fieldFilters } = filters;
  const skip = (page - 1) * limit;

  // Build filter conditions for JSON data field
  const dataFilters: Record<string, unknown>[] = [];
  for (const [key, value] of Object.entries(fieldFilters)) {
    if (value !== undefined && value !== null && value !== '') {
      dataFilters.push({
        data: {
          path: [key],
          equals: value,
        },
      });
    }
  }

  const where = {
    schemaId: schema.id,
    organizationId,
    ...(dataFilters.length > 0 ? { AND: dataFilters } : {}),
  };

  const [records, total] = await Promise.all([
    prisma.customObjectRecord.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customObjectRecord.count({ where }),
  ]);

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

export const getRecordById = async (
  organizationId: string,
  slug: string,
  recordId: string
) => {
  const schema = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!schema) {
    throw new SchemaNotFoundError(`Custom object "${slug}" not found`);
  }

  return prisma.customObjectRecord.findFirst({
    where: {
      id: recordId,
      schemaId: schema.id,
      organizationId,
    },
  });
};

export const updateRecord = async (
  organizationId: string,
  slug: string,
  recordId: string,
  data: Record<string, unknown>
) => {
  const schema = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!schema) {
    throw new SchemaNotFoundError(`Custom object "${slug}" not found`);
  }

  const existing = await prisma.customObjectRecord.findFirst({
    where: {
      id: recordId,
      schemaId: schema.id,
      organizationId,
    },
  });

  if (!existing) {
    return null;
  }

  const fields = schema.fields as unknown as FieldDefinition[];

  // Merge existing data with updates for validation
  const existingData = existing.data as Record<string, unknown>;
  const mergedData = { ...existingData, ...data };

  const validation = validateRecordData(mergedData, fields);

  if (!validation.valid) {
    throw new RecordValidationError('Record validation failed', validation.errors);
  }

  const coercedData = coerceRecordData(mergedData, fields);

  const updated = await prisma.customObjectRecord.update({
    where: { id: recordId },
    data: { data: coercedData as Prisma.InputJsonValue },
  });

  logger.info(`Custom object record updated: ${recordId} for schema ${slug}`);
  return updated;
};

export const deleteRecord = async (
  organizationId: string,
  slug: string,
  recordId: string
) => {
  const schema = await prisma.customObjectSchema.findUnique({
    where: { organizationId_slug: { organizationId, slug } },
  });

  if (!schema) {
    throw new SchemaNotFoundError(`Custom object "${slug}" not found`);
  }

  const existing = await prisma.customObjectRecord.findFirst({
    where: {
      id: recordId,
      schemaId: schema.id,
      organizationId,
    },
  });

  if (!existing) {
    return null;
  }

  await prisma.customObjectRecord.delete({ where: { id: recordId } });

  logger.info(`Custom object record deleted: ${recordId} for schema ${slug}`);
  return existing;
};

// ============================================================
// Custom Error Classes
// ============================================================

export class SchemaNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaNotFoundError';
  }
}

export class SchemaConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaConflictError';
  }
}

export class RecordValidationError extends Error {
  public details: string[];
  constructor(message: string, details: string[]) {
    super(message);
    this.name = 'RecordValidationError';
    this.details = details;
  }
}
