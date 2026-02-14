import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'DevSignal API',
      version: '0.2.0',
      description:
        'Developer Pipeline Intelligence platform for DevTool companies. Provides core operations (contacts, companies, deals, activities), a signal engine for product-led growth analytics, PQA scoring, webhook delivery, and API key management.',
      contact: {
        name: 'DevSignal Team',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: '/api/v1',
        description: 'API v1',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT access token obtained from POST /auth/login',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key with ds_live_ prefix. Created via POST /api-keys.',
        },
      },
      parameters: {
        OrganizationId: {
          in: 'header',
          name: 'X-Organization-Id',
          required: true,
          schema: { type: 'string' },
          description: 'Organization context for multi-tenant isolation',
        },
        PageParam: {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
          description: 'Page number (1-indexed)',
        },
        LimitParam: {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Items per page (max 100)',
        },
      },
      schemas: {
        // ---- Shared ----
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
          required: ['error'],
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Validation error' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  path: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },

        // ---- Auth ----
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['ADMIN', 'USER', 'VIEWER'] },
            avatar: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuthTokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },

        // ---- Contacts ----
        Contact: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', nullable: true },
            mobile: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
            address: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            state: { type: 'string', nullable: true },
            postalCode: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true },
            linkedIn: { type: 'string', nullable: true },
            twitter: { type: 'string', nullable: true },
            github: { type: 'string', nullable: true },
            companyId: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            customFields: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateContactRequest: {
          type: 'object',
          required: ['firstName', 'lastName'],
          properties: {
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            mobile: { type: 'string' },
            title: { type: 'string' },
            companyId: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
            linkedIn: { type: 'string', format: 'uri' },
            twitter: { type: 'string' },
            github: { type: 'string' },
            notes: { type: 'string' },
          },
        },
        UpdateContactRequest: {
          type: 'object',
          properties: {
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            mobile: { type: 'string' },
            title: { type: 'string' },
            companyId: { type: 'string' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
            linkedIn: { type: 'string', format: 'uri' },
            twitter: { type: 'string' },
            github: { type: 'string' },
            notes: { type: 'string' },
          },
        },

        // ---- Companies ----
        Company: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            name: { type: 'string' },
            domain: { type: 'string', nullable: true },
            industry: { type: 'string', nullable: true },
            size: {
              type: 'string',
              enum: ['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'],
              nullable: true,
            },
            logo: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', nullable: true },
            website: { type: 'string', format: 'uri', nullable: true },
            address: { type: 'string', nullable: true },
            city: { type: 'string', nullable: true },
            state: { type: 'string', nullable: true },
            postalCode: { type: 'string', nullable: true },
            country: { type: 'string', nullable: true },
            linkedIn: { type: 'string', nullable: true },
            twitter: { type: 'string', nullable: true },
            githubOrg: { type: 'string', nullable: true },
            description: { type: 'string', nullable: true },
            customFields: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateCompanyRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1 },
            domain: { type: 'string' },
            industry: { type: 'string' },
            size: { type: 'string', enum: ['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'] },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            website: { type: 'string', format: 'uri' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
            linkedIn: { type: 'string', format: 'uri' },
            twitter: { type: 'string' },
            githubOrg: { type: 'string' },
            description: { type: 'string' },
          },
        },
        UpdateCompanyRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            domain: { type: 'string' },
            industry: { type: 'string' },
            size: { type: 'string', enum: ['STARTUP', 'SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE'] },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            website: { type: 'string', format: 'uri' },
            address: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postalCode: { type: 'string' },
            country: { type: 'string' },
            linkedIn: { type: 'string', format: 'uri' },
            twitter: { type: 'string' },
            githubOrg: { type: 'string' },
            description: { type: 'string' },
          },
        },

        // ---- Deals ----
        Deal: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            title: { type: 'string' },
            amount: { type: 'number', nullable: true },
            currency: { type: 'string' },
            stage: {
              type: 'string',
              enum: [
                'ANONYMOUS_USAGE', 'IDENTIFIED', 'ACTIVATED', 'TEAM_ADOPTION',
                'EXPANSION_SIGNAL', 'SALES_QUALIFIED', 'NEGOTIATION',
                'CLOSED_WON', 'CLOSED_LOST',
              ],
            },
            probability: { type: 'integer', nullable: true, minimum: 0, maximum: 100 },
            contactId: { type: 'string', nullable: true },
            companyId: { type: 'string', nullable: true },
            ownerId: { type: 'string', nullable: true },
            expectedCloseDate: { type: 'string', format: 'date-time', nullable: true },
            closedAt: { type: 'string', format: 'date-time', nullable: true },
            description: { type: 'string', nullable: true },
            customFields: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateDealRequest: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1 },
            amount: { type: 'number' },
            currency: { type: 'string', default: 'USD' },
            stage: {
              type: 'string',
              enum: [
                'ANONYMOUS_USAGE', 'IDENTIFIED', 'ACTIVATED', 'TEAM_ADOPTION',
                'EXPANSION_SIGNAL', 'SALES_QUALIFIED', 'NEGOTIATION',
                'CLOSED_WON', 'CLOSED_LOST',
              ],
              default: 'ANONYMOUS_USAGE',
            },
            probability: { type: 'integer', minimum: 0, maximum: 100 },
            contactId: { type: 'string' },
            companyId: { type: 'string' },
            ownerId: { type: 'string' },
            expectedCloseDate: { type: 'string', format: 'date-time' },
            description: { type: 'string' },
          },
        },
        UpdateDealRequest: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1 },
            amount: { type: 'number' },
            currency: { type: 'string' },
            stage: {
              type: 'string',
              enum: [
                'ANONYMOUS_USAGE', 'IDENTIFIED', 'ACTIVATED', 'TEAM_ADOPTION',
                'EXPANSION_SIGNAL', 'SALES_QUALIFIED', 'NEGOTIATION',
                'CLOSED_WON', 'CLOSED_LOST',
              ],
            },
            probability: { type: 'integer', minimum: 0, maximum: 100 },
            contactId: { type: 'string' },
            companyId: { type: 'string' },
            ownerId: { type: 'string' },
            expectedCloseDate: { type: 'string', format: 'date-time' },
            closedAt: { type: 'string', format: 'date-time' },
            description: { type: 'string' },
          },
        },

        // ---- Activities ----
        Activity: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            type: { type: 'string', enum: ['TASK', 'CALL', 'MEETING', 'EMAIL', 'NOTE'] },
            title: { type: 'string' },
            description: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            dueDate: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            userId: { type: 'string' },
            contactId: { type: 'string', nullable: true },
            companyId: { type: 'string', nullable: true },
            dealId: { type: 'string', nullable: true },
            customFields: { type: 'object', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateActivityRequest: {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: { type: 'string', enum: ['TASK', 'CALL', 'MEETING', 'EMAIL', 'NOTE'] },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'PENDING' },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
            dueDate: { type: 'string', format: 'date-time' },
            contactId: { type: 'string' },
            companyId: { type: 'string' },
            dealId: { type: 'string' },
          },
        },
        UpdateActivityRequest: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['TASK', 'CALL', 'MEETING', 'EMAIL', 'NOTE'] },
            title: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
            dueDate: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' },
            contactId: { type: 'string' },
            companyId: { type: 'string' },
            dealId: { type: 'string' },
          },
        },

        // ---- API Keys ----
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            name: { type: 'string' },
            keyPrefix: { type: 'string', description: 'First 12 characters of the key for identification' },
            scopes: { type: 'array', items: { type: 'string' } },
            lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        CreateApiKeyRequest: {
          type: 'object',
          required: ['name', 'scopes'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            scopes: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
              description: 'Scopes the key grants access to, e.g. ["signals:write", "accounts:read"]',
            },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },

        // ---- Signals ----
        Signal: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            sourceId: { type: 'string' },
            type: { type: 'string', description: 'Signal type, e.g. repo_clone, package_install, page_view' },
            actorId: { type: 'string', nullable: true },
            accountId: { type: 'string', nullable: true },
            anonymousId: { type: 'string', nullable: true },
            metadata: { type: 'object', additionalProperties: true },
            idempotencyKey: { type: 'string', nullable: true },
            timestamp: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            source: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                type: { type: 'string' },
              },
            },
            actor: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                email: { type: 'string' },
              },
            },
            account: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                domain: { type: 'string' },
              },
            },
          },
        },
        IngestSignalRequest: {
          type: 'object',
          required: ['sourceId', 'type'],
          properties: {
            sourceId: { type: 'string', minLength: 1 },
            type: { type: 'string', minLength: 1, description: 'Signal type, e.g. repo_clone, page_view' },
            actorId: { type: 'string' },
            accountId: { type: 'string' },
            anonymousId: { type: 'string' },
            metadata: { type: 'object', additionalProperties: true, default: {} },
            idempotencyKey: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        IngestSignalBatchRequest: {
          type: 'object',
          required: ['signals'],
          properties: {
            signals: {
              type: 'array',
              items: { $ref: '#/components/schemas/IngestSignalRequest' },
              minItems: 1,
              maxItems: 1000,
            },
          },
        },
        BatchIngestResult: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  signal: { $ref: '#/components/schemas/Signal' },
                  error: { type: 'string' },
                  input: { $ref: '#/components/schemas/IngestSignalRequest' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                succeeded: { type: 'integer' },
                failed: { type: 'integer' },
              },
            },
          },
        },

        // ---- Account Score ----
        AccountScore: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            organizationId: { type: 'string' },
            accountId: { type: 'string' },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            tier: { type: 'string', enum: ['HOT', 'WARM', 'COLD', 'INACTIVE'] },
            factors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  weight: { type: 'number' },
                  value: { type: 'number' },
                  description: { type: 'string' },
                },
              },
            },
            signalCount: { type: 'integer' },
            userCount: { type: 'integer' },
            lastSignalAt: { type: 'string', format: 'date-time', nullable: true },
            trend: { type: 'string', enum: ['RISING', 'STABLE', 'FALLING'] },
            computedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            account: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                domain: { type: 'string' },
              },
            },
          },
        },

        // ---- Signal Sources ----
        SignalSource: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: ['GITHUB', 'NPM', 'WEBSITE', 'DOCS', 'PRODUCT_API', 'SEGMENT', 'CUSTOM_WEBHOOK'],
            },
            name: { type: 'string' },
            config: { type: 'object', additionalProperties: true },
            status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ERROR'] },
            lastSyncAt: { type: 'string', format: 'date-time', nullable: true },
            errorMessage: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            _count: {
              type: 'object',
              properties: {
                signals: { type: 'integer' },
              },
            },
          },
        },
        CreateSignalSourceRequest: {
          type: 'object',
          required: ['type', 'name', 'config'],
          properties: {
            type: {
              type: 'string',
              enum: ['GITHUB', 'NPM', 'WEBSITE', 'DOCS', 'PRODUCT_API', 'SEGMENT', 'CUSTOM_WEBHOOK'],
            },
            name: { type: 'string', minLength: 1 },
            config: { type: 'object', additionalProperties: true, description: 'Source-specific configuration (API keys, repo lists, endpoint URLs)' },
          },
        },
        UpdateSignalSourceRequest: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1 },
            config: { type: 'object', additionalProperties: true },
            status: { type: 'string', enum: ['ACTIVE', 'PAUSED', 'ERROR'] },
          },
        },

        // ---- Webhooks ----
        WebhookEndpoint: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            secret: { type: 'string', description: 'HMAC-SHA256 signing secret' },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        WebhookEndpointListItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            active: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            _count: {
              type: 'object',
              properties: {
                deliveries: { type: 'integer' },
              },
            },
          },
        },
        CreateWebhookRequest: {
          type: 'object',
          required: ['url', 'events'],
          properties: {
            url: { type: 'string', format: 'uri', description: 'Must be an HTTPS URL pointing to a public endpoint' },
            events: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Event types to subscribe to, e.g. ["signal.received"]',
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication and user management' },
      { name: 'Contacts', description: 'Contact management' },
      { name: 'Companies', description: 'Company/account management' },
      { name: 'Deals', description: 'PLG-native deal pipeline management' },
      { name: 'Activities', description: 'Tasks, calls, meetings, emails, and notes' },
      { name: 'API Keys', description: 'API key creation and management (JWT auth only)' },
      { name: 'Signals', description: 'Signal ingestion and querying' },
      { name: 'Signal Sources', description: 'Signal source configuration' },
      { name: 'Webhooks', description: 'Outbound webhook endpoint management' },
    ],
  },
  apis: [path.join(__dirname, '../routes/*.ts')],
};

export const swaggerSpec = swaggerJsdoc(options);
