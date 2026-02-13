# ============================================================
# DevSignal CRM Backend — Multi-stage Production Dockerfile
# ============================================================
# Build context must be the monorepo root so the lockfile is available.
# Usage: docker build -f backend/Dockerfile .
# ============================================================

# ---- Stage 1: Build TypeScript & generate Prisma client ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files first for layer caching
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
# Stub out other workspaces so npm ci resolves the lockfile
COPY frontend/package.json ./frontend/

# Install all deps (including devDependencies needed for build)
RUN npm ci --workspace=backend --include-workspace-root

# Copy prisma schema first (for layer caching on generate)
COPY backend/prisma ./backend/prisma
RUN npx --prefix backend prisma generate

# Copy backend source and build
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
RUN npm run build --workspace=backend

# ---- Stage 2: Production dependencies only ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --workspace=backend --include-workspace-root --omit=dev

# Prisma client must be generated against prod node_modules
COPY backend/prisma ./backend/prisma
RUN npx --prefix backend prisma generate

# ---- Stage 3: Production runtime ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy production node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy built application
COPY --from=builder /app/backend/dist ./dist

# Copy Prisma schema + generated client (needed at runtime)
COPY --from=deps /app/backend/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy package.json for metadata
COPY backend/package.json ./

# Switch to non-root user
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
