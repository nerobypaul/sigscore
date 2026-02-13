-- AlterEnum: Add PYPI to SignalSourceType
ALTER TYPE "SignalSourceType" ADD VALUE IF NOT EXISTS 'PYPI';
