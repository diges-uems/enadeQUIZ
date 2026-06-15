import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// Votos são mutáveis e em tempo real — nunca cachear no servidor
export const dynamic = 'force-dynamic'

// POST /api/vote - Submit a vote (backup endpoint for non-socket clients)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionCode, questionId, choice, studentId } = body

    if (!sessionCode || !questionId || !choice) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const validChoices = ['A', 'B', 'C', 'D', 'E']
    if (!validChoices.includes(choice)) {
      return NextResponse.json({ error: 'Invalid choice' }, { status: 400 })
    }

    const session = await db.session.findUnique({
      where: { code: sessionCode.toUpperCase() }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const question = await db.question.findUnique({
      where: { id: questionId }
    })

    if (!question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    // Determine if the answer is correct
    const isCorrect = choice === question.correctAnswer

    // Create vote
    const vote = await db.vote.create({
      data: {
        questionId,
        choice,
        isCorrect,
        studentId: studentId || null,
      }
    })

    // Update student score if studentId is provided
    if (studentId) {
      await db.student.update({
        where: { id: studentId },
        data: {
          answers: { increment: 1 },
          ...(isCorrect
            ? { corrects: { increment: 1 }, score: { increment: 1 } }
            : {}),
        },
      })
    }

    // Get total votes for this question
    const votes = await db.vote.findMany({
      where: { questionId }
    })

    const results = {
      A: votes.filter(v => v.choice === 'A').length,
      B: votes.filter(v => v.choice === 'B').length,
      C: votes.filter(v => v.choice === 'C').length,
      D: votes.filter(v => v.choice === 'D').length,
      E: votes.filter(v => v.choice === 'E').length,
      total: votes.length,
    }

    return NextResponse.json({ vote, results }, { status: 201 })
  } catch (error) {
    console.error('Error submitting vote:', error)
    return NextResponse.json({ error: 'Failed to submit vote' }, { status: 500 })
  }
}

// GET /api/vote?questionId=xxx - Get vote results for a question
export async function GET(request: NextRequest) {
  try {
    const questionId = request.nextUrl.searchParams.get('questionId')

    if (!questionId) {
      return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
    }

    const votes = await db.vote.findMany({
      where: { questionId }
    })

    const results = {
      A: votes.filter(v => v.choice === 'A').length,
      B: votes.filter(v => v.choice === 'B').length,
      C: votes.filter(v => v.choice === 'C').length,
      D: votes.filter(v => v.choice === 'D').length,
      E: votes.filter(v => v.choice === 'E').length,
      total: votes.length,
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Error fetching votes:', error)
    return NextResponse.json({ error: 'Failed to fetch votes' }, { status: 500 })
  }
}
