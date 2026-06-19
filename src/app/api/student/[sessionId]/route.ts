import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import { validateCuid } from '@/lib/security'

export const dynamic = 'force-dynamic'

// GET /api/student/[sessionId] — Get all students for a session, ordered by
// score desc.
//
// Admin-only: this endpoint accepts a raw Prisma sessionId rather than
// a session code, which makes it useful for admin tooling but also
// means it should not be exposed to students (who only know codes).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    // Admin auth — must come first.
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId } = await params
    if (!validateCuid(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid sessionId' },
        { status: 400 }
      )
    }

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
