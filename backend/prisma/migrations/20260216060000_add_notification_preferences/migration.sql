-- CreateEnum
CREATE TYPE "EmailDigestFrequency" AS ENUM ('DAILY', 'WEEKLY', 'NEVER');

-- CreateEnum
CREATE TYPE "SignalAlertLevel" AS ENUM ('ALL', 'HOT_ONLY', 'NONE');

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailDigest" "EmailDigestFrequency" NOT NULL DEFAULT 'WEEKLY',
    "signalAlerts" "SignalAlertLevel" NOT NULL DEFAULT 'ALL',
    "workflowNotifications" BOOLEAN NOT NULL DEFAULT true,
    "teamMentions" BOOLEAN NOT NULL DEFAULT true,
    "usageLimitWarnings" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_key" ON "notification_preferences"("userId");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
