#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UEMS Votação — one-shot production deploy script
# --------------------------------------------------------------------------
# Idempotent: safe to re-run. Performs (in order):
#   1. Required-tools check      (bun, node, git)
#   2. Clone OR pull the repo    (DEPLOY_REPO env var or in-place if no repo)
#   3. .env presence check       (copy from .env.example if missing)
#   4. bun install               (full install — devDeps needed for build)
#   5. prisma generate + db push (creates/migrates the SQLite schema)
#   6. next build + assemble     (standalone bundle with public/ + prisma/)
#   7. pm2 reload                (zero-downtime restart of all 3 services)
#   8. pm2 status                (so the operator sees the result)
#
# Default deploy target: /var/www/uems-votacao (override with DEPLOY_DIR)
# Default repo URL:      $DEPLOY_REPO          (or skip clone if empty)
#
# Typical first run:
#   sudo DEPLOY_REPO=https://github.com/org/uems-votacao.git \
#        bash /var/www/uems-votacao/deploy/deploy.sh
#
# Typical update run (from inside the project):
#   sudo bash deploy/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/uems-votacao}"
DEPLOY_REPO="${DEPLOY_REPO:-}"
NODE_MEMORY_LIMIT="${NODE_MEMORY_LIMIT:-2048}"   # MB — bump if OOM during build
PM2_APP_FILE="${PM2_APP_FILE:-ecosystem.config.cjs}"

# Pretty logging
log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m    %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m  %s\n' "$*"; }
err()  { printf '\033[1;31m[err]\033[0m  %s\n' "$*" >&2; }

# ── 1. Required tools ───────────────────────────────────────────────────────
log "Checking required tools…"
missing=0
for cmd in bun node npm git; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd → $(command -v "$cmd")"
  else
    err "missing required tool: $cmd"
    missing=1
  fi
done
# pm2 and caddy are needed at runtime but not strictly for build
for cmd in pm2 caddy; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd → $(command -v "$cmd")"
  else
    warn "$cmd not found — install before starting services (see deploy/DEPLOY.md)"
  fi
done
if [[ "$missing" -ne 0 ]]; then
  err "One or more required tools are missing. Aborting."
  exit 1
fi

# ── 2. Clone or update the repo ─────────────────────────────────────────────
log "Deploy target: $DEPLOY_DIR"
if [[ -n "$DEPLOY_REPO" && ! -d "$DEPLOY_DIR/.git" ]]; then
  log "Cloning $DEPLOY_REPO → $DEPLOY_DIR"
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  git clone --depth 1 "$DEPLOY_REPO" "$DEPLOY_DIR"
elif [[ -d "$DEPLOY_DIR/.git" ]]; then
  log "Updating existing checkout…"
  cd "$DEPLOY_DIR"
  git fetch --prune --depth 1 origin
  # Preserve local changes to .env, ecosystem.config.cjs, etc. by stashing.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    warn "Local changes detected — stashing before pull."
    git stash push -u -m "auto-stash by deploy.sh $(date -u +%FT%TZ)"
  fi
  git pull --ff-only || warn "Pull failed (maybe diverged) — continuing with current tree."
else
  warn "No .git directory and no DEPLOY_REPO set — assuming in-place deploy."
fi

cd "$DEPLOY_DIR"

# ── 3. .env presence check ──────────────────────────────────────────────────
if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
  if [[ -f "$DEPLOY_DIR/.env.example" ]]; then
    warn ".env missing — copying .env.example (EDIT IT before going live!)"
    cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
    err "STOP: .env was just created from the template. Edit it to set strong"
    err "      ADMIN_SECRET_KEY and PRESENTER_KEY, then re-run this script."
    exit 1
  else
    err ".env not found and no .env.example template available. Aborting."
    exit 1
  fi
fi

# ── 4. Install dependencies (FULL — devDeps needed for build) ───────────────
log "Installing dependencies (bun install)…"
# We need the FULL dependency tree (including devDependencies like `next`,
# `prisma`, `typescript`) because the build step runs `next build` and
# `prisma generate`. Using --production here would drop those and break
# the build. The standalone bundle produced by `next build` only ships
# the production deps anyway, so the final runtime is still lean.
bun install

# Sanity-check: next CLI must be available for the build.
if ! command -v next >/dev/null 2>&1 && [[ ! -x "$DEPLOY_DIR/node_modules/.bin/next" ]]; then
  err "next CLI still missing after bun install — cannot build."
  err "Try: rm -rf node_modules && bun install"
  exit 1
fi
ok "next CLI available"

# ── 5. Prisma: generate + push schema ───────────────────────────────────────
log "Generating Prisma client…"
bunx prisma generate

log "Pushing schema to SQLite (prisma db push)…"
bun run db:push

# ── 6. Build Next.js (standalone) + assemble bundle ─────────────────────────
log "Building Next.js (NODE_OPTIONS=--max-old-space-size=${NODE_MEMORY_LIMIT})…"
NODE_OPTIONS="--max-old-space-size=${NODE_MEMORY_LIMIT}" \
  bunx next build

# Assemble the standalone bundle (copies public/, prisma/, .next/static, .env)
log "Assembling standalone bundle…"
node "$DEPLOY_DIR/scripts/assemble-standalone.js"

STANDALONE_DIR="$DEPLOY_DIR/.next/standalone"
if [[ ! -f "$STANDALONE_DIR/server.js" ]]; then
  err "Build failed: $STANDALONE_DIR/server.js not found."
  err "Verify that next.config.ts has output: 'standalone'."
  exit 1
fi

ok "Standalone bundle ready at $STANDALONE_DIR"

# ── 7. (Re)start PM2 services ───────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  err "pm2 is not installed — skipping service start."
  err "Install with: sudo npm install -g pm2"
  err "Then run:     DEPLOY_DIR=$DEPLOY_DIR pm2 start $DEPLOY_DIR/$PM2_APP_FILE"
  exit 1
fi

log "(Re)starting PM2 services from $PM2_APP_FILE (DEPLOY_DIR=$DEPLOY_DIR)…"
export DEPLOY_DIR  # ecosystem.config.cjs reads this env var for cwd
if pm2 describe uems-next >/dev/null 2>&1; then
  pm2 reload "$DEPLOY_DIR/$PM2_APP_FILE" --update-env
else
  pm2 start "$DEPLOY_DIR/$PM2_APP_FILE"
fi

# Persist process list so it survives reboots (requires `pm2 startup` once).
pm2 save >/dev/null 2>&1 || warn "pm2 save failed — process list won't persist across reboots."

# ── 8. Status report ────────────────────────────────────────────────────────
log "PM2 status:"
pm2 list

ok "Deploy complete. Tail logs with:  pm2 logs"
ok "Health check:                      bash $DEPLOY_DIR/deploy/healthcheck.sh"
warn "Remember to reload Caddy if you changed the Caddyfile:  sudo systemctl reload caddy"
