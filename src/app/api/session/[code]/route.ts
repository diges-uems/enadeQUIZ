import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/session/[code] - Get session by code
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
        },
        students: {
          orderBy: { score: 'desc' }
        }
      }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json(session)
  } catch (error) {
    console.error('Error fetching session:', error)
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 })
  }
}

// DELETE /api/session/[code] - Delete session
export async function DELETE(
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

    await db.session.delete({
      where: { id: session.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting session:', error)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}

// PATCH /api/session/[code] - Update session
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    const body = await request.json()
    
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (body.title) updateData.title = body.title
    if (body.status) updateData.status = body.status
    if (body.currentQuestionId !== undefined) updateData.currentQuestionId = body.currentQuestionId

    const updated = await db.session.update({
      where: { id: session.id },
      data: updateData,
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' }
        }
      }
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating session:', error)
    return NextResponse.json({ error: 'Failed to update session' }, { status: 500 })
  }
}
