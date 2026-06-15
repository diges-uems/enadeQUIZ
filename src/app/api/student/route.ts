import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/student - Register a student in a session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionCode, name, rgm } = body

    if (!sessionCode || !name || !rgm) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionCode, name, rgm' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: sessionCode.toUpperCase() },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Check if student already exists (unique constraint on sessionId+rgm)
    const existing = await db.student.findUnique({
      where: {
        sessionId_rgm: {
          sessionId: session.id,
          rgm: String(rgm),
        },
      },
    })

    if (existing) {
      // Return existing student
      return NextResponse.json({ student: existing, isNew: false })
    }

    // Create new student
    const student = await db.student.create({
      data: {
        sessionId: session.id,
        name: name.trim(),
        rgm: String(rgm),
      },
    })

    return NextResponse.json({ student, isNew: true }, { status: 201 })
  } catch (error) {
    console.error('Error registering student:', error)
    return NextResponse.json(
      { error: 'Failed to register student' },
      { status: 500 }
    )
  }
}

// GET /api/student?sessionCode=XXX - Get students for a session
export async function GET(request: NextRequest) {
  try {
    const sessionCode = request.nextUrl.searchParams.get('sessionCode')

    if (!sessionCode) {
      return NextResponse.json(
        { error: 'sessionCode is required' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: sessionCode.toUpperCase() },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const students = await db.student.findMany({
      where: { sessionId: session.id },
      orderBy: { score: 'desc' },
    })

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error fetching students:', error)
    return NextResponse.json(
      { error: 'Failed to fetch students' },
      { status: 500 }
    )
  }
}
