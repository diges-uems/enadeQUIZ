#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# UEMS Votação — health check script
# --------------------------------------------------------------------------
# Probes all 3 services and reports a one-line status per service.
# Exit code 0 = all healthy, 1 = at least one unhealthy. Designed to be
# called by monitoring tools (Uptime Kuma, Nagios, cron, CI/CD).
#
#   bash /var/www/uems-votacao/deploy/healthcheck.sh
#   echo $?    # 0 = healthy
#
# With Uptime Kuma: push-monitor type, call this script via SSH or
# http(s) push if you wrap it in a tiny cron → curl loop.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# ── Config (override via env) ───────────────────────────────────────────────
NEXT_HOST="${NEXT_HOST:-http://127.0.0.1:3000}"
SOCKET_HOST="${SOCKET_HOST:-http://127.0.0.1:3003}"
STRESS_HOST="${STRESS_HOST:-http://127.0.0.1:3004}"
TIMEOUT="${TIMEOUT:-5}"   # seconds per probe

GREEN='\033[1;32m'
RED='\033[1;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

all_ok=1

probe() {
  local label="$1"
  local url="$2"
  local expected_regex="$3"
  # -sS = silent + show errors, -o = output body to file, -w = status code last.
  local code body
  body="$(curl -sS --max-time "$TIMEOUT" -o - -w '\n__HTTP_CODE__:%{http_code}' "$url" 2>/dev/null || true)"
  code="$(printf '%s' "$body" | sed -n 's/.*__HTTP_CODE__:\([0-9]*\).*/\1/p')"
  body="$(printf '%s' "$body" | sed 's/__HTTP_CODE__:[0-9]*$//')"

  if [[ -z "$code" ]]; then
    printf "${RED}FAIL${RESET}  %-22s  unreachable (timeout/connection refused)\n" "$label"
    all_ok=0
    return
  fi

  if [[ ! "$code" =~ ^($expected_regex)$ ]]; then
    printf "${RED}FAIL${RESET}  %-22s  HTTP %s (expected %s)\n" "$label" "$code" "$expected_regex"
    all_ok=0
    return
  fi

  printf "${GREEN}OK${RESET}    %-22s  HTTP %s\n" "$label" "$code"
}

# ── Probes ─────────────────────────────────────────────────────────────────
echo "── UEMS Votação health check ─────────────────────────────────"
echo "Timestamp: $(date -u +%FT%TZ)"
echo

# Next.js: GET / returns 200 (home page renders)
probe "next (3000)"     "$NEXT_HOST/"                  "200|307"

# Socket.io service: GET / returns 400 with "session ID unknown" or
# similar — that's actually the healthy response (socket.io engine.io
# rejects bare HTTP GETs without an EIO query). We accept 400 (engine.io
# handshake expected) or 200 (if you later add a /health route).
probe "socket (3003)"   "$SOCKET_HOST/"                "200|400"

# Stress-test service: dedicated /health endpoint returns 200 + JSON.
probe "stress (3004)"   "$STRESS_HOST/health"          "200"

echo
if [[ "$all_ok" -eq 1 ]]; then
  printf "${GREEN}All services healthy.${RESET}\n"
  exit 0
else
  printf "${RED}One or more services unhealthy — check pm2 logs.${RESET}\n"
  printf "  pm2 logs --lines 100\n"
  exit 1
fi
