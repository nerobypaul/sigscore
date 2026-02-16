-- AlterTable
ALTER TABLE "signals" ADD COLUMN "deduplicationKey" TEXT;

-- CreateIndex
CREATE INDEX "signals_organizationId_deduplicationKey_timestamp_idx" ON "signals"("organizationId", "deduplicationKey", "timestamp" DESC);
