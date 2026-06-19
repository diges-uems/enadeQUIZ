import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateCuid,
  validateChoice,
} from '@/lib/security'

const MAX_TITLE = 200
const MAX_TEXT = 10_000
const MAX_ALT = 1_000

// GET /api/question-bank — List all questions in the bank (PUBLIC).
//
// Public so the admin panel can preview questions; the data is
// non-sensitive (ENADE-style question stems and alternatives).
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const category = url.searchParams.get('category')
    const course = url.searchParams.get('course')
    const search = url.searchParams.get('search')

    const where: Record<string, unknown> = {}

    if (category && category !== 'all') {
      where.category = sanitizeString(category, 100)
    }
    if (course && course !== 'all') {
      where.course = sanitizeString(course, 100)
    }
    if (search) {
      const s = sanitizeString(search, 200)
      where.OR = [
        { title: { contains: s } },
        { text: { contains: s } },
        { tags: { contains: s } },
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

// POST /api/question-bank — Create a new question in the bank (ADMIN ONLY).
export async function POST(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bodyResult = await isSafeJsonBody(req)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as {
      title?: unknown
      text?: unknown
      year?: unknown
      course?: unknown
      altA?: unknown
      altB?: unknown
      altC?: unknown
      altD?: unknown
      altE?: unknown
      correctAnswer?: unknown
      imageUrl?: unknown
      category?: unknown
      tags?: unknown
    }

    const title = sanitizeString(body.title, MAX_TITLE)
    const text = sanitizeString(body.text, MAX_TEXT)
    const altA = sanitizeString(body.altA, MAX_ALT)
    const altB = sanitizeString(body.altB, MAX_ALT)
    const altC = sanitizeString(body.altC, MAX_ALT)
    const altD = sanitizeString(body.altD, MAX_ALT)
    const altE = sanitizeString(body.altE, MAX_ALT)

    if (title.length < 1) {
      return NextResponse.json(
        { error: 'Título é obrigatório (1-200 caracteres).' },
        { status: 400 }
      )
    }
    if (text.length < 1) {
      return NextResponse.json(
        { error: 'Texto é obrigatório (1-10000 caracteres).' },
        { status: 400 }
      )
    }
    if (altA.length < 1 || altB.length < 1 || altC.length < 1 || altD.length < 1) {
      return NextResponse.json(
        { error: 'Alternativas A-D são obrigatórias.' },
        { status: 400 }
      )
    }
    if (!validateChoice(body.correctAnswer)) {
      return NextResponse.json(
        { error: 'correctAnswer deve ser A, B, C, D ou E.' },
        { status: 400 }
      )
    }

    const year =
      typeof body.year === 'number' && Number.isFinite(body.year)
        ? Math.trunc(body.year)
        : new Date().getFullYear()
    const course = sanitizeString(body.course, 200) || 'Formação Geral'
    const imageUrl =
      typeof body.imageUrl === 'string' && body.imageUrl.trim().length > 0
        ? sanitizeString(body.imageUrl, 500)
        : null
    const category = sanitizeString(body.category, 100) || 'Geral'
    const tags = sanitizeString(body.tags, 500)

    const question = await db.questionBank.create({
      data: {
        title,
        text,
        year,
        course,
        altA,
        altB,
        altC,
        altD,
        altE,
        correctAnswer: body.correctAnswer as 'A' | 'B' | 'C' | 'D' | 'E',
        imageUrl,
        category,
        tags,
      },
    })

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    console.error('Error creating question in bank:', error)
    return NextResponse.json({ error: 'Erro ao criar questão no banco' }, { status: 500 })
  }
}

// DELETE /api/question-bank?id=... — Delete a question from the bank (ADMIN ONLY).
export async function DELETE(req: NextRequest) {
  try {
    if (!verifyAdminAuth(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!validateCuid(id)) {
      return NextResponse.json(
        { error: 'ID inválido (cuid esperado).' },
        { status: 400 }
      )
    }

    await db.questionBank.delete({ where: { id: (id as string).trim() } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting question from bank:', error)
    return NextResponse.json({ error: 'Erro ao excluir questão do banco' }, { status: 500 })
  }
}
