import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { sessionCode, studentCount = 1000, questionId, correctAnswer } = body as {
    sessionCode: string
    studentCount?: number
    questionId?: string
    correctAnswer?: string
  }

  if (!sessionCode) {
    return NextResponse.json({ error: 'sessionCode is required' }, { status: 400 })
  }

  if (!questionId) {
    return NextResponse.json({ error: 'questionId is required' }, { status: 400 })
  }

  try {
    // Forward to the standalone stress-test service on port 3004
    const stressRes = await fetch('http://localhost:3004/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionCode,
        studentCount,
        questionId,
        correctAnswer,
      }),
    })

    const data = await stressRes.json()
    return NextResponse.json(data, { status: stressRes.status })
  } catch (error) {
    console.error('Stress test proxy error:', error)
    return NextResponse.json(
      { error: 'Stress test service unavailable. Make sure the service is running on port 3004.' },
      { status: 503 }
    )
  }
}
