/**
 * Admin authentication helpers.
 *
 * Strategy:
 *   - On successful login (`/api/admin/auth` POST) we mint a
 *     cryptographically-random token (crypto.randomUUID + HMAC over a
 *     server secret) and store it in the in-memory `ADMIN_TOKENS` map
 *     with a 24h expiry.
 *   - Every admin-only API route calls `verifyAdminAuth(request)` which
 *     checks the `x-admin-token` header against the in-memory set.
 *   - Tokens are single-instance (in-memory) — restarting the server
 *     invalidates all outstanding tokens, which is acceptable for this
 *     deployment and a feature for security.
 *
 * The HMAC binds the random portion to the server secret so that
 * swapping the secret (e.g. rotating `ADMIN_SECRET_KEY`) invalidates
 * all previously issued tokens even if their random portion leaked.
 */
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'

/* ── Token storage ───────────────────────────────────────────────── */

interface AdminTokenRecord {
  token: string
  issuedAt: number
  expiresAt: number
}

/**
 * In-memory set of valid admin tokens.
 *
 * Stored on `globalThis` (the same pattern used by `@/lib/db.ts` for
 * the Prisma client) so the set survives Next.js dev-mode module
 * re-evaluation. Without this, every Turbopack hot-reload would wipe
 * the allow-list and force the admin to log in again.
 */
const G = globalThis as unknown as {
  __ADMIN_TOKENS__?: Map<string, AdminTokenRecord>
}
export const ADMIN_TOKENS: Map<string, AdminTokenRecord> =
  G.__ADMIN_TOKENS__ ?? (G.__ADMIN_TOKENS__ = new Map())

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// Janitor: prune expired tokens every 10 minutes so the map stays
// bounded. `unref`'d so it never keeps the process alive on its own.
const TOKEN_CLEANUP_INTERVAL_MS = 10 * 60 * 1000

function ensureTokenJanitor(): void {
  // Use the global flag so we don't schedule multiple intervals across
  // dev-mode module re-evaluations.
  const g = G as unknown as { __ADMIN_TOKEN_JANITOR__?: NodeJS.Timeout }
  if (g.__ADMIN_TOKEN_JANITOR__) return
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, rec] of ADMIN_TOKENS) {
      if (rec.expiresAt <= now) ADMIN_TOKENS.delete(key)
    }
  }, TOKEN_CLEANUP_INTERVAL_MS)
  if (typeof timer.unref === 'function') {
    timer.unref()
  }
  g.__ADMIN_TOKEN_JANITOR__ = timer
}

/* ── Secret ──────────────────────────────────────────────────────── */

/**
 * Server secret used to bind tokens to this deployment. Falls back to
 * the same default password that the project ships with so existing
 * setups keep working, but operators are strongly encouraged to set
 * `ADMIN_SECRET_KEY` to a long random string in production.
 */
function getServerSecret(): string {
  return process.env.ADMIN_SECRET_KEY || 'enade2024'
}

/* ── Token minting ───────────────────────────────────────────────── */

/**
 * Mint a fresh admin token. The token has two parts joined by '.':
 *   <randomUUID>.<hmac>
 * where the HMAC is SHA-256(randomUUID, serverSecret). This makes the
 * token unforgeable without the server secret, while still being
 * stateless to verify in principle (we still keep an in-memory
 * allow-list for revocation + expiry).
 *
 * Stores the token in `ADMIN_TOKENS` with a 24h expiry and returns it.
 */
export function generateAdminToken(): string {
  ensureTokenJanitor()
  const random = crypto.randomUUID()
  const hmac = crypto
    .createHmac('sha256', getServerSecret())
    .update(random)
    .digest('hex')
  const token = `${random}.${hmac}`

  const now = Date.now()
  ADMIN_TOKENS.set(token, {
    token,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  })

  return token
}

/* ── Token verification ──────────────────────────────────────────── */

/**
 * Verify the `x-admin-token` header on an incoming request.
 *
 * Returns `true` only when:
 *   1. The header is present and well-formed.
 *   2. The HMAC portion matches a recomputation over the random
 *      portion using the current server secret.
 *   3. The token is in the in-memory `ADMIN_TOKENS` allow-list.
 *   4. The token has not expired.
 *
 * Expired tokens are deleted on access (lazy expiry).
 */
export function verifyAdminAuth(request: NextRequest): boolean {
  const header = request.headers.get('x-admin-token')
  if (!header) return false

  // Quick shape check.
  const dot = header.indexOf('.')
  if (dot <= 0 || dot >= header.length - 1) return false
  const random = header.slice(0, dot)
  const hmac = header.slice(dot + 1)

  // Recompute HMAC to defend against tampering AND against a token
  // that was issued under a different (rotated) secret.
  const expected = crypto
    .createHmac('sha256', getServerSecret())
    .update(random)
    .digest('hex')

  // Use timingSafeEqual to avoid leaking the HMAC via timing.
  try {
    const a = Buffer.from(hmac)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    if (!crypto.timingSafeEqual(a, b)) return false
  } catch {
    return false
  }

  // Must also be in the in-memory allow-list (this is what gives us
  // revocation + expiry).
  const record = ADMIN_TOKENS.get(header)
  if (!record) return false

  if (record.expiresAt <= Date.now()) {
    ADMIN_TOKENS.delete(header)
    return false
  }

  return true
}

/* ── Password check ──────────────────────────────────────────────── */

/**
 * Constant-time password comparison. Defends against timing attacks
 * even before the per-IP rate limit kicks in.
 */
export function verifyAdminPassword(candidate: string): boolean {
  const expected = getServerSecret()
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/* ── Revocation ──────────────────────────────────────────────────── */

/**
 * Revoke a single token (logout). No-op if the token is unknown.
 */
export function revokeAdminToken(token: string | null | undefined): void {
  if (!token) return
  ADMIN_TOKENS.delete(token)
}
