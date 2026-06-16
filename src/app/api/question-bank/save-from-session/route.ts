import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/question-bank/save-from-session — Save session questions to bank
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sessionCode, questionIds, saveAll, category } = body

    if (!sessionCode) {
      return NextResponse.json({ error: 'Código da sessão é obrigatório' }, { status: 400 })
    }

    // Find the session
    const session = await db.session.findUnique({
      where: { code: sessionCode },
      include: { questions: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
    }

    // Select questions to save
    let questionsToSave
    if (saveAll) {
      questionsToSave = session.questions
    } else if (questionIds && questionIds.length > 0) {
      questionsToSave = session.questions.filter((q) => questionIds.includes(q.id))
    } else {
      return NextResponse.json({ error: 'Nenhuma questão selecionada' }, { status: 400 })
    }

    if (questionsToSave.length === 0) {
      return NextResponse.json({ error: 'Nenhuma questão encontrada' }, { status: 404 })
    }

    // Create bank entries
    const saved = await Promise.all(
      questionsToSave.map((q) =>
        db.questionBank.create({
          data: {
            title: `Q${q.orderIndex + 1} — ${q.year} ${q.course}`,
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
            tags: `${q.year} ${q.course}`.trim(),
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
    return NextResponse.json({ error: 'Erro ao salvar questões no banco' }, { status: 500 })
  }
}
