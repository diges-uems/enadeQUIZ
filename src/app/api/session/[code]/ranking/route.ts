import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/session/[code]/ranking - Get student ranking for a session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const totalQuestions = session.questions.length

    // Get all students for this session, ordered by score desc then corrects desc
    const students = await db.student.findMany({
      where: { sessionId: session.id },
      orderBy: [
        { corrects: 'desc' },
        { answers: 'asc' }, // fewer answers with same corrects = better
      ],
      take: 10, // Top 10 max, but we'll show top 3
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
