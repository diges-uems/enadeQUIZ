import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateCuid,
  validateChoice,
} from '@/lib/security'

const MAX_TITLE = 200
const MAX_TEXT = 10_000
const MAX_ALT = 1_000

// GET /api/question-bank/[id] — Get a single question from bank (PUBLIC).
//
// Public so any client can preview a bank question's full text.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!validateCuid(id)) {
      return NextResponse.json(
        { error: 'ID inválido (cuid esperado).' },
        { status: 400 }
      )
    }

    const question = await db.questionBank.findUnique({
      where: { id: id.trim() },
    })
    if (!question) {
      return NextResponse.json({ error: 'Questão não encontrada' }, { status: 404 })
    }

    return NextResponse.json(question)
  } catch (error) {
    console.error('Error fetching question from bank:', error)
    return NextResponse.json({ error: 'Erro ao buscar questão' }, { status: 500 })
  }
}

// PUT /api/question-bank/[id] — Update a question in the bank (ADMIN ONLY).
//
// Whitelisted + validated fields only — the previous implementation
// passed `body` straight to Prisma, which would let an attacker set
// arbitrary columns. We now build `updateData` explicitly.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!validateCuid(id)) {
      return NextResponse.json(
        { error: 'ID inválido (cuid esperado).' },
        { status: 400 }
      )
    }

    const bodyResult = await isSafeJsonBody(req)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as {
      title?: unknown
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
      category?: unknown
      tags?: unknown
    }

    const updateData: Record<string, unknown> = {}

    if (body.title !== undefined) updateData.title = sanitizeString(body.title, MAX_TITLE)
    if (body.text !== undefined) {
      const t = sanitizeString(body.text, MAX_TEXT)
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
    if (body.course !== undefined) updateData.course = sanitizeString(body.course, 200)
    for (const k of ['altA', 'altB', 'altC', 'altD', 'altE'] as const) {
      if (body[k] !== undefined) updateData[k] = sanitizeString(body[k], MAX_ALT)
    }
    if (body.correctAnswer !== undefined) {
      if (!validateChoice(body.correctAnswer)) {
        return NextResponse.json(
          { error: 'correctAnswer must be A-E.' },
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
    if (body.category !== undefined) updateData.category = sanitizeString(body.category, 100)
    if (body.tags !== undefined) updateData.tags = sanitizeString(body.tags, 500)

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update.' },
        { status: 400 }
      )
    }

    const question = await db.questionBank.update({
      where: { id: id.trim() },
      data: updateData,
    })

    return NextResponse.json(question)
  } catch (error) {
    console.error('Error updating question in bank:', error)
    return NextResponse.json({ error: 'Erro ao atualizar questão' }, { status: 500 })
  }
}

// DELETE /api/question-bank/[id] — Delete a question from the bank (ADMIN ONLY).
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!validateCuid(id)) {
      return NextResponse.json(
        { error: 'ID inválido (cuid esperado).' },
        { status: 400 }
      )
    }

    await db.questionBank.delete({ where: { id: id.trim() } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting question from bank:', error)
    return NextResponse.json({ error: 'Erro ao excluir questão' }, { status: 500 })
  }
}
