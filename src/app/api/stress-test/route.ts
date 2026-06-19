import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import {
  isSafeJsonBody,
  sanitizeString,
  validateChoice,
  validateQuestionId,
  validateSessionCode,
} from '@/lib/security'

export const maxDuration = 90
export const dynamic = 'force-dynamic'

const VALID_SCENARIOS = [
  'normal',
  'flood',
  'bad-presenter',
  'bad-input',
  'long-lived',
  'mixed',
] as const
type Scenario = (typeof VALID_SCENARIOS)[number]

const MAX_STUDENT_COUNT = 5000

interface StressTestBody {
  sessionCode?: unknown
  studentCount?: unknown
  questionId?: unknown
  correctAnswer?: unknown
  scenario?: unknown
  dryRun?: unknown
}

// POST /api/stress-test — Proxy to the standalone stress-test service on
// port 3004 (ADMIN ONLY).
//
// Hardened (Task 5-b):
//   - Admin token required (the stress test can spawn up to 5000 students and
//     should not be triggerable by random callers).
//   - 1 MB body cap.
//   - Validates sessionCode, questionId, correctAnswer.
//   - Caps studentCount to 5000 to prevent abuse via the proxy.
//
// Extended (Task 5-c):
//   - Forwards `scenario` field (normal | flood | bad-presenter | bad-input |
//     long-lived | mixed) to the stress-test service.
//   - Forwards `dryRun` flag (validates params and returns without running).
export async function POST(request: NextRequest) {
  try {
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const bodyResult = await isSafeJsonBody(request)
    if (!bodyResult.ok) {
      return NextResponse.json(
        { error: bodyResult.error || 'Invalid request.' },
        { status: bodyResult.status || 400 }
      )
    }
    const body = (bodyResult.data || {}) as StressTestBody

    if (!validateSessionCode(body.sessionCode)) {
      return NextResponse.json(
        { error: 'sessionCode is required (6-char A-Z0-9).' },
        { status: 400 }
      )
    }
    if (!validateQuestionId(body.questionId)) {
      return NextResponse.json(
        { error: 'questionId is required (cuid).' },
        { status: 400 }
      )
    }
    // correctAnswer is optional — but if provided, must be A-E.
    if (body.correctAnswer !== undefined && body.correctAnswer !== null) {
      if (!validateChoice(body.correctAnswer)) {
        return NextResponse.json(
          { error: 'correctAnswer must be one of A-E.' },
          { status: 400 }
        )
      }
    }

    // Validate scenario if provided.
    let scenario: Scenario = 'normal'
    if (body.scenario !== undefined && body.scenario !== null) {
      if (
        typeof body.scenario !== 'string' ||
        !VALID_SCENARIOS.includes(body.scenario as Scenario)
      ) {
        return NextResponse.json(
          {
            error: `scenario must be one of: ${VALID_SCENARIOS.join(', ')}.`,
          },
          { status: 400 }
        )
      }
      scenario = body.scenario as Scenario
    }

    // Parse + cap studentCount (max 5000).
    let studentCount = 1000
    if (body.studentCount !== undefined && body.studentCount !== null) {
      const n =
        typeof body.studentCount === 'number'
          ? body.studentCount
          : Number(body.studentCount)
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          { error: 'studentCount must be a positive number.' },
          { status: 400 }
        )
      }
      studentCount = Math.min(Math.trunc(n), MAX_STUDENT_COUNT)
    }

    // dryRun is optional (default false).
    const dryRun = body.dryRun === true

    try {
      const stressRes = await fetch('http://localhost:3004/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sanitizeString(body.sessionCode, 20).toUpperCase(),
          studentCount,
          questionId: (body.questionId as string).trim(),
          correctAnswer:
            typeof body.correctAnswer === 'string'
              ? (body.correctAnswer as string).toUpperCase()
              : undefined,
          scenario,
          dryRun,
        }),
      })

      const data = await stressRes.json()
      return NextResponse.json(data, { status: stressRes.status })
    } catch (error) {
      console.error('Stress test proxy error:', error)
      return NextResponse.json(
        {
          error:
            'Stress test service unavailable. Make sure the service is running on port 3004.',
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('Stress test route error:', error)
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    )
  }
}
