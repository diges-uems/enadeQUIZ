import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateChoice,
  validateQuestionId,
  validateSessionCode,
} from '@/lib/security'

const MAX_QUESTION_TEXT = 10_000
const MAX_ALT_TEXT = 1_000

interface UpdateBody {
  text?: unknown
  year?: unknown
  course?: unknown
  altA?: unknown
  altB?: unknown
  altC?: unknown
  altD?: unknown
  altE?: unknown
  correctAnswer?: unknown
  imageUrl?: unknown
  isRevealed?: unknown
  orderIndex?: unknown
}

// PUT /api/session/[code]/questions/[questionId] — Update a question (ADMIN ONLY).
//
// Used by the admin panel both to edit question content AND to flip
// `isRevealed` during a presentation. Whitelisted fields only.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; questionId: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code, questionId } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json({ error: 'Invalid session code' }, { status: 400 })
    }
    if (!validateQuestionId(questionId)) {
      return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 })
    }

    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    })
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const question = await db.question.findUnique({
      where: { id: questionId },
      select: { sessionId: true },
    })
    if (!question || question.sessionId !== session.id) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as UpdateBody

    const updateData: Record<string, unknown> = {}

    if (body.text !== undefined) {
      const t = sanitizeString(body.text, MAX_QUESTION_TEXT)
      if (t.length < 1) {
        return NextResponse.json(
          { error: 'text must be 1-10000 characters.' },
          { status: 400 }
        )
      }
      updateData.text = t
    }
    if (body.year !== undefined) {
      if (typeof body.year !== 'number' || !Number.isFinite(body.year)) {
        return NextResponse.json(
          { error: 'year must be a number.' },
          { status: 400 }
        )
      }
      updateData.year = Math.trunc(body.year)
    }
    if (body.course !== undefined) {
      updateData.course = sanitizeString(body.course, 200)
    }
    for (const key of ['altA', 'altB', 'altC', 'altD', 'altE'] as const) {
      if (body[key] !== undefined) {
        updateData[key] = sanitizeString(body[key], MAX_ALT_TEXT)
      }
    }
    if (body.correctAnswer !== undefined) {
      if (!validateChoice(body.correctAnswer)) {
        return NextResponse.json(
          { error: 'correctAnswer must be one of A-E.' },
          { status: 400 }
        )
      }
      updateData.correctAnswer = body.correctAnswer
    }
    if (body.imageUrl !== undefined) {
      updateData.imageUrl =
        typeof body.imageUrl === 'string' && body.imageUrl.trim().length > 0
          ? sanitizeString(body.imageUrl, 500)
          : null
    }
    if (body.isRevealed !== undefined) {
      if (typeof body.isRevealed !== 'boolean') {
        return NextResponse.json(
          { error: 'isRevealed must be a boolean.' },
          { status: 400 }
        )
      }
      updateData.isRevealed = body.isRevealed
    }
    if (body.orderIndex !== undefined) {
      if (typeof body.orderIndex !== 'number' || !Number.isFinite(body.orderIndex)) {
        return NextResponse.json(
          { error: 'orderIndex must be a number.' },
          { status: 400 }
        )
      }
      updateData.orderIndex = Math.trunc(body.orderIndex)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update.' },
        { status: 400 }
      )
    }

    const updated = await db.question.update({
      where: { id: questionId },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating question:', error)
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
  }
}

// DELETE /api/session/[code]/questions/[questionId] — Delete a question (ADMIN ONLY).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; questionId: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code, questionId } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json({ error: 'Invalid session code' }, { status: 400 })
    }
    if (!validateQuestionId(questionId)) {
      return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 })
    }

    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    })
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const question = await db.question.findUnique({
      where: { id: questionId },
      select: { sessionId: true },
    })
    if (!question || question.sessionId !== session.id) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    await db.question.delete({
      where: { id: questionId },
    })

    // Reorder remaining questions
    const remaining = await db.question.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    })

    for (let i = 0; i < remaining.length; i++) {
      await db.question.update({
        where: { id: remaining[i].id },
        data: { orderIndex: i },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting question:', error)
    return NextResponse.json({ error: 'Failed to delete question' }, { status: 500 })
  }
}
