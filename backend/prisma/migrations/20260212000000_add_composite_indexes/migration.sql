-- CreateIndex (composite indexes for query performance)

-- contacts: filter by org + lastName (contact search)
CREATE INDEX "contacts_organizationId_lastName_idx" ON "contacts"("organizationId", "lastName");

-- contacts: filter by org, sort by createdAt desc (listing)
CREATE INDEX "contacts_organizationId_createdAt_idx" ON "contacts"("organizationId", "createdAt" DESC);

-- companies: filter by org + name (account search)
CREATE INDEX "companies_organizationId_name_idx" ON "companies"("organizationId", "name");

-- companies: filter by org, sort by createdAt desc (listing)
CREATE INDEX "companies_organizationId_createdAt_idx" ON "companies"("organizationId", "createdAt" DESC);

-- deals: filter by org + stage, sort by createdAt desc (pipeline view)
CREATE INDEX "deals_organizationId_stage_createdAt_idx" ON "deals"("organizationId", "stage", "createdAt" DESC);

-- activities: filter by org + type + status (activity feed)
CREATE INDEX "activities_organizationId_type_status_idx" ON "activities"("organizationId", "type", "status");

-- signal_sources: filter by org + type
CREATE INDEX "signal_sources_organizationId_type_idx" ON "signal_sources"("organizationId", "type");

-- signals: filter by org, sort by timestamp desc (signal feed)
CREATE INDEX "signals_organizationId_timestamp_idx" ON "signals"("organizationId", "timestamp" DESC);

-- signals: filter by accountId, sort by timestamp desc (account signals)
CREATE INDEX "signals_accountId_timestamp_idx" ON "signals"("accountId", "timestamp" DESC);

-- signals: filter by actorId, sort by timestamp desc (contact signals)
CREATE INDEX "signals_actorId_timestamp_idx" ON "signals"("actorId", "timestamp" DESC);

-- signals: filter by type, sort by timestamp desc (signal type filter)
CREATE INDEX "signals_type_timestamp_idx" ON "signals"("type", "timestamp" DESC);

-- signals: filter by org + type, sort by timestamp desc (org signal type filter)
CREATE INDEX "signals_organizationId_type_timestamp_idx" ON "signals"("organizationId", "type", "timestamp" DESC);

-- signals: filter by org + sourceId, sort by timestamp desc (source-specific signals)
CREATE INDEX "signals_organizationId_sourceId_timestamp_idx" ON "signals"("organizationId", "sourceId", "timestamp" DESC);

-- account_scores: filter by org, sort by score desc (leaderboard)
CREATE INDEX "account_scores_organizationId_score_idx" ON "account_scores"("organizationId", "score" DESC);

-- account_scores: filter by org + tier
CREATE INDEX "account_scores_organizationId_tier_idx" ON "account_scores"("organizationId", "tier");

-- custom_object_records: filter by schemaId + org
CREATE INDEX "custom_object_records_schemaId_organizationId_idx" ON "custom_object_records"("schemaId", "organizationId");

-- account_briefs: filter by accountId, sort by generatedAt desc (latest brief)
CREATE INDEX "account_briefs_accountId_generatedAt_idx" ON "account_briefs"("accountId", "generatedAt" DESC);

-- webhook_deliveries: filter by endpointId, sort by createdAt desc
CREATE INDEX "webhook_deliveries_endpointId_createdAt_idx" ON "webhook_deliveries"("endpointId", "createdAt" DESC);
