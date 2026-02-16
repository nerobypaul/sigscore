-- AlterEnum: add ZENDESK to SignalSourceType
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'ZENDESK';

-- AlterEnum: add ZENDESK to IdentityType
ALTER TYPE "IdentityType" ADD VALUE IF NOT EXISTS 'ZENDESK';
