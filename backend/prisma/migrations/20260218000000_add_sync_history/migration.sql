-- CreateEnum
CREATE TYPE "SyncHistoryStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "sync_history" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "SyncHistoryStatus" NOT NULL DEFAULT 'RUNNING',
    "signalsCreated" INTEGER NOT NULL DEFAULT 0,
    "signalsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "sync_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_history_sourceId_startedAt_idx" ON "sync_history"("sourceId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "sync_history" ADD CONSTRAINT "sync_history_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "signal_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
