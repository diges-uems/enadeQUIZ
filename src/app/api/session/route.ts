import { db } from '@/lib/db'
import { generateSessionCode } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import { isSafeJsonBody, sanitizeString, validateSessionCode } from '@/lib/security'

// GET /api/session — List all sessions (PUBLIC).
//
// Students / presentation screen / votar page all read this to populate
// their UI, so it must remain open. Question text is included because
// students need to render the active question.
export async function GET() {
  try {
    const sessions = await db.session.findMany({
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

// POST /api/session — Create a new session (ADMIN ONLY).
//
// Body fields:
//   title                    (required, 1-200 chars)
//   requireIdentification    (optional, default true) — when false, the
//                            votar page skips the RGM+Name identification
//                            screen. Used for "test mode" sessions.
//   customCode               (optional, 6-char A-Z0-9) — lets the admin
//                            pick a memorable code (e.g. TEST25) instead
//                            of a random one. Must be unique.
export async function POST(request: NextRequest) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as {
      title?: unknown
      requireIdentification?: unknown
      customCode?: unknown
    }

    const title = sanitizeString(body.title, 200)
    if (title.length < 1) {
      return NextResponse.json(
        { error: 'Title is required (1-200 characters).' },
        { status: 400 }
      )
    }

    // requireIdentification: default true. Explicit false => test mode.
    const requireIdentification =
      typeof body.requireIdentification === 'boolean'
        ? body.requireIdentification
        : true

    // Resolve the session code: use a custom code if provided + valid,
    // otherwise generate a random one. Custom codes let the admin create
    // a fixed, easy-to-remember test code (e.g. TEST25).
    let code: string
    if (typeof body.customCode === 'string' && validateSessionCode(body.customCode)) {
      code = (body.customCode as string).trim().toUpperCase()
      const taken = await db.session.findUnique({ where: { code } })
      if (taken) {
        return NextResponse.json(
          { error: `Código ${code} já está em uso. Escolha outro.` },
          { status: 409 }
        )
      }
    } else {
      code = generateSessionCode()
      let exists = await db.session.findUnique({ where: { code } })
      while (exists) {
        code = generateSessionCode()
        exists = await db.session.findUnique({ where: { code } })
      }
    }

    const session = await db.session.create({
      data: {
        code,
        title,
        status: 'waiting',
        requireIdentification,
      },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
