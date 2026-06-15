import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { QuestionImport } from '@/types'

// GET /api/session/[code]/questions - List questions for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const questions = await db.question.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: 'asc' }
    })

    return NextResponse.json(questions)
  } catch (error) {
    console.error('Error fetching questions:', error)
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }
}

// POST /api/session/[code]/questions - Add a question (single or import array)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: { questions: { orderBy: { orderIndex: 'asc' } } }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const body = await request.json()
    
    // Check if it's an import (array of questions)
    if (Array.isArray(body)) {
      const imports: QuestionImport[] = body
      const nextIndex = session.questions.length
      const questions = []

      for (let i = 0; i < imports.length; i++) {
        const q = imports[i]
        if (!q.text || !q.alternatives || !q.correctAnswer) {
          continue // Skip invalid questions
        }

        const question = await db.question.create({
          data: {
            sessionId: session.id,
            text: q.text,
            year: q.year || new Date().getFullYear(),
            course: q.course || '',
            altA: q.alternatives.A || '',
            altB: q.alternatives.B || '',
            altC: q.alternatives.C || '',
            altD: q.alternatives.D || '',
            altE: q.alternatives.E || '',
            correctAnswer: q.correctAnswer,
            imageUrl: q.imageUrl || null,
            orderIndex: nextIndex + i,
          }
        })
        questions.push(question)
      }

      return NextResponse.json(questions, { status: 201 })
    }

    // Single question
    const { text, year, course, altA, altB, altC, altD, altE, correctAnswer, imageUrl } = body

    if (!text || !altA || !altB || !altC || !altD || !correctAnswer) {
      return NextResponse.json({ error: 'Missing required fields (text, altA-D, correctAnswer)' }, { status: 400 })
    }

    const nextIndex = session.questions.length
    const question = await db.question.create({
      data: {
        sessionId: session.id,
        text,
        year: year || new Date().getFullYear(),
        course: course || '',
        altA,
        altB,
        altC,
        altD,
        altE,
        correctAnswer,
        imageUrl: imageUrl || null,
        orderIndex: nextIndex,
      }
    })

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    console.error('Error creating question:', error)
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 })
  }
}

// PUT /api/session/[code]/questions - Reorder questions
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const body = await request.json()
    const { questionIds } = body as { questionIds: string[] }

    if (!Array.isArray(questionIds)) {
      return NextResponse.json({ error: 'questionIds must be an array' }, { status: 400 })
    }

    // Update order index for each question
    for (let i = 0; i < questionIds.length; i++) {
      await db.question.update({
        where: { id: questionIds[i] },
        data: { orderIndex: i }
      })
    }

    const questions = await db.question.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: 'asc' }
    })

    return NextResponse.json(questions)
  } catch (error) {
    console.error('Error reordering questions:', error)
    return NextResponse.json({ error: 'Failed to reorder questions' }, { status: 500 })
  }
}
