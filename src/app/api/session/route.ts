import { db } from '@/lib/db'
import { generateSessionCode } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import { isSafeJsonBody, sanitizeString } from '@/lib/security'

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
    const body = (bodyResult.data || {}) as { title?: unknown }

    const title = sanitizeString(body.title, 200)
    if (title.length < 1) {
      return NextResponse.json(
        { error: 'Title is required (1-200 characters).' },
        { status: 400 }
      )
    }

    // Generate unique code
    let code = generateSessionCode()
    let exists = await db.session.findUnique({ where: { code } })
    while (exists) {
      code = generateSessionCode()
      exists = await db.session.findUnique({ where: { code } })
    }

    const session = await db.session.create({
      data: {
        code,
        title,
        status: 'waiting',
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
