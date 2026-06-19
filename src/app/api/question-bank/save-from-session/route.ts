import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateCuid,
  validateSessionCode,
} from '@/lib/security'

// POST /api/question-bank/save-from-session — Save session questions to bank (ADMIN ONLY).
//
// Body:
//   { sessionCode: string, questionIds?: string[], saveAll?: boolean, category?: string }
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
      saveAll?: unknown
      category?: unknown
    }

    if (!validateSessionCode(body.sessionCode)) {
      return NextResponse.json(
        { error: 'Código da sessão inválido (6 caracteres A-Z0-9).' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: (body.sessionCode as string).toUpperCase() },
      include: { questions: true },
    })
    if (!session) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
    }

    // Select questions to save
    let questionsToSave
    if (body.saveAll === true) {
      questionsToSave = session.questions
    } else if (Array.isArray(body.questionIds) && body.questionIds.length > 0) {
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
      questionsToSave = session.questions.filter((q) => ids.includes(q.id))
    } else {
      return NextResponse.json(
        { error: 'Nenhuma questão selecionada' },
        { status: 400 }
      )
    }

    if (questionsToSave.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma questão encontrada' },
        { status: 404 }
      )
    }

    // Create bank entries
    const category = sanitizeString(body.category, 100)
    const saved = await Promise.all(
      questionsToSave.map((q) =>
        db.questionBank.create({
          data: {
            title: `Q${q.orderIndex + 1} — ${q.year} ${q.course}`.slice(0, 200),
            text: q.text,
            year: q.year,
            course: q.course,
            altA: q.altA,
            altB: q.altB,
            altC: q.altC,
            altD: q.altD,
            altE: q.altE,
            correctAnswer: q.correctAnswer,
            imageUrl: q.imageUrl,
            category: category || q.course || 'Geral',
            tags: `${q.year} ${q.course}`.trim().slice(0, 500),
          },
        })
      )
    )

    return NextResponse.json({
      saved: saved.length,
      questions: saved,
    })
  } catch (error) {
    console.error('Error saving questions to bank:', error)
    return NextResponse.json(
      { error: 'Erro ao salvar questões no banco' },
      { status: 500 }
    )
  }
}
