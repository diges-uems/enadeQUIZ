/**
 * In-memory sliding-window rate limiter.
 *
 * Designed for single-instance Node.js runtimes (Next.js dev server and the
 * standalone production server). It is intentionally dependency-free and
 * uses only `Map` + `setTimeout` so it works in any runtime.
 *
 * Each identifier (e.g. `auth:ip:1.2.3.4`) is mapped to a small record
 * tracking request count and the wall-clock reset time. When the window
 * elapses the counter is naturally reset on the next call. A periodic
 * janitor purges expired entries so the map does not grow unbounded.
 *
 * Public API:
 *   rateLimit(identifier, limit, windowMs) -> { success, retryAfter }
 *
 * Suggested presets:
 *   - General API:  60 / 60_000
 *   - Admin auth:    5 / 60_000   (brute-force protection)
 *   - Vote:         30 / 60_000
 *   - Student reg:  10 / 60_000
 */

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Stored on `globalThis` (same pattern as `@/lib/db.ts` and
 * `@/lib/api-auth.ts`) so the limiter survives Next.js dev-mode module
 * re-evaluation. Without this, hot-reloads would reset all rate-limit
 * buckets and let attackers escape their quota.
 */
const G = globalThis as unknown as {
  __RATE_LIMIT_STORE__?: Map<string, Bucket>
  __RATE_LIMIT_CLEANUP__?: NodeJS.Timeout | null
}
const store: Map<string, Bucket> =
  G.__RATE_LIMIT_STORE__ ?? (G.__RATE_LIMIT_STORE__ = new Map())

// Janitor: purge expired buckets every 60s so the map stays small even
// under heavy churn (e.g. 1000 students hitting /api/vote).
const CLEANUP_INTERVAL_MS = 60_000

function ensureJanitor(): void {
  if (G.__RATE_LIMIT_CLEANUP__) return
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) {
        store.delete(key)
      }
    }
  }, CLEANUP_INTERVAL_MS)
  // Allow the process to exit even if the timer is still alive.
  if (typeof timer.unref === 'function') {
    timer.unref()
  }
  G.__RATE_LIMIT_CLEANUP__ = timer
}

export interface RateLimitResult {
  success: boolean
  retryAfter: number
  /** Remaining requests in the current window (always >= 0). */
  remaining: number
  /** Total limit for this identifier (echoes the input). */
  limit: number
}

/**
 * Rate-limit a single request identified by `identifier`.
 *
 * Returns `{ success: true, ... }` when the caller is allowed to proceed
 * (and the bucket was incremented), or `{ success: false, retryAfter }`
 * when the limit has been exceeded. `retryAfter` is expressed in
 * milliseconds (callers typically translate to seconds for the
 * `Retry-After` HTTP header).
 *
 * The function is synchronous and side-effectful: a successful call
 * increments the counter immediately.
 */
export function rateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  ensureJanitor()
  const now = Date.now()

  const existing = store.get(identifier)
  let bucket: Bucket
  if (!existing || existing.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    store.set(identifier, bucket)
  } else {
    bucket = existing
  }

  if (bucket.count >= limit) {
    return {
      success: false,
      retryAfter: Math.max(1, bucket.resetAt - now),
      remaining: 0,
      limit,
    }
  }

  bucket.count += 1
  return {
    success: true,
    retryAfter: 0,
    remaining: Math.max(0, limit - bucket.count),
    limit,
  }
}

/**
 * Helper that builds a stable identifier string from an IP address and a
 * route/feature label. Falls back to a shared `'unknown'` bucket when no
 * IP can be derived (e.g. when running behind a misconfigured proxy) so
 * the limiter is still effective — it just shares one bucket among all
 * such clients.
 */
export function rateLimitKey(ip: string | null | undefined, label: string): string {
  const safeIp = (ip && ip.trim()) || 'unknown'
  return `${label}:${safeIp}`
}

/**
 * Extract the client IP from a Next.js Request. Honours `x-forwarded-for`
 * (the first hop is the real client) and `x-real-ip`.
 */
export function getClientIP(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return null
}

/* ── Presets ──────────────────────────────────────────────────────── */

export const RATE_LIMITS = {
  general: { limit: 60, windowMs: 60_000 },
  adminAuth: { limit: 5, windowMs: 60_000 },
  vote: { limit: 30, windowMs: 60_000 },
  studentRegister: { limit: 10, windowMs: 60_000 },
  bulkImport: { limit: 5, windowMs: 60_000 },
} as const
