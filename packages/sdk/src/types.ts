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
// Client options
// ---------------------------------------------------------------------------

export interface DevSignalOptions {
  /** API key (starts with ds_live_ or ds_test_) */
  apiKey: string;
  /** Base URL of the DevSignal API. Defaults to https://api.devsignal.dev */
  baseUrl?: string;
}
