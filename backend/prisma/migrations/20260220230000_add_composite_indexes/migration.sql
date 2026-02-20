-- Add composite indexes for faster queries on list endpoints
-- These cover common WHERE + ORDER BY patterns used in the API

-- Contacts: search by email or firstName within org
CREATE INDEX IF NOT EXISTS "contacts_organizationId_email_idx" ON "contacts" ("organizationId", "email");
CREATE INDEX IF NOT EXISTS "contacts_organizationId_firstName_idx" ON "contacts" ("organizationId", "firstName");

-- Signals: account-scoped queries sorted by time (used by company detail, scoring)
CREATE INDEX IF NOT EXISTS "signals_organizationId_accountId_timestamp_idx" ON "signals" ("organizationId", "accountId", "timestamp" DESC);
