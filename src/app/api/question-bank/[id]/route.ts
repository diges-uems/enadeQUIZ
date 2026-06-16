import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/question-bank/[id] — Get a single question from bank with full text
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const question = await db.questionBank.findUnique({ where: { id } })

    if (!question) {
      return NextResponse.json({ error: 'Questão não encontrada' }, { status: 404 })
    }

    return NextResponse.json(question)
  } catch (error) {
    console.error('Error fetching question from bank:', error)
    return NextResponse.json({ error: 'Erro ao buscar questão' }, { status: 500 })
  }
}

// PUT /api/question-bank/[id] — Update a question in the bank
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const question = await db.questionBank.update({
      where: { id },
      data: body,
    })

    return NextResponse.json(question)
  } catch (error) {
    console.error('Error updating question in bank:', error)
    return NextResponse.json({ error: 'Erro ao atualizar questão' }, { status: 500 })
  }
}

// DELETE /api/question-bank/[id] — Delete a question from the bank
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await db.questionBank.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting question from bank:', error)
    return NextResponse.json({ error: 'Erro ao excluir questão' }, { status: 500 })
  }
}
