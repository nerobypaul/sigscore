# ============================================================
# Sigscore — Unified Multi-stage Production Dockerfile
# ============================================================
# Builds backend (TypeScript) and frontend (Vite) into a single
# production image. The Express server serves both the API and
# the static frontend bundle.
#
# Usage:
#   docker build -t sigscore .
#   docker run -p 3000:3000 --env-file .env sigscore
# ============================================================

# ---- Stage 1: Build the Backend (TypeScript -> JS via tsc) ----
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Copy root workspace files first for layer caching
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
# Stub out frontend workspace so npm ci resolves the lockfile cleanly
COPY frontend/package.json ./frontend/

# Install all deps (including devDependencies needed for tsc)
RUN npm ci --workspace=backend --include-workspace-root

# Copy prisma schema and generate the client
COPY backend/prisma ./backend/prisma
RUN npx prisma generate --schema ./backend/prisma/schema.prisma

# Copy backend source and compile TypeScript
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
RUN npm run build --workspace=backend


# ---- Stage 2: Build the Frontend (Vite) ----
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
# Stub out backend workspace
COPY backend/package.json ./backend/

RUN npm ci --workspace=frontend --include-workspace-root

# Copy frontend source
COPY frontend/ ./frontend/

# Build-time env vars for Vite (baked into the static bundle)
ARG VITE_API_URL=
ARG VITE_STRIPE_PRICE_PRO=
ARG VITE_STRIPE_PRICE_GROWTH=
ARG VITE_STRIPE_PRICE_SCALE=
ARG VITE_SENTRY_DSN=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_STRIPE_PRICE_PRO=${VITE_STRIPE_PRICE_PRO}
ENV VITE_STRIPE_PRICE_GROWTH=${VITE_STRIPE_PRICE_GROWTH}
ENV VITE_STRIPE_PRICE_SCALE=${VITE_STRIPE_PRICE_SCALE}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}

RUN npm run build --workspace=frontend


# ---- Stage 3: Production dependencies only ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install production-only dependencies
RUN npm ci --workspace=backend --include-workspace-root --omit=dev

# Prisma client must be generated against production node_modules
COPY backend/prisma ./backend/prisma
RUN npx prisma generate --schema ./backend/prisma/schema.prisma


# ---- Stage 4: Production runtime ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Install wget for healthcheck + openssl for Prisma
RUN apk add --no-cache wget openssl

# Copy production node_modules (includes Prisma client via hoisting)
COPY --from=deps /app/node_modules ./node_modules

# Copy compiled backend
COPY --from=backend-builder /app/backend/dist ./dist

# Copy Prisma schema + migrations (needed for migrate deploy at startup)
COPY --from=deps /app/backend/prisma ./prisma

# Copy built frontend static files
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy package.json for metadata
COPY backend/package.json ./package.json

# Copy changelog files (read by the changelog API at runtime)
COPY .changelog ./.changelog

# Give appuser ownership of the app directory (needed for Prisma engines)
RUN chown -R appuser:nodejs /app

# Switch to non-root user
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run migrations at startup, then start the app.
# START_CMD env var lets the worker service override the entry point.
# Default: server. Worker sets START_CMD=node dist/worker.js
ENV START_CMD="node dist/server.js"
CMD ["sh", "-c", "npx prisma migrate deploy --schema ./prisma/schema.prisma && $START_CMD"]
