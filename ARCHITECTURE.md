# Headless CRM - System Architecture

## Overview

A modern, API-first CRM system built with scalability and flexibility in mind. Designed to be headless, allowing any frontend to consume the APIs.

## Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Authentication**: JWT + OAuth 2.0 (Google, GitHub)
- **API Documentation**: OpenAPI 3.0 (Swagger)
- **Validation**: Zod

### Frontend (Admin UI)
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: TailwindCSS
- **State Management**: TanStack Query
- **Routing**: React Router v6

### DevOps
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **IaC**: Terraform (AWS)
- **Testing**: Jest + Supertest (Backend), Vitest + Testing Library (Frontend)

## System Components

### 1. API Server (`/backend`)
- RESTful API following OpenAPI 3.0 spec
- JWT-based authentication with refresh tokens
- OAuth 2.0 integration (Google, GitHub)
- Role-based access control (RBAC)
- Rate limiting and security middleware
- Structured logging

### 2. Database Layer
PostgreSQL schema with the following core entities:
- **Users**: System users with authentication
- **Organizations**: Multi-tenancy support
- **Contacts**: Individual people in the CRM
- **Companies**: Organizations/businesses
- **Deals**: Sales opportunities with pipeline stages
- **Activities**: Tasks, calls, meetings, notes
- **Tags**: Flexible categorization
- **Custom Fields**: Extensible data model

### 3. Admin UI (`/frontend`)
- Dashboard with key metrics
- Contact & company management
- Deal pipeline visualization
- Activity tracking
- User management
- API documentation viewer

## Architecture Patterns

### API-First Design
- All functionality exposed via REST APIs
- Comprehensive OpenAPI documentation
- Versioned endpoints (`/api/v1/...`)
- Consistent error handling and response formats

### Multi-Tenancy
- Organization-based data isolation
- Row-level security in database
- User-organization associations

### Security
- Password hashing with bcrypt
- JWT access tokens (15min) + refresh tokens (7 days)
- OAuth 2.0 for social login
- CORS configuration
- Helmet.js security headers
- Rate limiting per IP/user

### Scalability
- Stateless API server (horizontal scaling)
- Database connection pooling
- Redis-ready for caching/sessions (optional)
- Containerized deployment

## Data Model

```
Organizations
  ├── Users (many-to-many)
  ├── Contacts
  ├── Companies
  ├── Deals
  │   └── Activities
  └── Tags

Users
  ├── Organizations (many-to-many)
  ├── Activities (created by)
  └── Deals (assigned to)
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login with email/password
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/oauth/:provider` - OAuth login
- `POST /api/v1/auth/logout` - Logout

### Contacts
- `GET /api/v1/contacts` - List contacts (paginated)
- `POST /api/v1/contacts` - Create contact
- `GET /api/v1/contacts/:id` - Get contact
- `PUT /api/v1/contacts/:id` - Update contact
- `DELETE /api/v1/contacts/:id` - Delete contact

### Companies
- `GET /api/v1/companies` - List companies
- `POST /api/v1/companies` - Create company
- `GET /api/v1/companies/:id` - Get company
- `PUT /api/v1/companies/:id` - Update company
- `DELETE /api/v1/companies/:id` - Delete company

### Deals
- `GET /api/v1/deals` - List deals
- `POST /api/v1/deals` - Create deal
- `GET /api/v1/deals/:id` - Get deal
- `PUT /api/v1/deals/:id` - Update deal
- `DELETE /api/v1/deals/:id` - Delete deal

### Activities
- `GET /api/v1/activities` - List activities
- `POST /api/v1/activities` - Create activity
- `GET /api/v1/activities/:id` - Get activity
- `PUT /api/v1/activities/:id` - Update activity
- `DELETE /api/v1/activities/:id` - Delete activity

## Deployment

### Local Development
```bash
docker-compose up -d
npm install
npm run dev
```

### Production (AWS)
- **Compute**: ECS Fargate for API containers
- **Database**: RDS PostgreSQL with Multi-AZ
- **Load Balancer**: Application Load Balancer
- **DNS**: Route53
- **SSL**: ACM certificates
- **Monitoring**: CloudWatch

## Environment Configuration

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for JWT signing
- `JWT_REFRESH_SECRET`: Secret for refresh tokens
- `OAUTH_GOOGLE_CLIENT_ID/SECRET`: Google OAuth
- `OAUTH_GITHUB_CLIENT_ID/SECRET`: GitHub OAuth
- `NODE_ENV`: Environment (development/production)
- `PORT`: API server port

## Future Enhancements

- GraphQL API alongside REST
- Real-time notifications (WebSockets)
- Email integration (SMTP/SendGrid)
- Calendar sync (Google Calendar)
- File attachments (S3)
- Advanced analytics and reporting
- Workflow automation
- Mobile apps (React Native)
