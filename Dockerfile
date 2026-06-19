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

# Set NODE_ENV=production so Next.js performs production optimizations
ENV NODE_ENV=production

# The build script does everything:
#   1. prisma generate    — generates the Prisma client
#   2. next build          — compiles the Next.js app (output: standalone)
#   3. assemble-standalone — copies public/, prisma/, .env, db/, .next/static/
#      into .next/standalone/ so the runner only needs that one directory.
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

# The assemble-standalone.js script (run during `bun run build`) already copied
# everything needed into .next/standalone/:
#   - server.js (the entry point)
#   - .next/static/ (JS/CSS chunks)
#   - public/ (logos, uploads, etc.)
#   - prisma/ (schema.prisma)
#   - .env (DATABASE_URL + secrets)
#   - db/ (SQLite database file, if present)
#   - node_modules/ (only production deps, bundled by Next.js)
#
# So the runner stage only needs to copy .next/standalone/ — nothing else.
COPY --from=builder /app/.next/standalone ./

# Ensure the db directory exists and is writable (SQLite needs to create
# -wal and -shm files next to the .db file at runtime). If the .env points
# to file:/app/db/custom.db but the db/ dir wasn't copied (fresh deploy
# without an existing database), prisma db push will create it on first run.
RUN mkdir -p /app/db && \
    chown -R nextjs:nodejs /app

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
