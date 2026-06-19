import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { validateSessionCode } from '@/lib/security'

// GET /api/session/[code]/ranking — Get student ranking for a session (PUBLIC).
//
// Public so the votar page can show "top 3" after a session ends.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400 }
      )
    }
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: { id: true },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const totalQuestions = session.questions.length

    const students = await db.student.findMany({
      where: { sessionId: session.id },
      orderBy: [
        { corrects: 'desc' },
        { answers: 'asc' },
      ],
      take: 10,
    })

    const ranking = students.map((student, index) => ({
      position: index + 1,
      name: student.name,
      rgm: student.rgm,
      score: student.corrects,
      totalQuestions,
      answers: student.answers,
      corrects: student.corrects,
    }))

    return NextResponse.json({ ranking, totalQuestions })
  } catch (error) {
    console.error('Error fetching ranking:', error)
    return NextResponse.json({ error: 'Failed to fetch ranking' }, { status: 500 })
  }
}
