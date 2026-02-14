-- CreateTable
CREATE TABLE "dashboards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Dashboard',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboards_organizationId_userId_idx" ON "dashboards"("organizationId", "userId");
CREATE INDEX "dashboards_organizationId_isDefault_idx" ON "dashboards"("organizationId", "isDefault");

-- AddForeignKey
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
