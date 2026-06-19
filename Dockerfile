# ─────────────────────────────────────────────────────────────────────────────
# ENADE Quiz — Production Dockerfile
# Multi-stage build: install deps → build → slim runtime
# Works on any container platform (Fly.io, Railway, Z.ai, K8s, etc).
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: Install dependencies ───────────────────────────────────────────
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy lockfile + package.json first for better layer caching
COPY package.json bun.lock* ./
COPY prisma ./prisma

# Install with frozen lockfile (reproducible)
RUN bun install --frozen-lockfile

# Generate Prisma Client (needs schema)
RUN bunx prisma generate

# ─── Stage 2: Build the Next.js app ──────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env vars (no secrets)
ENV DATABASE_URL="file:./db/custom.db" \
    NEXT_TELEMETRY_DISABLED="1" \
    NODE_ENV="production"

# Build the production bundle
RUN bun run build

# ─── Stage 3: Production runtime (slim) ──────────────────────────────────────
FROM oven/bun:1 AS runner
WORKDIR /app

# Set production env
ENV NODE_ENV="production" \
    NEXT_TELEMETRY_DISABLED="1" \
    PORT="3000" \
    HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/db ./db
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

# Create writable db directory (SQLite needs to write here at runtime)
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Switch to non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Health check — fails fast if the app is wedged
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the production server
CMD ["bun", "run", "start"]
