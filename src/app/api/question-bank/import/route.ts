import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/question-bank/import — Import questions from bank to a session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionCode, questionIds, importAll, category, course } = body

    if (!sessionCode) {
      return NextResponse.json({ error: 'Código da sessão é obrigatório' }, { status: 400 })
    }

    // Find the session
    const session = await db.session.findUnique({
      where: { code: sessionCode },
      include: { questions: { select: { id: true, orderIndex: true } } },
    })

    if (!session) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
    }

    // Get questions from bank
    let bankQuestions
    if (importAll) {
      const where: Record<string, unknown> = {}
      if (category && category !== 'all') where.category = category
      if (course && course !== 'all') where.course = course
      bankQuestions = await db.questionBank.findMany({ where })
    } else if (questionIds && questionIds.length > 0) {
      bankQuestions = await db.questionBank.findMany({
        where: { id: { in: questionIds } },
      })
    } else {
      return NextResponse.json({ error: 'Nenhuma questão selecionada' }, { status: 400 })
    }

    if (bankQuestions.length === 0) {
      return NextResponse.json({ error: 'Nenhuma questão encontrada no banco' }, { status: 404 })
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
    return NextResponse.json({ error: 'Erro ao importar questões do banco' }, { status: 500 })
  }
}
