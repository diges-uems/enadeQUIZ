import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/session/[code]/reset - Reset session to waiting, clear votes, unreveal questions
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: { questions: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Delete all votes for this session's questions
    if (session.questions.length > 0) {
      await db.vote.deleteMany({
        where: {
          questionId: { in: session.questions.map((q) => q.id) },
        },
      })
    }

    // Reset all questions' isRevealed to false
    await db.question.updateMany({
      where: { sessionId: session.id },
      data: { isRevealed: false },
    })

    // Reset session status and currentQuestionId
    const updated = await db.session.update({
      where: { id: session.id },
      data: {
        status: 'waiting',
        currentQuestionId: null,
      },
      include: {
        questions: { orderBy: { orderIndex: 'asc' } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error resetting session:', error)
    return NextResponse.json({ error: 'Failed to reset session' }, { status: 500 })
  }
}
