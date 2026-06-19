#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UEMS Votação — SQLite backup script
# --------------------------------------------------------------------------
# Creates a timestamped copy of the SQLite database to /var/backups/uems/
# and prunes copies older than 30 days. Safe to run via cron — uses
# SQLite's online backup API via `sqlite3 .backup` when available (which
# does not lock writers), falling back to a plain `cp` otherwise.
#
# Cron example (daily at 03:00):
#   0 3 * * * /var/www/uems-votacao/deploy/backup.sh
#
# Restore a backup:
#   cp /var/backups/uems/dev-2025-06-19T030001.db /var/www/uems-votacao/prisma/dev.db
#   pm2 restart uems-next
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-/var/www/uems-votacao}"
DB_FILE="${DB_FILE:-$PROJECT_DIR/prisma/dev.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/uems}"
KEEP_DAYS="${KEEP_DAYS:-30}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
BACKUP_FILE="$BACKUP_DIR/dev-${TIMESTAMP}.db"

log()  { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[ok]\033[0m    %s\n' "$*"; }
err()  { printf '\033[1;31m[err]\033[0m  %s\n' "$*" >&2; }

# ── Sanity checks ───────────────────────────────────────────────────────────
if [[ ! -f "$DB_FILE" ]]; then
  err "Database file not found: $DB_FILE"
  err "Update DB_FILE or PROJECT_DIR env var."
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ── Backup ─────────────────────────────────────────────────────────────────
log "Backing up $DB_FILE → $BACKUP_FILE"

if command -v sqlite3 >/dev/null 2>&1; then
  # Use SQLite's online backup — does not block writers, returns a
  # transactionally-consistent snapshot even while votes are landing.
  if sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"; then
    ok "sqlite3 .backup OK"
  else
    err "sqlite3 .backup failed — falling back to cp"
    cp "$DB_FILE" "$BACKUP_FILE"
  fi
else
  # Plain copy — there's a small race window if a vote lands mid-copy.
  cp "$DB_FILE" "$BACKUP_FILE"
  warn "sqlite3 not available — used cp (consider installing sqlite3)"
fi

# Compress to save disk space.
if command -v gzip >/dev/null 2>&1; then
  gzip -f "$BACKUP_FILE"
  ok "Compressed: $BACKUP_FILE.gz"
  BACKUP_FILE="$BACKUP_FILE.gz"
fi

# Verify the backup is readable (only for uncompressed .db).
if [[ "$BACKUP_FILE" == *.db ]] && command -v sqlite3 >/dev/null 2>&1; then
  if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" >/dev/null 2>&1; then
    ok "Integrity check passed"
  else
    err "Integrity check FAILED on $BACKUP_FILE — investigate before deleting old backups"
  fi
fi

# ── Prune ──────────────────────────────────────────────────────────────────
log "Pruning backups older than $KEEP_DAYS days…"
# -mtime +N = strictly older than N*24h. Use find with -delete for safety.
find "$BACKUP_DIR" -type f -name 'dev-*.db*' -mtime +"$KEEP_DAYS" -print -delete \
  | while read -r f; do ok "deleted $f"; done

ok "Done. Current backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
