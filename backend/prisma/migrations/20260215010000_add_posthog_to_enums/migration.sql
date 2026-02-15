-- AlterEnum: Add POSTHOG to SignalSourceType
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'POSTHOG';

-- AlterEnum: Add POSTHOG to IdentityType
ALTER TYPE "IdentityType" ADD VALUE IF NOT EXISTS 'POSTHOG';
