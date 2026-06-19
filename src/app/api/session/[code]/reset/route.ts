import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import { validateSessionCode } from '@/lib/security'

export const dynamic = 'force-dynamic'

// POST /api/session/[code]/reset — Reset session to waiting, clear votes,
// unreveal questions (ADMIN ONLY).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: { questions: { select: { id: true } } },
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
