import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitKey, getClientIP, RATE_LIMITS } from '@/lib/rate-limit'
import { isSafeJsonBody, sanitizeString } from '@/lib/security'
import { generateAdminToken, verifyAdminPassword } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

/** Random delay between 200 and 800 ms to flatten timing side channels. */
function randomDelayMs(): number {
  return 200 + Math.floor(Math.random() * 600)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// POST /api/admin/auth — Admin login.
//
// Hardened:
//   - 5 attempts / minute / IP (brute-force protection).
//   - Constant-time password compare (in @/lib/api-auth).
//   - On failure: 200-800 ms random delay to slow timing attacks.
//   - On failure: logs the IP + timestamp so operators can spot
//     brute-force attempts in the dev.log / server log.
//   - On success: returns a real cryptographically-random token minted
//     by generateAdminToken() (HMAC-bound to ADMIN_SECRET_KEY). The
//     token is stored in the in-memory ADMIN_TOKENS map with 24h
//     expiry and is required by every admin-only API route.
export async function POST(request: NextRequest) {
  // 1) Rate-limit BEFORE doing any work (cheap rejection).
  const ip = getClientIP(request)
  const rlKey = rateLimitKey(ip, 'admin-auth')
  const rl = rateLimit(rlKey, RATE_LIMITS.adminAuth.limit, RATE_LIMITS.adminAuth.windowMs)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfter / 1000)) },
      }
    )
  }

  // 2) Parse + size-limit the body.
  const bodyResult = await isSafeJsonBody(request)
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.error || 'Invalid request.' },
      { status: bodyResult.status || 400 }
    )
  }
  const body = (bodyResult.data || {}) as { password?: unknown }
  const candidate = sanitizeString(body.password, 200)

  // 3) Constant-time password check.
  const ok = verifyAdminPassword(candidate)

  if (!ok) {
    // Random delay to flatten timing side channel.
    await sleep(randomDelayMs())
    // Log failed attempts so operators can spot brute-force in dev.log.
    console.warn(
      `[admin-auth] failed login attempt ip=${ip || 'unknown'} ts=${new Date().toISOString()}`
    )
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  // 4) Success — mint a fresh token.
  const token = generateAdminToken()
  return NextResponse.json({ success: true, token })
}
