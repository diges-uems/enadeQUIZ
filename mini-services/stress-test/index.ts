import { createServer } from 'http'

// ─────────────────────────────────────────────────────────────────────────────
// Stress Test service — port 3004
//
// Spawned by `/api/stress-test` (admin-only). Connects N simulated students
// to the ENADE Quiz socket service on port 3003 and exercises the system
// under load. Multiple scenarios are supported, including attacker
// simulations ("bad-presenter", "bad-input", "mixed") that verify the
// security hardening from Tasks 5-a / 5-b holds under load.
//
// Designed to be self-contained: no external deps beyond socket.io-client
// (already a project dep) and Node's http module.
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 3004
const MAX_STUDENTS = 5000
const TEST_TIMEOUT_MS = 90_000 // overall safety timeout — abort if exceeded
const BATCH_SIZE = 100 // connections per batch (was 50 — bumped for speed)
const BATCH_DELAY_MS = 50 // pause between batches
const EMIT_TIMEOUT_MS = 3000 // per-emit ack timeout
const LONG_LIVED_DURATION_MS = 30_000 // long-lived scenario hold time

const SOCKET_URL = 'http://localhost:3003'

type Scenario = 'normal' | 'flood' | 'bad-presenter' | 'bad-input' | 'long-lived' | 'mixed'

const VALID_SCENARIOS: Scenario[] = [
  'normal',
  'flood',
  'bad-presenter',
  'bad-input',
  'long-lived',
  'mixed',
]

interface StressTestResult {
  scenario: Scenario
  totalStudents: number
  connected: number
  voted: number
  failed: number
  durationMs: number
  votesPerSecond: number
  voteDistribution: { A: number; B: number; C: number; D: number; E: number }
  rejectedVotes: number
  presenterBlocked: number
  badInputBlocked: number
  peakConcurrentConnections: number
  avgResponseTimeMs: number
  errors: string[]
  memoryRssMb: number
  dryRun: boolean
  timedOut: boolean
}

interface RunParams {
  sessionCode: string
  studentCount: number
  questionId: string
  correctAnswer?: string
  scenario: Scenario
  dryRun?: boolean
}

const altLabels = ['A', 'B', 'C', 'D', 'E'] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMemMb(): number {
  return Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function pickChoice(correctAnswer?: string): string {
  const rand = Math.random()
  if (correctAnswer && rand < 0.30) return correctAnswer
  const wrong = altLabels.filter((a) => a !== correctAnswer)
  return wrong[Math.floor(Math.random() * wrong.length)]
}

function makeResult(params: RunParams): StressTestResult {
  return {
    scenario: params.scenario,
    totalStudents: params.studentCount,
    connected: 0,
    voted: 0,
    failed: 0,
    durationMs: 0,
    votesPerSecond: 0,
    voteDistribution: { A: 0, B: 0, C: 0, D: 0, E: 0 },
    rejectedVotes: 0,
    presenterBlocked: 0,
    badInputBlocked: 0,
    peakConcurrentConnections: 0,
    avgResponseTimeMs: 0,
    errors: [],
    memoryRssMb: 0,
    dryRun: !!params.dryRun,
    timedOut: false,
  }
}

function pushError(result: StressTestResult, msg: string): void {
  if (result.errors.length < 10) {
    result.errors.push(msg)
  }
}

// Emit an event with an ack callback and a timeout. Returns the ack
// response (or `{ ok: false, error: 'Timeout' }` if no response).
function emitWithAck(
  socket: { emit: (event: string, ...args: unknown[]) => void },
  event: string,
  payload: unknown,
  timeoutMs = EMIT_TIMEOUT_MS
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ ok: false, error: 'Timeout' })
      }
    }, timeoutMs)
    try {
      socket.emit(event, payload, (resp: { ok: boolean; error?: string } | undefined) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(resp || { ok: false, error: 'No response' })
        }
      })
    } catch {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, error: 'Emit failed' })
      }
    }
  })
}

// Connect a single socket, wait for the 'connect' event (or error/timeout),
// then resolve with the socket. The caller is responsible for emitting
// join-session and disconnecting.
type SocketLike = {
  connected: boolean
  on: (event: string, cb: (...args: unknown[]) => void) => void
  emit: (event: string, ...args: unknown[]) => void
  disconnect: () => void
}

function connectOne(ioClient: typeof import('socket.io-client')['io'], idx: number): Promise<{
  socket: SocketLike | null
  error?: string
}> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (sock: SocketLike | null, err?: string) => {
      if (settled) return
      settled = true
      resolve({ socket: sock, error: err })
    }
    try {
      const s = ioClient(SOCKET_URL, {
        path: '/',
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        timeout: 5000,
      }) as unknown as SocketLike

      s.on('connect', () => finish(s))
      s.on('connect_error', (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        try {
          s.disconnect()
        } catch {
          // ignore
        }
        finish(null, msg)
      })

      setTimeout(() => {
        if (!settled) {
          try {
            s.disconnect()
          } catch {
            // ignore
          }
          finish(null, 'connect timeout')
        }
      }, 6000)
    } catch (e) {
      finish(null, e instanceof Error ? e.message : 'Unknown')
    }
  })
}

// ── Metrics aggregator (response time + peak concurrent tracking) ────────────
interface MetricsTracker {
  responseTimes: number[]
  currentConcurrent: number
  peakConcurrent: number
  trackConnect(): void
  trackDisconnect(): void
  recordResponse(ms: number): void
}

function makeTracker(): MetricsTracker {
  return {
    responseTimes: [],
    currentConcurrent: 0,
    peakConcurrent: 0,
    trackConnect() {
      this.currentConcurrent++
      if (this.currentConcurrent > this.peakConcurrent) {
        this.peakConcurrent = this.currentConcurrent
      }
    },
    trackDisconnect() {
      this.currentConcurrent--
    },
    recordResponse(ms: number) {
      this.responseTimes.push(ms)
    },
  }
}

function avgResponseTime(t: MetricsTracker): number {
  if (t.responseTimes.length === 0) return 0
  const sum = t.responseTimes.reduce((a, b) => a + b, 0)
  return Math.round((sum / t.responseTimes.length) * 100) / 100
}

// Connect + join a single student socket. Resolves with the socket on success
// (already joined), null on failure. Updates `result` + tracker.
async function connectAndJoinStudent(
  ioClient: typeof import('socket.io-client')['io'],
  result: StressTestResult,
  tracker: MetricsTracker,
  sessionCode: string,
  idx: number
): Promise<SocketLike | null> {
  tracker.trackConnect()
  const { socket: s, error } = await connectOne(ioClient, idx)
  if (!s) {
    result.failed++
    tracker.trackDisconnect()
    if (error) pushError(result, `Student ${idx + 1} connect error: ${error}`)
    return null
  }
  result.connected++
  // Join the session (no ack available on join-session — just emit and wait
  // briefly for `session-state` to confirm the join landed).
  await new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        resolve()
      }
    }
    s.on('session-state', finish)
    s.on('join-rejected', finish)
    s.on('session-full', finish)
    try {
      s.emit('join-session', {
        sessionCode,
        role: 'student',
        name: `Aluno Stress ${idx + 1}`,
        rgm: `STRESS-${String(idx + 1).padStart(5, '0')}`,
      })
    } catch {
      finish()
    }
    setTimeout(finish, 1000)
  })
  return s
}

function disconnectAll(sockets: (SocketLike | null)[]): void {
  for (const s of sockets) {
    if (s) {
      try {
        s.disconnect()
      } catch {
        // ignore
      }
    }
  }
}

// Connect `count` students in batches of BATCH_SIZE with backoff.
// Returns the successfully connected sockets (some entries may be null).
// `onConnected` is called once per student after join.
async function connectStudentPool(
  ioClient: typeof import('socket.io-client')['io'],
  result: StressTestResult,
  tracker: MetricsTracker,
  sessionCode: string,
  count: number
): Promise<(SocketLike | null)[]> {
  const sockets: (SocketLike | null)[] = new Array(count).fill(null)
  let currentBatch = BATCH_SIZE

  for (let i = 0; i < count; i += currentBatch) {
    const batchEnd = Math.min(i + currentBatch, count)
    const batchPromises: Promise<void>[] = []

    let batchFailures = 0
    for (let j = i; j < batchEnd; j++) {
      const studentIdx = j
      batchPromises.push(
        (async () => {
          const s = await connectAndJoinStudent(
            ioClient,
            result,
            tracker,
            sessionCode,
            studentIdx
          )
          sockets[studentIdx] = s
          if (!s) batchFailures++
        })()
      )
    }

    await Promise.all(batchPromises)

    // Backoff: if a batch had >30% failures, halve the next batch size to
    // give the server breathing room (min 10).
    const batchSize = batchEnd - i
    if (batchSize > 0 && batchFailures / batchSize > 0.3) {
      currentBatch = Math.max(10, Math.floor(currentBatch / 2))
    }

    if (batchEnd < count) {
      await sleep(BATCH_DELAY_MS)
    }
  }

  return sockets
}

// ── Scenario: normal ─────────────────────────────────────────────────────────
async function runNormal(
  ioClient: typeof import('socket.io-client')['io'],
  params: RunParams,
  result: StressTestResult,
  tracker: MetricsTracker
): Promise<void> {
  const { sessionCode, studentCount, questionId, correctAnswer } = params

  const sockets = await connectStudentPool(
    ioClient,
    result,
    tracker,
    sessionCode,
    studentCount
  )

  // Submit votes in batches of 100 with a small random delay to simulate
  // realistic arrival distribution.
  const VOTE_BATCH = 100
  for (let i = 0; i < studentCount; i += VOTE_BATCH) {
    const batchEnd = Math.min(i + VOTE_BATCH, studentCount)
    const votePromises: Promise<void>[] = []

    for (let j = i; j < batchEnd; j++) {
      const s = sockets[j]
      if (!s || !s.connected) {
        // Already counted as `failed` in connectAndJoinStudent — don't
        // double-count here.
        continue
      }
      votePromises.push(
        (async () => {
          const choice = pickChoice(correctAnswer)
          const delay = Math.random() * 400
          await sleep(delay)
          const t0 = Date.now()
          const resp = await emitWithAck(s, 'submit-vote', {
            sessionCode,
            questionId,
            choice,
            correctAnswer: correctAnswer || undefined,
            studentId: `STRESS-${String(j + 1).padStart(5, '0')}`,
          })
          tracker.recordResponse(Date.now() - t0)
          if (resp.ok) {
            result.voted++
            result.voteDistribution[choice as keyof typeof result.voteDistribution]++
          } else {
            result.rejectedVotes++
            pushError(result, `Student ${j + 1} vote rejected: ${resp.error}`)
          }
        })()
      )
    }

    await Promise.all(votePromises)
  }

  // Disconnect in waves to avoid a thundering-herd of FIN packets.
  for (let i = 0; i < sockets.length; i += 50) {
    for (let j = i; j < Math.min(i + 50, sockets.length); j++) {
      const s = sockets[j]
      if (s) {
        try {
          s.disconnect()
        } catch {
          // ignore
        }
        tracker.trackDisconnect()
      }
    }
    await sleep(20)
  }
}

// ── Scenario: flood ──────────────────────────────────────────────────────────
// Each student tries to vote 10 times rapidly. The server's per-socket
// rate limit (1 / 500ms) + anti-double-vote should reject ~9 of the 10.
async function runFlood(
  ioClient: typeof import('socket.io-client')['io'],
  params: RunParams,
  result: StressTestResult,
  tracker: MetricsTracker
): Promise<void> {
  const { sessionCode, studentCount, questionId, correctAnswer } = params

  const sockets = await connectStudentPool(
    ioClient,
    result,
    tracker,
    sessionCode,
    studentCount
  )

  const VOTE_BATCH = 100
  for (let i = 0; i < studentCount; i += VOTE_BATCH) {
    const batchEnd = Math.min(i + VOTE_BATCH, studentCount)
    const votePromises: Promise<void>[] = []

    for (let j = i; j < batchEnd; j++) {
      const s = sockets[j]
      if (!s || !s.connected) {
        // Already counted as `failed` in connectAndJoinStudent.
        continue
      }
      votePromises.push(
        (async () => {
          // Fire 10 votes as fast as possible. The first may succeed; the
          // other 9 should be rejected by rate limit or anti-double-vote.
          const promises: Promise<{ ok: boolean; error?: string }>[] = []
          for (let k = 0; k < 10; k++) {
            const choice = pickChoice(correctAnswer)
            const t0 = Date.now()
            promises.push(
              emitWithAck(s, 'submit-vote', {
                sessionCode,
                questionId,
                choice,
                correctAnswer: correctAnswer || undefined,
                studentId: `STRESS-${String(j + 1).padStart(5, '0')}`,
              }).then((resp) => {
                tracker.recordResponse(Date.now() - t0)
                if (resp.ok) {
                  result.voted++
                  result.voteDistribution[
                    choice as keyof typeof result.voteDistribution
                  ]++
                } else {
                  result.rejectedVotes++
                }
                return resp
              })
            )
          }
          await Promise.all(promises)
        })()
      )
    }

    await Promise.all(votePromises)
  }

  disconnectAll(sockets)
  for (let i = 0; i < sockets.length; i++) tracker.trackDisconnect()
}

// ── Scenario: bad-presenter ──────────────────────────────────────────────────
// 50 malicious clients try to emit privileged presenter events WITHOUT a
// presenter key. The server should reject every attempt with
// `{ ok: false, error: 'Not authorized as presenter' }`.
async function runBadPresenter(
  ioClient: typeof import('socket.io-client')['io'],
  params: RunParams,
  result: StressTestResult,
  tracker: MetricsTracker
): Promise<void> {
  const { sessionCode, questionId, correctAnswer } = params
  const ATTACKER_COUNT = Math.min(50, params.studentCount)

  const sockets = await connectStudentPool(
    ioClient,
    result,
    tracker,
    sessionCode,
    ATTACKER_COUNT
  )

  // Each attacker tries every privileged event once, then 2 of them spam
  // reveal-answer 100 times in 1 second.
  const privilegedEvents: Array<{ event: string; payload: unknown }> = [
    {
      event: 'activate-question',
      payload: { sessionCode, questionId },
    },
    {
      event: 'reveal-answer',
      payload: { sessionCode, questionId, correctAnswer: correctAnswer || 'A' },
    },
    {
      event: 'next-question',
      payload: { sessionCode, questionId: null },
    },
    {
      event: 'end-session',
      payload: { sessionCode },
    },
    {
      event: 'toggle-voting',
      payload: { sessionCode, paused: true },
    },
    {
      event: 'session-reset',
      payload: { sessionCode },
    },
    {
      event: 'show-qr',
      payload: { sessionCode, visible: true },
    },
  ]

  const attackerPromises: Promise<void>[] = []
  for (let i = 0; i < ATTACKER_COUNT; i++) {
    const s = sockets[i]
    if (!s || !s.connected) continue
    attackerPromises.push(
      (async () => {
        // One-shot attempts on each privileged event.
        for (const item of privilegedEvents) {
          const t0 = Date.now()
          const resp = await emitWithAck(s, item.event, item.payload)
          tracker.recordResponse(Date.now() - t0)
          if (!resp.ok) {
            result.presenterBlocked++
          } else {
            // Should NEVER happen — a non-presenter should not be able to
            // run privileged commands. Record as an error.
            pushError(
              result,
              `SECURITY: attacker ${i + 1} succeeded on ${item.event}!`
            )
          }
        }
      })()
    )
  }
  await Promise.all(attackerPromises)

  // Spam test: 2 attackers each fire reveal-answer 50 times in <1 second.
  const spamAttackers = sockets.slice(0, 2).filter((s): s is SocketLike => !!s && s.connected)
  const spamPromises: Promise<void>[] = []
  for (const s of spamAttackers) {
    spamPromises.push(
      (async () => {
        const firePromises: Promise<void>[] = []
        for (let k = 0; k < 50; k++) {
          firePromises.push(
            (async () => {
              const t0 = Date.now()
              const resp = await emitWithAck(s, 'reveal-answer', {
                sessionCode,
                questionId,
                correctAnswer: correctAnswer || 'A',
              })
              tracker.recordResponse(Date.now() - t0)
              if (!resp.ok) {
                result.presenterBlocked++
              } else {
                pushError(result, 'SECURITY: spam attack succeeded on reveal-answer!')
              }
            })()
          )
        }
        await Promise.all(firePromises)
      })()
    )
  }
  await Promise.all(spamPromises)

  disconnectAll(sockets)
  for (let i = 0; i < sockets.length; i++) tracker.trackDisconnect()
}

// ── Scenario: bad-input ──────────────────────────────────────────────────────
// 100 clients send malformed payloads (invalid sessionCode, invalid choice,
// huge strings, missing fields, wrong types). Server should reject each
// gracefully without crashing.
async function runBadInput(
  ioClient: typeof import('socket.io-client')['io'],
  params: RunParams,
  result: StressTestResult,
  tracker: MetricsTracker
): Promise<void> {
  const { sessionCode, questionId, correctAnswer } = params
  const CLIENT_COUNT = Math.min(100, params.studentCount)

  const sockets = await connectStudentPool(
    ioClient,
    result,
    tracker,
    sessionCode,
    CLIENT_COUNT
  )

  // Catalog of malicious payloads. Each client sends a different subset.
  const hugeStr = 'A'.repeat(10000)
  const sqlInjection = "'; DROP TABLE sessions; --"
  const codeInjection = '<script>alert(1)</script>${process.exit()}'
  const longQuestionId = 'c' + '0'.repeat(5000)

  const badPayloads: Array<{ label: string; payload: unknown }> = [
    { label: 'invalid sessionCode (sql)', payload: { sessionCode: sqlInjection, questionId, choice: 'A', correctAnswer } },
    { label: 'invalid sessionCode (code)', payload: { sessionCode: codeInjection, questionId, choice: 'A', correctAnswer } },
    { label: 'invalid sessionCode (short)', payload: { sessionCode: 'ABC', questionId, choice: 'A', correctAnswer } },
    { label: 'invalid sessionCode (long)', payload: { sessionCode: hugeStr, questionId, choice: 'A', correctAnswer } },
    { label: 'invalid choice (X)', payload: { sessionCode, questionId, choice: 'X', correctAnswer } },
    { label: 'invalid choice (number)', payload: { sessionCode, questionId, choice: 123, correctAnswer } },
    { label: 'invalid choice (null)', payload: { sessionCode, questionId, choice: null, correctAnswer } },
    { label: 'invalid choice (empty)', payload: { sessionCode, questionId, choice: '', correctAnswer } },
    { label: 'invalid choice (huge)', payload: { sessionCode, questionId, choice: hugeStr, correctAnswer } },
    { label: 'invalid questionId (null)', payload: { sessionCode, questionId: null, choice: 'A', correctAnswer } },
    { label: 'invalid questionId (empty)', payload: { sessionCode, questionId: '', choice: 'A', correctAnswer } },
    { label: 'invalid questionId (huge)', payload: { sessionCode, questionId: longQuestionId, choice: 'A', correctAnswer } },
    { label: 'missing sessionCode', payload: { questionId, choice: 'A', correctAnswer } },
    { label: 'missing questionId', payload: { sessionCode, choice: 'A', correctAnswer } },
    { label: 'missing choice', payload: { sessionCode, questionId, correctAnswer } },
    { label: 'null payload', payload: null },
    { label: 'undefined payload', payload: undefined },
    { label: 'string payload', payload: 'not-an-object' },
    { label: 'array payload', payload: [1, 2, 3] },
    { label: 'all wrong types', payload: { sessionCode: 12345, questionId: false, choice: { evil: true } } },
  ]

  const clientPromises: Promise<void>[] = []
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const s = sockets[i]
    if (!s || !s.connected) continue
    // Each client sends 5 distinct bad payloads (cycling through the catalog).
    clientPromises.push(
      (async () => {
        for (let k = 0; k < 5; k++) {
          const entry = badPayloads[(i * 5 + k) % badPayloads.length]
          const t0 = Date.now()
          const resp = await emitWithAck(s, 'submit-vote', entry.payload)
          tracker.recordResponse(Date.now() - t0)
          if (!resp.ok) {
            result.badInputBlocked++
          } else {
            pushError(
              result,
              `SECURITY: bad-input "${entry.label}" was accepted by server!`
            )
          }
        }
      })()
    )
  }
  await Promise.all(clientPromises)

  disconnectAll(sockets)
  for (let i = 0; i < sockets.length; i++) tracker.trackDisconnect()
}

// ── Scenario: long-lived ─────────────────────────────────────────────────────
// 200 students connect, join, vote, and STAY CONNECTED for 30 seconds.
// Every 10s they attempt a re-vote (rejected by anti-double-vote). This
// exercises memory stability under sustained connection load.
async function runLongLived(
  ioClient: typeof import('socket.io-client')['io'],
  params: RunParams,
  result: StressTestResult,
  tracker: MetricsTracker
): Promise<void> {
  const { sessionCode, questionId, correctAnswer } = params
  const LONG_LIVED_COUNT = Math.min(200, params.studentCount)

  const sockets = await connectStudentPool(
    ioClient,
    result,
    tracker,
    sessionCode,
    LONG_LIVED_COUNT
  )

  // Phase 1: each student votes once.
  const votePromises: Promise<void>[] = []
  for (let j = 0; j < LONG_LIVED_COUNT; j++) {
    const s = sockets[j]
    if (!s || !s.connected) continue
    votePromises.push(
      (async () => {
        const choice = pickChoice(correctAnswer)
        const t0 = Date.now()
        const resp = await emitWithAck(s, 'submit-vote', {
          sessionCode,
          questionId,
          choice,
          correctAnswer: correctAnswer || undefined,
          studentId: `STRESS-${String(j + 1).padStart(5, '0')}`,
        })
        tracker.recordResponse(Date.now() - t0)
        if (resp.ok) {
          result.voted++
          result.voteDistribution[choice as keyof typeof result.voteDistribution]++
        } else {
          result.rejectedVotes++
        }
      })()
    )
  }
  await Promise.all(votePromises)

  // Phase 2: stay connected, re-vote every 10s (gets rejected).
  const start = Date.now()
  while (Date.now() - start < LONG_LIVED_DURATION_MS) {
    await sleep(10_000)
    if (Date.now() - start >= LONG_LIVED_DURATION_MS) break
    const revotePromises: Promise<void>[] = []
    for (let j = 0; j < LONG_LIVED_COUNT; j++) {
      const s = sockets[j]
      if (!s || !s.connected) continue
      revotePromises.push(
        (async () => {
          const choice = pickChoice(correctAnswer)
          const t0 = Date.now()
          const resp = await emitWithAck(s, 'submit-vote', {
            sessionCode,
            questionId,
            choice,
            correctAnswer: correctAnswer || undefined,
            studentId: `STRESS-${String(j + 1).padStart(5, '0')}`,
          })
          tracker.recordResponse(Date.now() - t0)
          if (resp.ok) {
            // Should NOT happen (anti-double-vote) — flag it.
            pushError(result, `SECURITY: long-lived socket ${j + 1} voted twice!`)
          } else {
            result.rejectedVotes++
          }
        })()
      )
    }
    await Promise.all(revotePromises)
  }

  disconnectAll(sockets)
  for (let i = 0; i < sockets.length; i++) tracker.trackDisconnect()
}

// ── Scenario: mixed ──────────────────────────────────────────────────────────
// Combine: (studentCount - 70) normal students + 50 bad-presenter attackers
// + 20 bad-input clients, all running concurrently.
async function runMixed(
  ioClient: typeof import('socket.io-client')['io'],
  params: RunParams,
  result: StressTestResult,
  tracker: MetricsTracker
): Promise<void> {
  const total = params.studentCount
  const attackerCount = Math.min(50, Math.max(5, Math.floor(total * 0.05)))
  const badInputCount = Math.min(20, Math.max(5, Math.floor(total * 0.02)))
  const normalCount = Math.max(0, total - attackerCount - badInputCount)

  // Build sub-results for each scenario so we can aggregate cleanly.
  const normalResult = makeResult({ ...params, studentCount: normalCount })
  const attackerResult = makeResult({ ...params, studentCount: attackerCount })
  const badInputResult = makeResult({ ...params, studentCount: badInputCount })

  // Run all three concurrently.
  await Promise.all([
    runNormal(ioClient, { ...params, studentCount: normalCount }, normalResult, tracker),
    runBadPresenter(ioClient, { ...params, studentCount: attackerCount }, attackerResult, tracker),
    runBadInput(ioClient, { ...params, studentCount: badInputCount }, badInputResult, tracker),
  ])

  // Aggregate into the main result.
  result.totalStudents = total
  result.connected = normalResult.connected + attackerResult.connected + badInputResult.connected
  result.voted = normalResult.voted + attackerResult.voted + badInputResult.voted
  result.failed = normalResult.failed + attackerResult.failed + badInputResult.failed
  for (const k of altLabels) {
    result.voteDistribution[k] =
      normalResult.voteDistribution[k] +
      attackerResult.voteDistribution[k] +
      badInputResult.voteDistribution[k]
  }
  result.rejectedVotes =
    normalResult.rejectedVotes + attackerResult.rejectedVotes + badInputResult.rejectedVotes
  result.presenterBlocked = attackerResult.presenterBlocked
  result.badInputBlocked = badInputResult.badInputBlocked
  // Aggregate errors (cap at 10).
  for (const e of [...normalResult.errors, ...attackerResult.errors, ...badInputResult.errors]) {
    pushError(result, e)
  }
}

// ── Main runner with overall timeout safety ──────────────────────────────────
async function runStressTest(params: RunParams): Promise<StressTestResult> {
  const { io: ioClient } = await import('socket.io-client')
  const result = makeResult(params)
  const tracker = makeTracker()

  const startTime = Date.now()
  let timedOut = false

  // Overall timeout safety: if the test runs past TEST_TIMEOUT_MS, abort
  // and return partial results.
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      timedOut = true
      pushError(result, `Test aborted: exceeded ${TEST_TIMEOUT_MS / 1000}s timeout`)
      resolve()
    }, TEST_TIMEOUT_MS)
  })

  const runPromise = (async () => {
    switch (params.scenario) {
      case 'normal':
        await runNormal(ioClient, params, result, tracker)
        break
      case 'flood':
        await runFlood(ioClient, params, result, tracker)
        break
      case 'bad-presenter':
        await runBadPresenter(ioClient, params, result, tracker)
        break
      case 'bad-input':
        await runBadInput(ioClient, params, result, tracker)
        break
      case 'long-lived':
        await runLongLived(ioClient, params, result, tracker)
        break
      case 'mixed':
        await runMixed(ioClient, params, result, tracker)
        break
    }
  })()

  // Wait for either completion or timeout. If the timeout fires first,
  // we still resolve (the runPromise may keep going in the background
  // but the result object is already populated).
  await Promise.race([runPromise, timeoutPromise])

  result.durationMs = Date.now() - startTime
  result.votesPerSecond =
    result.durationMs > 0 ? Math.round((result.voted / result.durationMs) * 1000) : 0
  result.peakConcurrentConnections = tracker.peakConcurrent
  result.avgResponseTimeMs = avgResponseTime(tracker)
  result.memoryRssMb = getMemMb()
  result.timedOut = timedOut

  return result
}

// ── HTTP server ──────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // CORS (the admin UI calls this via /api/stress-test, but direct calls
  // from other origins are also supported).
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
      // Body cap: 1 MB (matches the API route's cap).
      if (body.length > 1_000_000) {
        res.writeHead(413, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Request body too large (max 1 MB).' }))
        return
      }
    }

    try {
      const params = JSON.parse(body || '{}')
      if (!params.sessionCode || !params.questionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'sessionCode and questionId are required' }))
        return
      }

      const scenario: Scenario = VALID_SCENARIOS.includes(params.scenario)
        ? params.scenario
        : 'normal'

      const studentCount = Math.min(
        MAX_STUDENTS,
        Math.max(1, Number(params.studentCount) || 1000)
      )

      const dryRun = params.dryRun === true

      // Dry run: validate params and return without actually connecting.
      if (dryRun) {
        const dryResult = makeResult({
          sessionCode: params.sessionCode,
          questionId: params.questionId,
          studentCount,
          scenario,
          correctAnswer: params.correctAnswer,
          dryRun: true,
        })
        dryResult.durationMs = 0
        dryResult.memoryRssMb = getMemMb()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(dryResult))
        return
      }

      const result = await runStressTest({
        sessionCode: String(params.sessionCode),
        studentCount,
        questionId: String(params.questionId),
        correctAnswer: params.correctAnswer,
        scenario,
        dryRun: false,
      })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown' }))
    }
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, port: PORT, memoryRssMb: getMemMb() }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`Stress Test service running on port ${PORT}`)
  console.log(
    `  Scenarios: ${VALID_SCENARIOS.join(', ')}`
  )
  console.log(`  Max students: ${MAX_STUDENTS}, Timeout: ${TEST_TIMEOUT_MS / 1000}s`)
})

// Graceful shutdown.
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  server.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  server.close(() => process.exit(0))
})
