import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// PUT /api/session/[code]/questions/[questionId] - Update a question
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; questionId: string }> }
) {
  try {
    const { code, questionId } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const question = await db.question.findUnique({
      where: { id: questionId }
    })

    if (!question || question.sessionId !== session.id) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    const body = await request.json()
    const updateData: Record<string, unknown> = {}

    if (body.text !== undefined) updateData.text = body.text
    if (body.year !== undefined) updateData.year = body.year
    if (body.course !== undefined) updateData.course = body.course
    if (body.altA !== undefined) updateData.altA = body.altA
    if (body.altB !== undefined) updateData.altB = body.altB
    if (body.altC !== undefined) updateData.altC = body.altC
    if (body.altD !== undefined) updateData.altD = body.altD
    if (body.altE !== undefined) updateData.altE = body.altE
    if (body.correctAnswer !== undefined) updateData.correctAnswer = body.correctAnswer
    if (body.imageUrl !== undefined) updateData.imageUrl = body.imageUrl
    if (body.isRevealed !== undefined) updateData.isRevealed = body.isRevealed
    if (body.orderIndex !== undefined) updateData.orderIndex = body.orderIndex

    const updated = await db.question.update({
      where: { id: questionId },
      data: updateData
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating question:', error)
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 })
  }
}

// DELETE /api/session/[code]/questions/[questionId] - Delete a question
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string; questionId: string }> }
) {
  try {
    const { code, questionId } = await params
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() }
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const question = await db.question.findUnique({
      where: { id: questionId }
    })

    if (!question || question.sessionId !== session.id) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    await db.question.delete({
      where: { id: questionId }
    })

    // Reorder remaining questions
    const remaining = await db.question.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: 'asc' }
    })

    for (let i = 0; i < remaining.length; i++) {
      await db.question.update({
        where: { id: remaining[i].id },
        data: { orderIndex: i }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting question:', error)
    return NextResponse.json({ error: 'Failed to delete question' }, { status: 500 })
  }
}
