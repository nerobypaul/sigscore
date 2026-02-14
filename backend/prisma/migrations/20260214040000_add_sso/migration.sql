-- CreateEnum
CREATE TYPE "SsoProvider" AS ENUM ('SAML', 'OIDC');

-- CreateTable
CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT,
    "ssoUrl" TEXT,
    "certificate" TEXT,
    "clientId" TEXT,
    "clientSecret" TEXT,
    "issuer" TEXT,
    "discoveryUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sso_connections_organizationId_idx" ON "sso_connections"("organizationId");

-- CreateIndex (unique — one SSO connection per org)
CREATE UNIQUE INDEX "sso_connections_organizationId_key" ON "sso_connections"("organizationId");

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
