import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import {
  isSafeJsonBody,
  validateChoice,
  validateQuestionId,
  validateSessionCode,
} from '@/lib/security'
import {
  getClientIP,
  rateLimit,
  rateLimitKey,
  RATE_LIMITS,
} from '@/lib/rate-limit'

// Votos são mutáveis e em tempo real — nunca cachear no servidor
export const dynamic = 'force-dynamic'

interface VoteRequestBody {
  sessionCode?: unknown
  questionId?: unknown
  choice?: unknown
  studentId?: unknown
}

// POST /api/vote — Submit a vote (backup endpoint for non-socket clients).
//
// Hardened:
//   - 30 votes / minute / IP.
//   - Validates sessionCode (6-char A-Z0-9), questionId (cuid),
//     choice (A-E).
//   - Rejects votes on finished sessions.
//   - Rejects votes on already-revealed questions (no take-backs once
//     the answer is shown).
//   - 1 MB body cap (via isSafeJsonBody).
//   - try/catch that never leaks stack traces in the response.
export async function POST(request: NextRequest) {
  try {
    // 1) Rate limit.
    const ip = getClientIP(request)
    const rlKey = rateLimitKey(ip, 'vote')
    const rl = rateLimit(rlKey, RATE_LIMITS.vote.limit, RATE_LIMITS.vote.windowMs)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many votes. Please slow down.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rl.retryAfter / 1000)) },
        }
      )
    }

    // 2) Parse body.
    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as VoteRequestBody

    // 3) Validate fields.
    if (!validateSessionCode(body.sessionCode)) {
      return NextResponse.json({ error: 'Invalid sessionCode' }, { status: 400 })
    }
    if (!validateQuestionId(body.questionId)) {
      return NextResponse.json({ error: 'Invalid questionId' }, { status: 400 })
    }
    if (!validateChoice(body.choice)) {
      return NextResponse.json({ error: 'Invalid choice (must be A, B, C, D or E)' }, { status: 400 })
    }

    const sessionCode = (body.sessionCode as string).toUpperCase()
    const questionId = (body.questionId as string).trim()
    const choice = (body.choice as 'A' | 'B' | 'C' | 'D' | 'E').toUpperCase()
    // studentId is optional — only validate when provided.
    const studentIdRaw = body.studentId
    const studentId =
      typeof studentIdRaw === 'string' && studentIdRaw.trim().length > 0
        ? studentIdRaw.trim()
        : null

    // 4) Fetch session.
    const session = await db.session.findUnique({
      where: { code: sessionCode },
    })
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    // Reject votes on finished sessions.
    if (session.status === 'finished') {
      return NextResponse.json(
        { error: 'Session is finished — voting is closed.' },
        { status: 403 }
      )
    }

    // 5) Fetch question + verify it belongs to the session.
    const question = await db.question.findUnique({
      where: { id: questionId },
    })
    if (!question || question.sessionId !== session.id) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }
    // Reject votes on already-revealed questions.
    if (question.isRevealed) {
      return NextResponse.json(
        { error: 'Answer already revealed — voting is closed for this question.' },
        { status: 403 }
      )
    }

    // 6) Determine correctness + persist the vote.
    const isCorrect = choice === question.correctAnswer
    const vote = await db.vote.create({
      data: {
        questionId,
        choice,
        isCorrect,
        studentId,
      },
    })

    // Update student score if a studentId was provided AND the student
    // actually exists in this session. (Avoids a Prisma error if the
    // caller passed a bogus ID.)
    if (studentId) {
      try {
        const updated = await db.student.updateMany({
          where: { id: studentId, sessionId: session.id },
          data: {
            answers: { increment: 1 },
            ...(isCorrect
              ? { corrects: { increment: 1 }, score: { increment: 1 } }
              : {}),
          },
        })
        // If no rows were updated, the studentId doesn't belong to this
        // session — that's fine, we just skip the score update. The
        // vote itself is still recorded.
        void updated
      } catch (err) {
        // Non-fatal: log and move on. The vote is already persisted.
        console.error('Failed to update student score:', err)
      }
    }

    // 7) Tally results.
    const votes = await db.vote.findMany({ where: { questionId } })
    const results = {
      A: votes.filter((v) => v.choice === 'A').length,
      B: votes.filter((v) => v.choice === 'B').length,
      C: votes.filter((v) => v.choice === 'C').length,
      D: votes.filter((v) => v.choice === 'D').length,
      E: votes.filter((v) => v.choice === 'E').length,
      total: votes.length,
    }

    return NextResponse.json({ vote, results }, { status: 201 })
  } catch (error) {
    console.error('Error submitting vote:', error)
    return NextResponse.json({ error: 'Failed to submit vote' }, { status: 500 })
  }
}

// GET /api/vote?questionId=xxx — Get vote results for a question (public).
export async function GET(request: NextRequest) {
  try {
    const questionId = request.nextUrl.searchParams.get('questionId')
    if (!validateQuestionId(questionId)) {
      return NextResponse.json(
        { error: 'Invalid questionId' },
        { status: 400 }
      )
    }

    const votes = await db.vote.findMany({ where: { questionId } })
    const results = {
      A: votes.filter((v) => v.choice === 'A').length,
      B: votes.filter((v) => v.choice === 'B').length,
      C: votes.filter((v) => v.choice === 'C').length,
      D: votes.filter((v) => v.choice === 'D').length,
      E: votes.filter((v) => v.choice === 'E').length,
      total: votes.length,
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('Error fetching votes:', error)
    return NextResponse.json({ error: 'Failed to fetch votes' }, { status: 500 })
  }
}
