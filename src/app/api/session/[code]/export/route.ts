import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/api-auth'
import { validateSessionCode } from '@/lib/security'

// CSV exports never cache — they reflect live DB state at request time.
export const dynamic = 'force-dynamic'

/* ── CSV helpers ──────────────────────────────────────────────────── */

/**
 * Escape a single CSV field per RFC 4180:
 *   - Wrap the field in double quotes.
 *   - Double any internal double quotes.
 *
 * We always quote every field for predictability (Excel, Google Sheets,
 * LibreOffice all handle this correctly).
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '""'
  const s = String(value)
  // Double up any internal double quotes.
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * Build a single CSV row from an array of fields. Uses CRLF line
 * endings per RFC 4180 (Excel is happiest with this).
 */
function csvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(csvEscape).join(',') + '\r\n'
}

/* ── Route handler ────────────────────────────────────────────────── */

// GET /api/session/[code]/export?format=csv — Export session results
// as a CSV file (ADMIN ONLY).
//
// Returns a CSV with:
//   - One row per student (RGM, Nome, Score, Acertos, Total Respondidas,
//     % Aproveitamento).
//   - Three columns per question (ordered by orderIndex): the student's
//     answer, the gabarito (correct answer), and whether the student got
//     it right.
//
// The response is UTF-8 with a BOM (Excel compatibility) and is served
// with Content-Disposition: attachment so browsers prompt a download.
//
// If the session has no students, we still return a valid CSV with just
// the header row (useful for templates / previews).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // 1) Auth — admin only.
    if (!verifyAdminAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2) Validate code.
    const { code } = await params
    if (!validateSessionCode(code)) {
      return NextResponse.json(
        { error: 'Invalid session code' },
        { status: 400 }
      )
    }

    // 3) Format check — currently only CSV is supported. We accept the
    //    query param for forward-compatibility (future: xlsx, pdf, etc.).
    const format =
      request.nextUrl.searchParams.get('format')?.toLowerCase() || 'csv'
    if (format !== 'csv') {
      return NextResponse.json(
        { error: `Unsupported format: ${format}. Supported: csv.` },
        { status: 400 }
      )
    }

    // 4) Fetch session + questions + students in a single round-trip.
    const session = await db.session.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            correctAnswer: true,
          },
        },
        students: {
          orderBy: [{ corrects: 'desc' }, { answers: 'asc' }],
        },
      },
    })

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // 5) Fetch every vote cast by every student in this session in one
    //    query, then build a lookup map: studentId -> questionId -> choice.
    //
    //    This is much cheaper than one query per student. We only need
    //    the rows where studentId is non-null (anonymous votes don't
    //    belong to any student row).
    const studentIds = session.students.map((s) => s.id)
    const votes = studentIds.length
      ? await db.vote.findMany({
          where: {
            studentId: { in: studentIds },
            question: { sessionId: session.id },
          },
          select: {
            studentId: true,
            questionId: true,
            choice: true,
          },
        })
      : []

    // studentId -> questionId -> choice
    const voteMap = new Map<string, Map<string, string>>()
    for (const v of votes) {
      if (!v.studentId) continue
      let inner = voteMap.get(v.studentId)
      if (!inner) {
        inner = new Map<string, string>()
        voteMap.set(v.studentId, inner)
      }
      // Last write wins — if a student somehow has two votes for the same
      // question (shouldn't happen with the unique constraint, but the
      // fallback endpoint doesn't enforce it), we take the most recent.
      inner.set(v.questionId, v.choice)
    }

    // 6) Build the CSV.
    const questions = session.questions
    const rows: string[] = []

    // ── Header row ───────────────────────────────────────────────
    const headerFields: string[] = [
      'RGM',
      'Nome',
      'Score',
      'Acertos',
      'Total Respondidas',
      '% Aproveitamento',
    ]
    // Q1 (resposta do aluno) | Q1 (gabarito) | Q1 (correta?) per question
    for (let i = 0; i < questions.length; i++) {
      const n = i + 1
      headerFields.push(`Q${n} (resposta do aluno)`)
      headerFields.push(`Q${n} (gabarito)`)
      headerFields.push(`Q${n} (correta?)`)
    }
    rows.push(csvRow(headerFields))

    // ── Data rows: one per student ───────────────────────────────
    for (const student of session.students) {
      const studentVotes =
        voteMap.get(student.id) ?? new Map<string, string>()
      const answeredCount = studentVotes.size
      const corrects = student.corrects
      const pct =
        answeredCount > 0
          ? ((corrects / answeredCount) * 100).toFixed(1).replace('.', ',') +
            '%'
          : '0,0%'

      const row: Array<string | number> = [
        student.rgm,
        student.name,
        student.score,
        corrects,
        answeredCount,
        pct,
      ]

      for (const q of questions) {
        const studentChoice = studentVotes.get(q.id) // may be undefined
        const gabarito = q.correctAnswer
        let corretaLabel: string
        if (!studentChoice) {
          corretaLabel = '—' // not answered
        } else if (studentChoice === gabarito) {
          corretaLabel = 'Sim'
        } else {
          corretaLabel = 'Não'
        }
        row.push(studentChoice || '—')
        row.push(gabarito)
        row.push(corretaLabel)
      }

      rows.push(csvRow(row))
    }

    // 7) Assemble the final CSV body with a UTF-8 BOM (EF BB BF) so
    //    Excel opens it with the correct encoding for accented chars
    //    (Nome, Aproveitamento, etc.).
    const csvBody = rows.join('')
    const BOM = '\uFEFF'
    const csvWithBom = BOM + csvBody

    // 8) Headers — force a download with a clean filename.
    const filename = `session-${session.code}-results.csv`
    const response = new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        // Hint the byte length so download progress bars are accurate.
        'Content-Length': Buffer.byteLength(csvWithBom, 'utf-8').toString(),
      },
    })

    return response
  } catch (error) {
    console.error('Error exporting session CSV:', error)
    return NextResponse.json(
      { error: 'Failed to export session CSV' },
      { status: 500 }
    )
  }
}
