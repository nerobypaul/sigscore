# ============================================================
# DevSignal CRM — Multi-stage Production Dockerfile
# ============================================================

# ---- Stage 1: Install production dependencies ----
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

# Install production deps only (no devDependencies)
# Also install prisma CLI as it's needed for generate step
RUN npm ci --omit=dev && \
    npm i prisma --save-dev

# ---- Stage 2: Build TypeScript & generate Prisma client ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy full node_modules (we need devDeps like typescript for build)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy prisma schema first (for layer caching)
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Stage 3: Production runtime ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy Prisma schema + generated client (needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy package.json (needed for metadata)
COPY package.json ./

# Switch to non-root user
USER appuser

EXPOSE 3000

# Health check — hits /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
