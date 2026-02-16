// === Auth ===

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string | null;
  role: string;
  createdAt: string;
  organizations?: UserOrganization[];
}

export interface UserOrganization {
  organizationId: string;
  role: string;
  organization: Organization;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// === Contacts ===

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  title?: string | null;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  linkedIn?: string | null;
  twitter?: string | null;
  github?: string | null;
  notes?: string | null;
  tags?: TagRelation[];
  deals?: Deal[];
  activities?: Activity[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  companyId?: string;
  notes?: string;
}

// === Companies ===

export type CompanySize = 'STARTUP' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE';

export interface Company {
  id: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  size?: CompanySize | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  linkedIn?: string | null;
  twitter?: string | null;
  githubOrg?: string | null;
  description?: string | null;
  tags?: TagRelation[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyPayload {
  name: string;
  domain?: string;
  industry?: string;
  size?: CompanySize;
  website?: string;
  description?: string;
}

// === Deals ===

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

export const DEAL_STAGES: DealStage[] = [
  'ANONYMOUS_USAGE',
  'IDENTIFIED',
  'ACTIVATED',
  'TEAM_ADOPTION',
  'EXPANSION_SIGNAL',
  'SALES_QUALIFIED',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
];

export const STAGE_LABELS: Record<DealStage, string> = {
  ANONYMOUS_USAGE: 'Anonymous Usage',
  IDENTIFIED: 'Identified',
  ACTIVATED: 'Activated',
  TEAM_ADOPTION: 'Team Adoption',
  EXPANSION_SIGNAL: 'Expansion Signal',
  SALES_QUALIFIED: 'Sales Qualified',
  NEGOTIATION: 'Negotiation',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

export const STAGE_COLORS: Record<DealStage, string> = {
  ANONYMOUS_USAGE: 'bg-gray-100 text-gray-700',
  IDENTIFIED: 'bg-blue-100 text-blue-700',
  ACTIVATED: 'bg-indigo-100 text-indigo-700',
  TEAM_ADOPTION: 'bg-purple-100 text-purple-700',
  EXPANSION_SIGNAL: 'bg-yellow-100 text-yellow-700',
  SALES_QUALIFIED: 'bg-orange-100 text-orange-700',
  NEGOTIATION: 'bg-pink-100 text-pink-700',
  CLOSED_WON: 'bg-green-100 text-green-700',
  CLOSED_LOST: 'bg-red-100 text-red-700',
};

export interface Deal {
  id: string;
  title: string;
  amount?: number | null;
  currency: string;
  stage: DealStage;
  probability?: number | null;
  contactId?: string | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  ownerId?: string | null;
  owner?: { id: string; firstName: string; lastName: string } | null;
  expectedCloseDate?: string | null;
  closedAt?: string | null;
  description?: string | null;
  tags?: TagRelation[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDealPayload {
  title: string;
  amount?: number;
  currency?: string;
  stage?: DealStage;
  probability?: number;
  contactId?: string;
  companyId?: string;
  expectedCloseDate?: string;
  description?: string;
}

// === Activities ===

export type ActivityType = 'TASK' | 'CALL' | 'MEETING' | 'EMAIL' | 'NOTE';
export type ActivityStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type ActivityPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string | null;
  status: ActivityStatus;
  priority: ActivityPriority;
  dueDate?: string | null;
  completedAt?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  dealId?: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivityPayload {
  type: ActivityType;
  title: string;
  description?: string;
  status?: ActivityStatus;
  priority?: ActivityPriority;
  dueDate?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

// === Tags ===

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

export interface TagRelation {
  tag: Tag;
}

// === Pagination ===

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// === Signals ===

export type SignalSourceType = 'GITHUB' | 'NPM' | 'WEBSITE' | 'DOCS' | 'PRODUCT_API' | 'SEGMENT' | 'CUSTOM_WEBHOOK';

export interface Signal {
  id: string;
  type: string;
  metadata: Record<string, unknown>;
  timestamp: string;
  anonymousId?: string | null;
  actorId?: string | null;
  accountId?: string | null;
  sourceId: string;
  actor?: { id: string; firstName: string; lastName: string; email?: string } | null;
  account?: { id: string; name: string; domain?: string } | null;
  source?: { id: string; name: string; type: SignalSourceType } | null;
  createdAt: string;
}

// === Account Scores (PQA) ===

export type ScoreTier = 'HOT' | 'WARM' | 'COLD' | 'INACTIVE';
export type ScoreTrend = 'RISING' | 'STABLE' | 'FALLING';

export interface AccountScore {
  id: string;
  accountId: string;
  score: number;
  tier: ScoreTier;
  factors: Array<{ name: string; weight: number; value: number; description: string }>;
  signalCount: number;
  userCount: number;
  lastSignalAt?: string | null;
  trend: ScoreTrend;
  computedAt: string;
  account?: { id: string; name: string; domain?: string } | null;
}

export const TIER_COLORS: Record<ScoreTier, string> = {
  HOT: 'bg-red-100 text-red-700',
  WARM: 'bg-orange-100 text-orange-700',
  COLD: 'bg-blue-100 text-blue-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
};

export const TREND_ICONS: Record<ScoreTrend, string> = {
  RISING: 'arrow-up',
  STABLE: 'minus',
  FALLING: 'arrow-down',
};

// === Score Snapshots ===

export interface ScoreBreakdown {
  userCount: number;
  velocity: number;
  featureBreadth: number;
  engagement: number;
  seniority: number;
  firmographic: number;
}

export interface ScoreSnapshot {
  id: string;
  score: number;
  breakdown: ScoreBreakdown | null;
  capturedAt: string;
}

// === Saved Views ===

export interface SavedView {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  entityType: 'contact' | 'company' | 'deal';
  filters: Record<string, unknown>;
  sortField?: string | null;
  sortDirection?: string | null;
  isShared: boolean;
  isDefault: boolean;
  icon?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
}
