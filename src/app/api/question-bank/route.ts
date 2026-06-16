import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/question-bank — List all questions in the bank
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const category = url.searchParams.get('category')
    const course = url.searchParams.get('course')
    const search = url.searchParams.get('search')

    const where: Record<string, unknown> = {}

    if (category && category !== 'all') {
      where.category = category
    }
    if (course && course !== 'all') {
      where.course = course
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { text: { contains: search } },
        { tags: { contains: search } },
      ]
    }

    const questions = await db.questionBank.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        year: true,
        course: true,
        correctAnswer: true,
        category: true,
        tags: true,
        altA: true,
        altB: true,
        altC: true,
        altD: true,
        altE: true,
        imageUrl: true,
        createdAt: true,
      },
    })

    // Get categories and courses for filters
    const categories = await db.questionBank.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    })

    const courses = await db.questionBank.findMany({
      select: { course: true },
      distinct: ['course'],
      orderBy: { course: 'asc' },
    })

    return NextResponse.json({
      questions,
      categories: categories.map((c) => c.category),
      courses: courses.map((c) => c.course),
    })
  } catch (error) {
    console.error('Error fetching question bank:', error)
    return NextResponse.json({ error: 'Erro ao buscar banco de questões' }, { status: 500 })
  }
}

// POST /api/question-bank — Create a new question in the bank
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      title,
      text,
      year,
      course,
      altA,
      altB,
      altC,
      altD,
      altE,
      correctAnswer,
      imageUrl,
      category,
      tags,
    } = body

    if (!title || !text || !altA || !altB || !altC || !altD || !correctAnswer) {
      return NextResponse.json(
        { error: 'Título, texto, alternativas A-D e resposta correta são obrigatórios' },
        { status: 400 }
      )
    }

    const question = await db.questionBank.create({
      data: {
        title,
        text,
        year: year || new Date().getFullYear(),
        course: course || 'Formação Geral',
        altA,
        altB,
        altC,
        altD,
        altE: altE || '',
        correctAnswer,
        imageUrl: imageUrl || null,
        category: category || 'Geral',
        tags: tags || '',
      },
    })

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    console.error('Error creating question in bank:', error)
    return NextResponse.json({ error: 'Erro ao criar questão no banco' }, { status: 500 })
  }
}

// DELETE /api/question-bank — Delete a question from the bank
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    await db.questionBank.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting question from bank:', error)
    return NextResponse.json({ error: 'Erro ao excluir questão do banco' }, { status: 500 })
  }
}
