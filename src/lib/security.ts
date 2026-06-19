/**
 * Generic input-sanitisation + validation helpers shared across API routes.
 *
 * The goal is defence-in-depth: every public endpoint should
 *   1. Reject oversized bodies (`isSafeJsonBody`).
 *   2. Sanitise any free-text field that will be persisted
 *      (`sanitizeString`) to strip control chars + null bytes.
 *   3. Validate structured identifiers (`validateSessionCode`,
 *      `validateChoice`, `validateQuestionId`).
 *
 * No external dependencies — Node built-ins only.
 */
import { NextRequest } from 'next/server'

/* ── Constants ────────────────────────────────────────────────────── */

export const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024 // 1 MB hard limit

/** CUID v2-ish: lower-case alphanumeric, 24+ chars, starts with 'c'. */
const CUID_RE = /^c[a-z0-9]{20,}$/i
/** 4-10 char uppercase alphanumeric session codes (case-insensitive on input).
 *  Allows custom codes like ENADE25 (7), BIO2025 (7), TEST25 (6), etc. */
const SESSION_CODE_RE = /^[A-Z0-9]{4,10}$/i
/** Single letter A-E. */
const CHOICE_RE = /^[A-E]$/

/* ── String sanitiser ─────────────────────────────────────────────── */

/**
 * Strip control characters + null bytes from a string, collapse runs of
 * whitespace into a single space, trim, and truncate to `maxLen`.
 *
 * Returns an empty string for non-string inputs.
 *
 * Used for every free-text field that lands in the database (question
 * text, alternative text, student names, etc.).
 */
export function sanitizeString(s: unknown, maxLen: number): string {
  if (typeof s !== 'string') return ''
  // Remove null bytes and C0/C1 control chars except \t \n \r.
  let out = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
  // Collapse any run of whitespace (including non-breaking spaces and
  // other Unicode space separators) into a single space — this keeps
  // formatting predictable and prevents weird DB content.
  out = out.replace(/[\s\u00A0\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g, ' ')
  out = out.trim()
  if (out.length > maxLen) {
    out = out.slice(0, maxLen)
  }
  return out
}

/* ── Field validators ────────────────────────────────────────────── */

export function validateSessionCode(code: unknown): code is string {
  return typeof code === 'string' && SESSION_CODE_RE.test(code.trim())
}

export function validateChoice(c: unknown): c is 'A' | 'B' | 'C' | 'D' | 'E' {
  return typeof c === 'string' && CHOICE_RE.test(c)
}

/**
 * Validate a Prisma CUID identifier. We accept any 20+ char
 * alphanumeric string starting with 'c' — this matches both CUID v1
 * and v2 outputs that Prisma generates for SQLite.
 */
export function validateQuestionId(id: unknown): id is string {
  return typeof id === 'string' && CUID_RE.test(id.trim())
}

/** Loose variant of validateQuestionId for studentId / sessionId etc. */
export function validateCuid(id: unknown): id is string {
  return typeof id === 'string' && CUID_RE.test(id.trim())
}

/* ── JSON body parser with size guard ────────────────────────────── */

export interface SafeBodyResult {
  ok: boolean
  data?: unknown
  error?: string
  status?: number
}

/**
 * Enforce the global JSON body size limit (1 MB) and safely parse the
 * body. Returns `{ ok, data }` on success, or `{ ok: false, error,
 * status }` on failure — the caller can forward `error`/`status`
 * directly to a `NextResponse.json(...)` call.
 *
 * Checks `Content-Length` first (cheap header read) and falls back to
 * measuring the parsed body length if the header is missing/lying.
 */
export async function isSafeJsonBody(req: NextRequest): Promise<SafeBodyResult> {
  // 1) Header-based size guard — cheap, no I/O.
  const contentLength = req.headers.get('content-length')
  if (contentLength) {
    const n = Number(contentLength)
    if (Number.isFinite(n) && n > MAX_JSON_BODY_BYTES) {
      return {
        ok: false,
        status: 413,
        error: 'Request body too large (max 1 MB).',
      }
    }
  }

  // 2) Read the body text. We use .text() so we can also enforce the
  //    size on the actual bytes received (defends against a missing or
  //    under-reporting Content-Length header).
  let raw: string
  try {
    raw = await req.text()
  } catch {
    return { ok: false, status: 400, error: 'Invalid request body.' }
  }

  if (raw.length > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      error: 'Request body too large (max 1 MB).',
    }
  }

  // 3) Empty body — allow caller to decide what to do.
  if (raw.length === 0) {
    return { ok: true, data: {} }
  }

  // 4) Parse JSON safely. JSON.parse throws on trailing commas etc.
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, status: 400, error: 'Malformed JSON body.' }
  }

  return { ok: true, data }
}

/* ── Generic safe-error helper ───────────────────────────────────── */

/**
 * Build a generic 500 response body that never leaks stack traces.
 * In production we return a fixed message; in dev we still keep it
 * generic to avoid accidental disclosure (the real error is logged
 * server-side via console.error).
 */
export function internalErrorResponse(): { error: string } {
  return { error: 'Internal server error.' }
}
