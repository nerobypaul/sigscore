-- CreateTable
CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "sortField" TEXT,
    "sortDirection" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_views_organizationId_entityType_idx" ON "saved_views"("organizationId", "entityType");
CREATE INDEX "saved_views_userId_entityType_idx" ON "saved_views"("userId", "entityType");

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
