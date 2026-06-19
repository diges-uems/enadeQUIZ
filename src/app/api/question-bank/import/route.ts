import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateCuid,
  validateSessionCode,
} from '@/lib/security'

// POST /api/question-bank/import — Import questions from bank to a session (ADMIN ONLY).
//
// Body:
//   { sessionCode: string, questionIds: string[], importAll?: boolean, category?: string, course?: string }
export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bodyResult = await isSafeJsonBody(req)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as {
      sessionCode?: unknown
      questionIds?: unknown
      importAll?: unknown
      category?: unknown
      course?: unknown
    }

    if (!validateSessionCode(body.sessionCode)) {
      return NextResponse.json(
        { error: 'Código da sessão inválido (6 caracteres A-Z0-9).' },
        { status: 400 }
      )
    }

    // Find the session
    const session = await db.session.findUnique({
      where: { code: (body.sessionCode as string).toUpperCase() },
      include: { questions: { select: { id: true, orderIndex: true } } },
    })
    if (!session) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
    }
    if (session.status === 'finished') {
      return NextResponse.json(
        { error: 'Não é possível importar para uma sessão encerrada.' },
        { status: 403 }
      )
    }

    // Get questions from bank
    let bankQuestions
    if (body.importAll === true) {
      const where: Record<string, unknown> = {}
      if (typeof body.category === 'string' && body.category !== 'all') {
        where.category = sanitizeString(body.category, 100)
      }
      if (typeof body.course === 'string' && body.course !== 'all') {
        where.course = sanitizeString(body.course, 100)
      }
      bankQuestions = await db.questionBank.findMany({ where })
    } else if (Array.isArray(body.questionIds) && body.questionIds.length > 0) {
      // Validate each id + cap to prevent abuse.
      if (body.questionIds.length > 500) {
        return NextResponse.json(
          { error: 'Too many questionIds (max 500).' },
          { status: 413 }
        )
      }
      const ids: string[] = []
      for (const id of body.questionIds) {
        if (typeof id !== 'string' || !validateCuid(id)) {
          return NextResponse.json(
            { error: 'questionIds must be an array of cuid strings.' },
            { status: 400 }
          )
        }
        ids.push(id.trim())
      }
      bankQuestions = await db.questionBank.findMany({
        where: { id: { in: ids } },
      })
    } else {
      return NextResponse.json(
        { error: 'Nenhuma questão selecionada' },
        { status: 400 }
      )
    }

    if (!bankQuestions || bankQuestions.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma questão encontrada no banco' },
        { status: 404 }
      )
    }

    // Cap the import to prevent runaway imports.
    if (bankQuestions.length > 500) {
      return NextResponse.json(
        { error: 'Too many questions to import (max 500).' },
        { status: 413 }
      )
    }

    // Calculate starting order index
    const maxOrder = session.questions.reduce(
      (max: number, q: { orderIndex: number }) => Math.max(max, q.orderIndex),
      -1
    )

    // Create questions in session from bank
    const created = await Promise.all(
      bankQuestions.map((bq, index) =>
        db.question.create({
          data: {
            sessionId: session.id,
            text: bq.text,
            year: bq.year,
            course: bq.course,
            altA: bq.altA,
            altB: bq.altB,
            altC: bq.altC,
            altD: bq.altD,
            altE: bq.altE,
            correctAnswer: bq.correctAnswer,
            imageUrl: bq.imageUrl,
            isRevealed: false,
            orderIndex: maxOrder + 1 + index,
          },
        })
      )
    )

    return NextResponse.json({
      imported: created.length,
      questions: created,
    })
  } catch (error) {
    console.error('Error importing questions from bank:', error)
    return NextResponse.json(
      { error: 'Erro ao importar questões do banco' },
      { status: 500 }
    )
  }
}
