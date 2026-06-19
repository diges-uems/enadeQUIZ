import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateChoice,
  validateSessionCode,
} from '@/lib/security'

/* ── Validation helpers ──────────────────────────────────────────── */

const MAX_QUESTIONS_PER_IMPORT = 100
const MAX_QUESTION_TEXT = 10_000
const MAX_ALT_TEXT = 1_000

interface ParsedQuestion {
  text: string
  year: number
  course: string
  altA: string
  altB: string
  altC: string
  altD: string
  altE: string
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E'
  imageUrl: string | null
}

interface SingleQuestionBody {
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
}

/**
 * Validate + sanitise a single question object. Returns either
 * `{ ok: true, value: ParsedQuestion }` or `{ ok: false, error }`.
 *
 * Used both for the single-question POST and for each item of a bulk
 * import array.
 */
function parseQuestion(input: unknown): { ok: true; value: ParsedQuestion } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Invalid question object.' }
  }

  // Bulk-import shape: { text, alternatives: { A, B, C, D, E? }, correctAnswer, year?, course?, imageUrl? }
  const maybeBulk = input as SingleQuestionBody & {
    alternatives?: Record<string, unknown>
  }

  // Detect bulk-import shape (has `alternatives` map).
  if (maybeBulk.alternatives && typeof maybeBulk.alternatives === 'object') {
    const alts = maybeBulk.alternatives as {
      A?: unknown
      B?: unknown
      C?: unknown
      D?: unknown
      E?: unknown
    }
    const text = sanitizeString(maybeBulk.text, MAX_QUESTION_TEXT)
    if (text.length < 1) {
      return { ok: false, error: 'Question text is required (1-10000 chars).' }
    }
    const altA = sanitizeString(alts.A, MAX_ALT_TEXT)
    const altB = sanitizeString(alts.B, MAX_ALT_TEXT)
    const altC = sanitizeString(alts.C, MAX_ALT_TEXT)
    const altD = sanitizeString(alts.D, MAX_ALT_TEXT)
    const altE = sanitizeString(alts.E, MAX_ALT_TEXT)
    if (altA.length < 1 || altB.length < 1 || altC.length < 1 || altD.length < 1) {
      return { ok: false, error: 'Alternatives A-D are required (1-1000 chars each).' }
    }
    if (!validateChoice(maybeBulk.correctAnswer)) {
      return { ok: false, error: 'correctAnswer must be one of A-E.' }
    }
    const yearNum =
      typeof maybeBulk.year === 'number' && Number.isFinite(maybeBulk.year)
        ? maybeBulk.year
        : new Date().getFullYear()
    const course = sanitizeString(maybeBulk.course, 200) || 'Formação Geral'
    const imageUrl =
      typeof maybeBulk.imageUrl === 'string' && maybeBulk.imageUrl.trim().length > 0
        ? sanitizeString(maybeBulk.imageUrl, 500)
        : null

    return {
      ok: true,
      value: {
        text,
        year: yearNum,
        course,
        altA,
        altB,
        altC,
        altD,
        altE,
        correctAnswer: maybeBulk.correctAnswer as 'A' | 'B' | 'C' | 'D' | 'E',
        imageUrl,
      },
    }
  }

  // Single-question shape: { text, altA, altB, altC, altD, altE?, correctAnswer, year?, course?, imageUrl? }
  const text = sanitizeString(maybeBulk.text, MAX_QUESTION_TEXT)
  if (text.length < 1) {
    return { ok: false, error: 'Question text is required (1-10000 chars).' }
  }
  const altA = sanitizeString(maybeBulk.altA, MAX_ALT_TEXT)
  const altB = sanitizeString(maybeBulk.altB, MAX_ALT_TEXT)
  const altC = sanitizeString(maybeBulk.altC, MAX_ALT_TEXT)
  const altD = sanitizeString(maybeBulk.altD, MAX_ALT_TEXT)
  const altE = sanitizeString(maybeBulk.altE, MAX_ALT_TEXT)
  if (altA.length < 1 || altB.length < 1 || altC.length < 1 || altD.length < 1) {
    return { ok: false, error: 'Alternatives A-D are required (1-1000 chars each).' }
  }
  if (!validateChoice(maybeBulk.correctAnswer)) {
    return { ok: false, error: 'correctAnswer must be one of A-E.' }
  }
  const yearNum =
    typeof maybeBulk.year === 'number' && Number.isFinite(maybeBulk.year)
      ? maybeBulk.year
      : new Date().getFullYear()
  const course = sanitizeString(maybeBulk.course, 200) || 'Formação Geral'
  const imageUrl =
    typeof maybeBulk.imageUrl === 'string' && maybeBulk.imageUrl.trim().length > 0
      ? sanitizeString(maybeBulk.imageUrl, 500)
      : null

  return {
    ok: true,
    value: {
      text,
      year: yearNum,
      course,
      altA,
      altB,
      altC,
      altD,
      altE,
      correctAnswer: maybeBulk.correctAnswer as 'A' | 'B' | 'C' | 'D' | 'E',
      imageUrl,
    },
  }
}

/* ── Route handlers ──────────────────────────────────────────────── */

// GET /api/session/[code]/questions — List questions for a session (PUBLIC).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400 }
      )
    }
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const questions = await db.question.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: 'asc' },
    })

    return NextResponse.json(questions)
  } catch (error) {
    console.error('Error fetching questions:', error)
    return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
  }
}

// POST /api/session/[code]/questions — Add a question (ADMIN ONLY).
//
// Accepts either:
//   - A single question object ({ text, altA, altB, ... }) — legacy
//     single-question create.
//   - An array of question objects (bulk import) — capped at
//     MAX_QUESTIONS_PER_IMPORT (100) per request.
//
// Hardened:
//   - Admin token required.
//   - 1 MB body cap (defends against huge bulk imports).
//   - Per-question field validation (text 1-10k, alternatives 1-1k each,
//     correctAnswer A-E).
//   - Bulk array length capped at 100.
//   - Rejects if session not found OR status === 'finished'.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: { questions: { orderBy: { orderIndex: 'asc' }, select: { orderIndex: true } } },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.status === 'finished') {
      return NextResponse.json(
        { error: 'Cannot add questions to a finished session.' },
        { status: 403 }
      )
    }

    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }

    // ── Bulk import path ──
    if (Array.isArray(bodyResult.data)) {
      const arr = bodyResult.data
      if (arr.length === 0) {
        return NextResponse.json(
          { error: 'Empty questions array.' },
          { status: 400 }
        )
      }
      if (arr.length > MAX_QUESTIONS_PER_IMPORT) {
        return NextResponse.json(
          {
            error: `Too many questions in a single request (max ${MAX_QUESTIONS_PER_IMPORT}).`,
          },
          { status: 413 }
        )
      }

      const parsed: ParsedQuestion[] = []
      for (let i = 0; i < arr.length; i++) {
        const r = parseQuestion(arr[i])
        if (!r.ok) {
          return NextResponse.json(
            { error: `Question ${i + 1}: ${r.error}` },
            { status: 400 }
          )
        }
        parsed.push(r.value)
      }

      const nextIndex = session.questions.length
      const created = []
      for (let i = 0; i < parsed.length; i++) {
        const q = parsed[i]
        const question = await db.question.create({
          data: {
            sessionId: session.id,
            text: q.text,
            year: q.year,
            course: q.course,
            altA: q.altA,
            altB: q.altB,
            altC: q.altC,
            altD: q.altD,
            altE: q.altE,
            correctAnswer: q.correctAnswer,
            imageUrl: q.imageUrl,
            orderIndex: nextIndex + i,
          },
        })
        created.push(question)
      }

      return NextResponse.json(created, { status: 201 })
    }

    // ── Single-question path ──
    const r = parseQuestion(bodyResult.data)
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: 400 })
    }
    const q = r.value

    const nextIndex = session.questions.length
    const question = await db.question.create({
      data: {
        sessionId: session.id,
        text: q.text,
        year: q.year,
        course: q.course,
        altA: q.altA,
        altB: q.altB,
        altC: q.altC,
        altD: q.altD,
        altE: q.altE,
        correctAnswer: q.correctAnswer,
        imageUrl: q.imageUrl,
        orderIndex: nextIndex,
      },
    })

    return NextResponse.json(question, { status: 201 })
  } catch (error) {
    console.error('Error creating question:', error)
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 })
  }
}

// PUT /api/session/[code]/questions — Reorder questions (ADMIN ONLY).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400 }
      )
    }

    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    })
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as { questionIds?: unknown }

    if (!Array.isArray(body.questionIds)) {
      return NextResponse.json(
        { error: 'questionIds must be an array' },
        { status: 400 }
      )
    }
    // Cap to prevent abuse — no session has >1000 questions.
    if (body.questionIds.length > 1000) {
      return NextResponse.json(
        { error: 'Too many questionIds (max 1000).' },
        { status: 413 }
      )
    }

    // Validate each id is a string. (CUID check skipped intentionally —
    // Prisma will simply not match unknown ids and the reorder will be
    // a no-op for them.)
    const questionIds: string[] = []
    for (const id of body.questionIds) {
      if (typeof id !== 'string' || id.trim().length === 0) {
        return NextResponse.json(
          { error: 'questionIds must contain only non-empty strings.' },
          { status: 400 }
        )
      }
      questionIds.push(id.trim())
    }

    for (let i = 0; i < questionIds.length; i++) {
      await db.question.update({
        where: { id: questionIds[i] },
        data: { orderIndex: i },
      })
    }

    const questions = await db.question.findMany({
      where: { sessionId: session.id },
      orderBy: { orderIndex: 'asc' },
    })

    return NextResponse.json(questions)
  } catch (error) {
    console.error('Error reordering questions:', error)
    return NextResponse.json({ error: 'Failed to reorder questions' }, { status: 500 })
  }
}
