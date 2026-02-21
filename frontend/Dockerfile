# ============================================================
# Sigscore CRM Frontend — Multi-stage Production Dockerfile
# ============================================================
# Build context must be the monorepo root so the lockfile is available.
# Usage: docker build -f frontend/Dockerfile .
# ============================================================

# ---- Stage 1: Build the React SPA ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files for lockfile resolution
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
# Stub out backend workspace so npm ci resolves cleanly
COPY backend/package.json ./backend/

RUN npm ci --workspace=frontend --include-workspace-root

# Copy frontend source
COPY frontend/ ./frontend/

# Build-time env vars for Vite (baked into the static bundle)
ARG VITE_API_URL=http://localhost:3001
ARG VITE_STRIPE_PRICE_PRO=
ARG VITE_STRIPE_PRICE_GROWTH=
ARG VITE_STRIPE_PRICE_SCALE=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_STRIPE_PRICE_PRO=${VITE_STRIPE_PRICE_PRO}
ENV VITE_STRIPE_PRICE_GROWTH=${VITE_STRIPE_PRICE_GROWTH}
ENV VITE_STRIPE_PRICE_SCALE=${VITE_STRIPE_PRICE_SCALE}

RUN npm run build --workspace=frontend

# ---- Stage 2: Serve with nginx ----
FROM nginx:alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Add SPA-friendly nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
