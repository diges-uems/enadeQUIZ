import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import {
  isSafeJsonBody,
  sanitizeString,
  validateCuid,
  validateSessionCode,
} from '@/lib/security'
import {
  getClientIP,
  rateLimit,
  rateLimitKey,
  RATE_LIMITS,
} from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

interface StudentRequestBody {
  sessionCode?: unknown
  sessionId?: unknown
  name?: unknown
  rgm?: unknown
}

// POST /api/student — Register a student in a session.
//
// Accepts either `sessionCode` (6-char code) or `sessionId` (cuid) to
// identify the session, matching both legacy callers and the spec.
//
// Hardened:
//   - 10 registrations / minute / IP.
//   - Validates name (1-100 chars), rgm (1-50 chars), session id/code.
//   - Sanitises name (strip control chars, collapse whitespace, trim).
//   - 1 MB body cap.
//   - No stack-trace leakage on error.
export async function POST(request: NextRequest) {
  try {
    // 1) Rate limit.
    const ip = getClientIP(request)
    const rlKey = rateLimitKey(ip, 'student-register')
    const rl = rateLimit(
      rlKey,
      RATE_LIMITS.studentRegister.limit,
      RATE_LIMITS.studentRegister.windowMs
    )
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many registrations. Please slow down.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rl.retryAfter / 1000)) },
        }
      )
    }

    // 2) Parse body.
    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as StudentRequestBody

    // 3) Sanitise + validate fields.
    const nameRaw = sanitizeString(body.name, 100)
    const rgmRaw = sanitizeString(body.rgm, 50)

    if (nameRaw.length < 1 || nameRaw.length > 100) {
      return NextResponse.json(
        { error: 'Name must be 1-100 characters.' },
        { status: 400 }
      )
    }
    if (rgmRaw.length < 1 || rgmRaw.length > 50) {
      return NextResponse.json(
        { error: 'RGM must be 1-50 characters.' },
        { status: 400 }
      )
    }

    // 4) Resolve session by either sessionCode or sessionId.
    let session: { id: string } | null = null
    if (validateSessionCode(body.sessionCode)) {
      session = await db.session.findUnique({
        where: { code: (body.sessionCode as string).toUpperCase() },
        select: { id: true },
      })
    } else if (validateCuid(body.sessionId)) {
      session = await db.session.findUnique({
        where: { id: (body.sessionId as string).trim() },
        select: { id: true },
      })
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // 5) Check for duplicate (unique constraint on sessionId+rgm).
    const existing = await db.student.findUnique({
      where: {
        sessionId_rgm: {
          sessionId: session.id,
          rgm: rgmRaw,
        },
      },
    })
    if (existing) {
      return NextResponse.json({ student: existing, isNew: false })
    }

    // 6) Create new student.
    const student = await db.student.create({
      data: {
        sessionId: session.id,
        name: nameRaw,
        rgm: rgmRaw,
      },
    })

    return NextResponse.json({ student, isNew: true }, { status: 201 })
  } catch (error) {
    console.error('Error registering student:', error)
    return NextResponse.json(
      { error: 'Failed to register student' },
      { status: 500 }
    )
  }
}

// GET /api/student?sessionCode=XXX — Get students for a session.
//
// Note: this is intentionally left public (no admin token required)
// because the presentation screen and votar page consume it for the
// live ranking/feedback. The data is non-sensitive (student names +
// RGMs of participants in a quiz session — same audience as the
// presentation). The /api/student/[sessionId] GET variant is
// admin-only (see that route file).
export async function GET(request: NextRequest) {
  try {
    const sessionCode = request.nextUrl.searchParams.get('sessionCode')
    if (!validateSessionCode(sessionCode)) {
      return NextResponse.json(
        { error: 'Invalid sessionCode' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: (sessionCode as string).toUpperCase() },
      select: { id: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const students = await db.student.findMany({
      where: { sessionId: session.id },
      orderBy: { score: 'desc' },
    })

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error fetching students:', error)
    return NextResponse.json(
      { error: 'Failed to fetch students' },
      { status: 500 }
    )
  }
}
