import { db } from '@/lib/db'
import { generateSessionCode } from '@/lib/session'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/session - List all sessions
export async function GET() {
  try {
    const sessions = await db.session.findMany({
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}

// POST /api/session - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title } = body

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Generate unique code
    let code = generateSessionCode()
    let exists = await db.session.findUnique({ where: { code } })
    while (exists) {
      code = generateSessionCode()
      exists = await db.session.findUnique({ where: { code } })
    }

    const session = await db.session.create({
      data: {
        code,
        title: title.trim(),
        status: 'waiting',
      },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    })

    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    console.error('Error creating session:', error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
