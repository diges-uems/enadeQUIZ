import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/student/[sessionId] - Get all students for a session, ordered by score desc
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params

    const students = await db.student.findMany({
      where: { sessionId },
      orderBy: { score: 'desc' },
    })

    return NextResponse.json(students)
  } catch (error) {
    console.error('Error fetching students:', error)
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}
