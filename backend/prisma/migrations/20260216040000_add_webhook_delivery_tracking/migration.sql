-- CreateEnum: WebhookSubscriptionStatus
CREATE TYPE "WebhookSubscriptionStatus" AS ENUM ('HEALTHY', 'FAILING');

-- AlterTable: add status to WebhookSubscription
ALTER TABLE "webhook_subscriptions" ADD COLUMN "status" "WebhookSubscriptionStatus" NOT NULL DEFAULT 'HEALTHY';

-- CreateTable: WebhookSubscriptionDelivery
CREATE TABLE "webhook_subscription_deliveries" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_subscription_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_subscription_deliveries_subscriptionId_idx" ON "webhook_subscription_deliveries"("subscriptionId");
CREATE INDEX "webhook_subscription_deliveries_createdAt_idx" ON "webhook_subscription_deliveries"("createdAt");

-- AddForeignKey
ALTER TABLE "webhook_subscription_deliveries" ADD CONSTRAINT "webhook_subscription_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "webhook_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
