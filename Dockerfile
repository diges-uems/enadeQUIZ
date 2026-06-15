# =============================================================================
# Dockerfile — Next.js 16 Standalone + Prisma (SQLite) + Bun
# =============================================================================
# Multi-stage build optimized for minimal production image.
# Standalone output means the runner only needs node + the bundled server,
# not the full node_modules tree.
#
# Image targets:
#   Stage 1 (deps):    Install all dependencies with Bun
#   Stage 2 (builder): Build the Next.js app, generate Prisma client
#   Stage 3 (runner):  Minimal Alpine image with only runtime artifacts
# =============================================================================

# ── OCI Labels ────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="enade-quiz"
LABEL org.opencontainers.image.description="ENADE Quiz — Next.js 16 standalone production image"
LABEL org.opencontainers.image.source="https://github.com/uems/enade-quiz"
LABEL org.opencontainers.image.vendor="UEMS"

# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy lockfile + manifest first for better layer caching
COPY package.json bun.lock ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for the build stage)
# --frozen-lockfile ensures reproducible builds
RUN bun install --frozen-lockfile

# ── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (needed at build time for type checking and runtime)
RUN bunx prisma generate

# Set NODE_ENV=production so Next.js performs production optimizations
ENV NODE_ENV=production

# Build the Next.js app.
# The project's build script already handles:
#   next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
# But we do it explicitly here for clarity and robustness.
RUN bun run build

# Verify the standalone output exists
RUN ls -la .next/standalone/server.js || (echo "ERROR: standalone server.js not found" && exit 1)

# ── Stage 3: Runner ──────────────────────────────────────────────────────────
# Use Node.js Alpine — the standalone output requires Node.js, not Bun.
# Alpine keeps the image under 200MB.
FROM node:22-alpine AS runner

WORKDIR /app

# Install openssl — required by Prisma's SQLite engine (better-sqlite3 uses native bindings)
# Also add curl for the healthcheck. Clean up apk cache to minimize size.
RUN apk add --no-cache openssl curl

# Run as non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production

# Next.js standalone server binds to 0.0.0.0 in newer versions,
# but set it explicitly for older versions / safety.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy standalone server (includes node_modules needed at runtime)
COPY --from=builder /app/.next/standalone ./

# Copy static assets (not included in standalone by default)
COPY --from=builder /app/.next/static ./.next/static

# Copy public directory (static files served by Next.js)
COPY --from=builder /app/public ./public

# Copy Prisma schema + generated client (needed for SQLite queries at runtime)
# The Prisma client was generated in node_modules during builder stage
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Create uploads directory and set ownership
RUN mkdir -p /app/public/uploads && \
    chown -R nextjs:nodejs /app/public/uploads

# Ensure all files are owned by the non-root user
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Healthcheck: confirm the Next.js server is responding
# --fail makes curl return non-zero on HTTP errors (4xx/5xx)
# --silent --show-error suppresses progress but shows errors
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail --silent --show-error http://localhost:3000/ || exit 1

# The standalone entry point — this is the minimal Node.js server
# that Next.js generates with output: 'standalone'
CMD ["node", "server.js"]
