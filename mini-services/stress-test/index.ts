import { createServer } from 'http'

const PORT = 3004

interface StressTestResult {
  totalStudents: number
  connected: number
  voted: number
  failed: number
  durationMs: number
  votesPerSecond: number
  voteDistribution: { A: number; B: number; C: number; D: number; E: number }
  errors: string[]
}

async function runStressTest(params: {
  sessionCode: string
  studentCount: number
  questionId: string
  correctAnswer?: string
}): Promise<StressTestResult> {
  // Dynamic import to avoid loading socket.io-client at module level
  const { io: ioClient } = await import('socket.io-client')

  const { sessionCode, studentCount, questionId, correctAnswer } = params
  const startTime = Date.now()
  const result: StressTestResult = {
    totalStudents: studentCount,
    connected: 0,
    voted: 0,
    failed: 0,
    durationMs: 0,
    votesPerSecond: 0,
    voteDistribution: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    errors: [],
  }

  const altLabels = ['A', 'B', 'C', 'D', 'E'] as const
  const sockets: ReturnType<typeof ioClient>[] = []

  // Connect all students in batches
  const BATCH_SIZE = 50
  const BATCH_DELAY_MS = 100

  try {
    // Phase 1: Connect all students
    for (let i = 0; i < studentCount; i += BATCH_SIZE) {
      const batchEnd = Math.min(i + BATCH_SIZE, studentCount)
      const batchPromises: Promise<void>[] = []

      for (let j = i; j < batchEnd; j++) {
        const studentIndex = j
        batchPromises.push(
          new Promise<void>((resolve) => {
            try {
              const s = ioClient('http://localhost:3003', {
                path: '/',
                transports: ['websocket'],
                forceNew: true,
                reconnection: false,
                timeout: 5000,
              })

              sockets.push(s)

              s.on('connect', () => {
                result.connected++
                s.emit('join-session', {
                  sessionCode,
                  role: 'student',
                  name: `Aluno Stress ${studentIndex + 1}`,
                  rgm: `STRESS-${String(studentIndex + 1).padStart(5, '0')}`,
                })
                resolve()
              })

              s.on('connect_error', (err: Error) => {
                result.failed++
                if (result.errors.length < 10) {
                  result.errors.push(`Student ${studentIndex + 1} connect error: ${err.message}`)
                }
                resolve()
              })

              // Timeout fallback
              setTimeout(() => resolve(), 6000)
            } catch {
              result.failed++
              resolve()
            }
          })
        )
      }

      await Promise.all(batchPromises)

      if (batchEnd < studentCount) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    // Phase 2: Submit votes with realistic random distribution
    const VOTE_BATCH_SIZE = 100
    const VOTE_BATCH_DELAY_MS = 50

    for (let i = 0; i < studentCount; i += VOTE_BATCH_SIZE) {
      const batchEnd = Math.min(i + VOTE_BATCH_SIZE, studentCount)
      const votePromises: Promise<void>[] = []

      for (let j = i; j < batchEnd; j++) {
        const s = sockets[j]
        if (!s || !s.connected) {
          result.failed++
          continue
        }

        votePromises.push(
          new Promise<void>((resolve) => {
            try {
              let choice: string
              const rand = Math.random()
              if (correctAnswer && rand < 0.30) {
                choice = correctAnswer
              } else {
                const wrongOptions = altLabels.filter((a) => a !== correctAnswer)
                choice = wrongOptions[Math.floor(Math.random() * wrongOptions.length)]
              }

              // Random delay to simulate realistic behavior (0-500ms)
              const delay = Math.random() * 500

              setTimeout(() => {
                s.emit('submit-vote', {
                  sessionCode,
                  questionId,
                  choice,
                  correctAnswer: correctAnswer || undefined,
                  studentId: `STRESS-${String(j + 1).padStart(5, '0')}`,
                })

                result.voted++
                result.voteDistribution[choice as keyof typeof result.voteDistribution]++

                // Small delay then disconnect
                setTimeout(() => {
                  s.disconnect()
                  resolve()
                }, 200)
              }, delay)

              // Timeout fallback
              setTimeout(() => resolve(), 2000)
            } catch {
              result.failed++
              resolve()
            }
          })
        )
      }

      await Promise.all(votePromises)

      if (batchEnd < studentCount) {
        await new Promise((r) => setTimeout(r, VOTE_BATCH_DELAY_MS))
      }
    }

    result.durationMs = Date.now() - startTime
    result.votesPerSecond =
      result.durationMs > 0 ? Math.round((result.voted / result.durationMs) * 1000) : 0

    // Cleanup
    for (const s of sockets) {
      try {
        if (s.connected) s.disconnect()
      } catch {
        // ignore
      }
    }

    return result
  } catch (error) {
    for (const s of sockets) {
      try {
        if (s.connected) s.disconnect()
      } catch {
        // ignore
      }
    }

    result.durationMs = Date.now() - startTime
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown'}`)
    return result
  }
}

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/') {
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }

    try {
      const params = JSON.parse(body)
      if (!params.sessionCode || !params.questionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'sessionCode and questionId are required' }))
        return
      }

      const result = await runStressTest({
        sessionCode: params.sessionCode,
        studentCount: params.studentCount || 1000,
        questionId: params.questionId,
        correctAnswer: params.correctAnswer,
      })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }))
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`Stress Test service running on port ${PORT}`)
})
