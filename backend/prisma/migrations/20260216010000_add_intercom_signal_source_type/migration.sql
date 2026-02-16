-- AlterEnum: add INTERCOM to SignalSourceType
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'INTERCOM';

-- AlterEnum: add INTERCOM to IdentityType
ALTER TYPE "IdentityType" ADD VALUE IF NOT EXISTS 'INTERCOM';
