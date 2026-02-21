# Contributing to DevSignal

Thanks for your interest in contributing to DevSignal! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 18
- Docker and Docker Compose (for PostgreSQL + Redis)
- npm (comes with Node.js)

### Local Development

```bash
# Clone the repo
git clone https://github.com/nerobypaul/headless-crm.git
cd headless-crm

# Install dependencies (all workspaces)
npm install

# Start PostgreSQL + Redis
docker-compose up -d

# Copy environment variables
cp .env.example .env

# Run database migrations
cd backend && npx prisma migrate dev && cd ..

# Start backend (port 3000)
npm run dev --workspace=backend

# Start frontend (port 5173) in another terminal
npm run dev --workspace=frontend
```

### Project Structure

```
backend/          Express API + Prisma + BullMQ workers
frontend/         React 18 + Vite + TailwindCSS
packages/sdk/     @devsignal/node SDK (zero dependencies)
e2e/              Playwright end-to-end tests
```

## Making Changes

### Branch Naming

- `feat/description` for new features
- `fix/description` for bug fixes
- `refactor/description` for refactoring

### Code Style

- TypeScript strict mode in both `backend/` and `frontend/`
- Use `import type` for type-only imports
- Prefix unused parameters with `_` (e.g., `_req`)
- Frontend charts use pure SVG/CSS (no charting libraries)

### Testing

```bash
# Backend unit tests
npm test --workspace=backend

# Frontend build check
npm run build --workspace=frontend

# TypeScript type checking
npx tsc --noEmit --project backend/tsconfig.json
npx tsc --noEmit --project frontend/tsconfig.json

# E2E tests (requires running app)
npx playwright test
```

### Pull Request Process

1. Fork the repo and create your branch from `main`
2. Make your changes with clear, atomic commits
3. Ensure TypeScript builds pass with zero errors
4. Add tests for new functionality
5. Update the changelog in `.changelog/YYYY-MM-DD.md`
6. Open a PR with a clear title and description

### PR Description Template

```
## Summary
- What changed and why

## Test Plan
- How to verify the changes work
```

## Architecture Notes

- **Multi-tenancy:** Every database query must include `organizationId`
- **Auth:** JWT + refresh tokens, org context via `X-Organization-Id` header
- **Error handling:** Use the `AppError` class for operational errors
- **Background jobs:** BullMQ with 20 queues, processed in `backend/src/worker.ts`
- **GraphQL:** Apollo Server with DataLoader pattern for N+1 prevention

## Reporting Issues

- Use [GitHub Issues](https://github.com/nerobypaul/headless-crm/issues)
- Include steps to reproduce, expected vs actual behavior
- For security issues, email paul@devsignal.dev directly

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
