import gql from 'graphql-tag';

const typeDefs = gql`
  # ============================================================
  # ENUMS
  # ============================================================

  enum DealStage {
    ANONYMOUS_USAGE
    IDENTIFIED
    ACTIVATED
    TEAM_ADOPTION
    EXPANSION_SIGNAL
    SALES_QUALIFIED
    NEGOTIATION
    CLOSED_WON
    CLOSED_LOST
  }

  enum CompanySize {
    STARTUP
    SMALL
    MEDIUM
    LARGE
    ENTERPRISE
  }

  enum ScoreTier {
    HOT
    WARM
    COLD
    INACTIVE
  }

  enum ScoreTrend {
    RISING
    STABLE
    FALLING
  }

  enum ActivityType {
    TASK
    CALL
    MEETING
    EMAIL
    NOTE
  }

  enum ActivityStatus {
    PENDING
    IN_PROGRESS
    COMPLETED
    CANCELLED
  }

  enum Priority {
    LOW
    MEDIUM
    HIGH
    URGENT
  }

  enum SignalSourceType {
    GITHUB
    NPM
    WEBSITE
    DOCS
    PRODUCT_API
    SEGMENT
    CUSTOM_WEBHOOK
  }

  enum SignalSourceStatus {
    ACTIVE
    PAUSED
    ERROR
  }

  enum IdentityType {
    EMAIL
    GITHUB
    NPM
    TWITTER
    LINKEDIN
    IP
    DOMAIN
  }

  enum UserRole {
    ADMIN
    USER
    VIEWER
  }

  # ============================================================
  # CORE TYPES
  # ============================================================

  type User {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    avatar: String
    role: UserRole!
    createdAt: String!
    updatedAt: String!
    lastLoginAt: String
  }

  """
  Account maps to Company in the database.
  Renamed for API clarity in a developer-tools CRM context.
  """
  type Account {
    id: ID!
    name: String!
    domain: String
    industry: String
    size: CompanySize
    logo: String
    email: String
    phone: String
    website: String
    address: String
    city: String
    state: String
    postalCode: String
    country: String
    linkedIn: String
    twitter: String
    githubOrg: String
    description: String
    customFields: JSON
    createdAt: String!
    updatedAt: String!

    # Resolved relations
    contacts: [Contact!]!
    deals: [Deal!]!
    signals: [Signal!]!
    score: AccountScore
    brief: AccountBrief
  }

  type Contact {
    id: ID!
    firstName: String!
    lastName: String!
    email: String
    phone: String
    mobile: String
    title: String
    avatar: String
    address: String
    city: String
    state: String
    postalCode: String
    country: String
    linkedIn: String
    twitter: String
    github: String
    notes: String
    customFields: JSON
    createdAt: String!
    updatedAt: String!

    # Resolved relations
    company: Account
    identities: [ContactIdentity!]!
    signals: [Signal!]!
  }

  type Deal {
    id: ID!
    title: String!
    amount: Float
    currency: String!
    stage: DealStage!
    probability: Int
    expectedCloseDate: String
    closedAt: String
    description: String
    customFields: JSON
    createdAt: String!
    updatedAt: String!

    # Resolved relations
    contact: Contact
    company: Account
    owner: User
  }

  type Signal {
    id: ID!
    type: String!
    metadata: JSON!
    timestamp: String!
    anonymousId: String
    createdAt: String!

    # Resolved relations
    actor: Contact
    account: Account
    source: SignalSource
  }

  type AccountScore {
    id: ID!
    score: Int!
    tier: ScoreTier!
    factors: JSON!
    signalCount: Int!
    userCount: Int!
    lastSignalAt: String
    trend: ScoreTrend!
    computedAt: String!
    createdAt: String!
    updatedAt: String!

    # Resolved relation
    account: Account
  }

  type Activity {
    id: ID!
    type: ActivityType!
    title: String!
    description: String
    status: ActivityStatus!
    priority: Priority!
    dueDate: String
    completedAt: String
    customFields: JSON
    createdAt: String!
    updatedAt: String!

    # Resolved relations
    user: User
    contact: Contact
    company: Account
    deal: Deal
  }

  type SignalSource {
    id: ID!
    type: SignalSourceType!
    name: String!
    status: SignalSourceStatus!
    lastSyncAt: String
    errorMessage: String
    createdAt: String!
    updatedAt: String!
  }

  type ContactIdentity {
    id: ID!
    type: IdentityType!
    value: String!
    verified: Boolean!
    confidence: Float!
    createdAt: String!
  }

  type AccountBrief {
    id: ID!
    content: String!
    generatedAt: String!
    validUntil: String!
    promptTokens: Int
    outputTokens: Int
    createdAt: String!
  }

  # ============================================================
  # PAGINATION (Connection types)
  # ============================================================

  type AccountConnection {
    items: [Account!]!
    total: Int!
    page: Int!
    totalPages: Int!
  }

  type ContactConnection {
    items: [Contact!]!
    total: Int!
    page: Int!
    totalPages: Int!
  }

  type DealConnection {
    items: [Deal!]!
    total: Int!
    page: Int!
    totalPages: Int!
  }

  type SignalConnection {
    items: [Signal!]!
    total: Int!
    page: Int!
    totalPages: Int!
  }

  # ============================================================
  # SCALARS
  # ============================================================

  scalar JSON

  # ============================================================
  # QUERIES
  # ============================================================

  type Query {
    # Accounts (Companies)
    accounts(page: Int, limit: Int, search: String): AccountConnection!
    account(id: ID!): Account

    # Contacts
    contacts(page: Int, limit: Int, search: String, companyId: ID): ContactConnection!
    contact(id: ID!): Contact

    # Deals
    deals(page: Int, limit: Int, stage: DealStage, companyId: ID): DealConnection!
    deal(id: ID!): Deal

    # Signals
    signals(page: Int, limit: Int, type: String, accountId: ID, from: String, to: String): SignalConnection!

    # Scoring
    topAccounts(limit: Int, tier: ScoreTier): [AccountScore!]!

    # Signal Sources
    signalSources: [SignalSource!]!
  }
`;

export default typeDefs;
