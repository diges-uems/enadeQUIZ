import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateSessionCode,
} from '@/lib/security'

// Forçar rota dinâmica — sessões mudam frequentemente via Socket.io
export const dynamic = 'force-dynamic'

// GET /api/session/[code] — Get session by code (PUBLIC).
//
// Read by students / votar / apresentacao pages — must stay open.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      )
    }
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
        students: {
          orderBy: { score: 'desc' },
        },
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Cache curto: sessão muda quando questões são ativadas/gabarito revelado
    // stale-while-revalidate permite resposta instantânea enquanto revalida
    return NextResponse.json(session, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
      },
    })
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}

// DELETE /api/session/[code] — Delete session (ADMIN ONLY).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json({ error: 'Invalid session code' }, { status: 400 })
    }
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    await db.session.delete({
      where: { id: session.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}

// PATCH /api/session/[code] — Update session (ADMIN ONLY).
//
// Used by the admin panel to set status / currentQuestionId. Whitelisted
// fields only — anything else in the body is silently ignored.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json({ error: 'Invalid session code' }, { status: 400 })
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
      status?: unknown
      currentQuestionId?: unknown
      requireIdentification?: unknown
    }

    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    })
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}

    // Whitelisted + validated fields only.
    if (typeof body.title === 'string') {
      const t = sanitizeString(body.title, 200)
      if (t.length >= 1) updateData.title = t
    }
    if (typeof body.status === 'string') {
      const s = body.status.trim()
      if (s === 'waiting' || s === 'active' || s === 'finished') {
        updateData.status = s
      }
    }
    if (typeof body.requireIdentification === 'boolean') {
      updateData.requireIdentification = body.requireIdentification
    }
    if (body.currentQuestionId === null) {
      updateData.currentQuestionId = null
    } else if (typeof body.currentQuestionId === 'string') {
      // Don't validate as cuid here — the admin may send a freshly
      // created id we haven't seen; trust the Prisma FK check instead.
      updateData.currentQuestionId = body.currentQuestionId.trim()
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update.' },
        { status: 400 }
      )
    }

    const updated = await db.session.update({
      where: { id: session.id },
      data: updateData,
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating session:', error)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}
