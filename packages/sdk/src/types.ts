// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export interface Signal {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  timestamp: string;
  actorId?: string;
  accountId?: string;
  anonymousId?: string;
  createdAt: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  companyId?: string;
  github?: string;
  linkedIn?: string;
  twitter?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  name: string;
  domain?: string;
  industry?: string;
  size?: CompanySize;
  website?: string;
  githubOrg?: string;
  createdAt: string;
  updatedAt: string;
}

export type CompanySize = 'STARTUP' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';

export interface Deal {
  id: string;
  title: string;
  amount?: number;
  currency: string;
  stage: DealStage;
  probability?: number;
  contactId?: string;
  companyId?: string;
  expectedCloseDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type DealStage =
  | 'ANONYMOUS_USAGE'
  | 'IDENTIFIED'
  | 'ACTIVATED'
  | 'TEAM_ADOPTION'
  | 'EXPANSION_SIGNAL'
  | 'SALES_QUALIFIED'
  | 'NEGOTIATION'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

export type ScoreTier = 'HOT' | 'WARM' | 'COLD' | 'INACTIVE';
export type ScoreTrend = 'RISING' | 'STABLE' | 'FALLING';

export interface ScoreFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

export interface AccountScore {
  id: string;
  accountId: string;
  score: number;
  tier: ScoreTier;
  factors: ScoreFactor[];
  signalCount: number;
  userCount: number;
  lastSignalAt?: string;
  trend: ScoreTrend;
  computedAt: string;
}

export interface Activity {
  id: string;
  type: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ---------------------------------------------------------------------------
// Input / create types
// ---------------------------------------------------------------------------

export interface SignalInput {
  type: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  timestamp?: string;
  actorEmail?: string;
  anonymousId?: string;
  idempotencyKey?: string;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  companyId?: string;
  github?: string;
}

export interface CompanyInput {
  name: string;
  domain?: string;
  industry?: string;
  size?: CompanySize;
  website?: string;
  githubOrg?: string;
}

export interface DealInput {
  title: string;
  amount?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  contactId?: string;
  companyId?: string;
  expectedCloseDate?: string;
}

// ---------------------------------------------------------------------------
// Query / list params
// ---------------------------------------------------------------------------

export interface ListParams {
  page?: number;
  limit?: number;
}

export interface SignalQueryParams extends ListParams {
  type?: string;
  accountId?: string;
  from?: string;
  to?: string;
}

export interface ContactQueryParams extends ListParams {
  search?: string;
  companyId?: string;
}

export interface CompanyQueryParams extends ListParams {
  search?: string;
  industry?: string;
}

export interface DealQueryParams extends ListParams {
  stage?: DealStage;
  companyId?: string;
}

export interface TopAccountsParams {
  limit?: number;
  tier?: ScoreTier;
}

// ---------------------------------------------------------------------------
// Batch response
// ---------------------------------------------------------------------------

export interface BatchIngestResult {
  processed: number;
  failed: number;
  results: Signal[];
}

// ---------------------------------------------------------------------------
// AI types
// ---------------------------------------------------------------------------

export interface AccountBrief {
  id: string;
  accountId: string;
  summary: string;
  highlights: string[];
  risks: string[];
  opportunities: string[];
  generatedAt: string;
}

export interface SuggestedAction {
  action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  channel?: string;
}

export interface EnrichedContact {
  contactId: string;
  enrichedFields: Record<string, unknown>;
  sources: string[];
  enrichedAt: string;
}

export interface AiConfig {
  enabled: boolean;
  provider?: string;
  hasApiKey: boolean;
}

export interface AiConfigUpdate {
  apiKey: string;
}

// ---------------------------------------------------------------------------
// Webhook types
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | 'signal.created'
  | 'contact.created'
  | 'contact.updated'
  | 'company.created'
  | 'company.updated'
  | 'deal.created'
  | 'deal.updated'
  | 'score.changed';

export interface WebhookSubscription {
  id: string;
  targetUrl: string;
  event: WebhookEventType;
  active: boolean;
  secret: string;
  hookId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookSubscriptionInput {
  targetUrl: string;
  event: WebhookEventType;
  hookId?: string;
}

export interface WebhookSubscriptionUpdate {
  active: boolean;
}

export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  response?: string;
  duration?: number;
  payload?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: string;
  statusCode?: number;
  success: boolean;
  duration?: number;
  createdAt: string;
}

export interface WebhookSubscriptionStatus {
  subscription: WebhookSubscription;
  deliveryStats: {
    total: number;
    successful: number;
    failed: number;
    failureRate: number;
  };
}

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export type AlertTriggerType =
  | 'score_drop'
  | 'score_rise'
  | 'score_threshold'
  | 'engagement_drop'
  | 'new_hot_signal'
  | 'account_inactive';

export interface AlertChannels {
  inApp: boolean;
  email: boolean;
  slack: boolean;
  slackChannel?: string;
}

export interface AlertConditions {
  threshold?: number;
  dropPercent?: number;
  risePercent?: number;
  withinDays?: number;
  inactiveDays?: number;
  direction?: 'above' | 'below';
  sourceTypes?: string[];
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string | null;
  triggerType: AlertTriggerType;
  conditions: AlertConditions;
  channels: AlertChannels;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface AlertRuleInput {
  name: string;
  description?: string;
  triggerType: AlertTriggerType;
  conditions: AlertConditions;
  channels: AlertChannels;
  enabled?: boolean;
}

export interface AlertTestResult {
  success: boolean;
  message: string;
  channels: {
    inApp: boolean;
    email: boolean;
    slack: boolean;
  };
}

export interface AlertHistoryParams {
  limit?: number;
  cursor?: string;
}

export interface AlertHistoryResponse {
  history: Array<{
    id: string;
    type: string;
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    createdAt: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Scoring config types
// ---------------------------------------------------------------------------

export interface ScoringCondition {
  field: string;
  operator: 'gt' | 'lt' | 'eq' | 'contains';
  value: string;
}

export type ScoringDecay = 'none' | '7d' | '14d' | '30d' | '90d';

export interface ScoringRule {
  id: string;
  name: string;
  description: string;
  signalType: string;
  weight: number;
  decay: ScoringDecay;
  conditions: ScoringCondition[];
  enabled: boolean;
}

export interface TierThresholds {
  HOT: number;
  WARM: number;
  COLD: number;
}

export interface ScoringConfig {
  rules: ScoringRule[];
  tierThresholds: TierThresholds;
  maxScore: number;
}

export interface ScorePreview {
  accountId: string;
  currentScore: number;
  previewScore: number;
  currentTier: ScoreTier;
  previewTier: ScoreTier;
}

export interface RecomputeResult {
  updated: number;
  config: ScoringConfig;
}

// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

export interface SigscoreOptions {
  /** API key (starts with ds_live_ or ds_test_) */
  apiKey: string;
  /** Base URL of the Sigscore API. Defaults to https://api.sigscore.dev */
  baseUrl?: string;
}
