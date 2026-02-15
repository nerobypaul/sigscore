-- Add enum values that were added to schema.prisma but lacked migration files.
-- Using IF NOT EXISTS so this is safe to run even if values already exist.

-- SignalSourceType additions
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'SEGMENT';
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'DISCORD';
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'TWITTER';
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'STACKOVERFLOW';
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'REDDIT';

-- IdentityType additions
ALTER TYPE "IdentityType" ADD VALUE IF NOT EXISTS 'DISCORD';
ALTER TYPE "IdentityType" ADD VALUE IF NOT EXISTS 'STACKOVERFLOW';
ALTER TYPE "IdentityType" ADD VALUE IF NOT EXISTS 'REDDIT';
