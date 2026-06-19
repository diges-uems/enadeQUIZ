import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 10000,
})

// ── Configuration ───────────────────────────────────────────────────────────
const PRESENTER_KEY = process.env.PRESENTER_KEY || 'presenter-default-key-2025'
const MAX_PARTICIPANTS_PER_SESSION = 5000
const VOTE_RATE_LIMIT_MS = 500 // min 500ms between votes per socket
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── Validation helpers ──────────────────────────────────────────────────────
const SESSION_CODE_RE = /^[A-Z0-9]{6}$/i

function isValidSessionCode(code: unknown): code is string {
  return typeof code === 'string' && SESSION_CODE_RE.test(code)
}

function isValidQuestionId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 200
}

function isValidChoice(c: unknown): c is 'A' | 'B' | 'C' | 'D' | 'E' {
  return typeof c === 'string' && ['A', 'B', 'C', 'D', 'E'].includes(c)
}

// In-memory state for real-time features
// Map of sessionCode -> Set of socket IDs (participants)
const sessionParticipants = new Map<string, Set<string>>()
// Map of sessionCode -> total unique participants ever connected (only increments, never decrements)
const sessionTotalParticipants = new Map<string, number>()
// Map of sessionCode -> current question ID
const sessionCurrentQuestion = new Map<string, string | null>()
// Map of sessionCode -> voting paused state
const sessionVotingPaused = new Map<string, boolean>()
// Map of `${sessionCode}:${questionId}` -> vote counts
const sessionVoteCounts = new Map<string, { A: number; B: number; C: number; D: number; E: number; total: number }>()

// ── Student tracking ────────────────────────────────────────────────────────
// Map of socket ID -> student info
const studentBySocket = new Map<string, { name: string; rgm: string; sessionCode: string }>()

// ── Score tracking ──────────────────────────────────────────────────────────
// Map of sessionCode -> Map of studentId (rgm) -> score info
interface StudentScore {
  name: string
  rgm: string
  score: number
  answers: number
  corrects: number
}
const sessionScores = new Map<string, Map<string, StudentScore>>()

// ── Track which question each socket has already voted on (anti-double-vote) ─
const socketVotedQuestions = new Map<string, Set<string>>()

// ── Reverse map: socket ID -> session code (for O(1) disconnect lookup) ─────
const socketSession = new Map<string, string>()

// ── Per-socket last vote timestamp (rate-limit safety net) ──────────────────
const socketLastVoteAt = new Map<string, number>()

// ── Track which sockets are presenters for the session ──────────────────────
const socketIsPresenter = new Map<string, boolean>()

// ── Grace period for disconnects (prevents count fluctuation) ───────────────
// When a socket disconnects, we wait GRACE_PERIOD_MS before actually removing
// them from the participant count. If they reconnect within that window, no
// count change happens. This prevents the participant number from bouncing
// when phones briefly lose connection.
const GRACE_PERIOD_MS = 30_000 // 30 seconds
const pendingRemovals = new Map<string, { sessionCode: string; timer: ReturnType<typeof setTimeout> }>()

// ── Vote batching: accumulate votes and broadcast at intervals ──────────────
const pendingVoteBroadcasts = new Set<string>() // session codes that need vote broadcast
const VOTE_BATCH_INTERVAL = 150 // ms — broadcast vote results at most every 150ms

setInterval(() => {
  for (const sessionCode of pendingVoteBroadcasts) {
    const questionId = sessionCurrentQuestion.get(sessionCode)
    if (questionId) {
      const key = getVoteKey(sessionCode, questionId)
      const results = sessionVoteCounts.get(key)
      if (results) {
        io.to(`session:${sessionCode}`).emit('vote-results', { ...results })
      }
    }
  }
  pendingVoteBroadcasts.clear()
}, VOTE_BATCH_INTERVAL)

// ── Participant count batching ──────────────────────────────────────────────
const pendingParticipantBroadcasts = new Set<string>() // session codes that need participant count broadcast
const PARTICIPANT_BATCH_INTERVAL = 200 // ms

setInterval(() => {
  for (const sessionCode of pendingParticipantBroadcasts) {
    const count = sessionParticipants.get(sessionCode)?.size || 0
    const total = sessionTotalParticipants.get(sessionCode) || 0
    io.to(`session:${sessionCode}`).emit('participant-count', { live: count, total })
  }
  pendingParticipantBroadcasts.clear()
}, PARTICIPANT_BATCH_INTERVAL)

// ── Periodic cleanup: remove empty sessions to prevent memory leaks ─────────
setInterval(() => {
  const now = Date.now()
  for (const [sessionCode, participants] of sessionParticipants.entries()) {
    if (participants.size === 0) {
      // No live participants — purge all related state
      sessionParticipants.delete(sessionCode)
      sessionTotalParticipants.delete(sessionCode)
      sessionCurrentQuestion.delete(sessionCode)
      sessionVotingPaused.delete(sessionCode)
      sessionScores.delete(sessionCode)
      // Vote counts keyed by `${sessionCode}:${questionId}`
      for (const key of Array.from(sessionVoteCounts.keys())) {
        if (key.startsWith(`${sessionCode}:`)) {
          sessionVoteCounts.delete(key)
        }
      }
      pendingVoteBroadcasts.delete(sessionCode)
      pendingParticipantBroadcasts.delete(sessionCode)
    }
  }
  // Bound log so we know the janitor ran.
  const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
  console.log(`[janitor ${new Date(now).toISOString()}] sessions=${sessionParticipants.size} rss=${memMb}MB`)
}, CLEANUP_INTERVAL_MS)

function getVoteKey(sessionCode: string, questionId: string) {
  return `${sessionCode}:${questionId}`
}

function initVoteCounts(sessionCode: string, questionId: string) {
  const key = getVoteKey(sessionCode, questionId)
  if (!sessionVoteCounts.has(key)) {
    sessionVoteCounts.set(key, { A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
  }
  return sessionVoteCounts.get(key)!
}

function getRanking(sessionCode: string): StudentScore[] {
  const scoreMap = sessionScores.get(sessionCode)
  if (!scoreMap) return []
  return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score)
}

// Ack helpers — every presenter-emitted event acknowledges back to the sender.
type Ack = ((resp: { ok: boolean; error?: string }) => void) | undefined

io.on('connection', (socket) => {
  // Cancel any pending removal for this socket (reconnection within grace period)
  const pendingRemoval = pendingRemovals.get(socket.id)
  if (pendingRemoval) {
    clearTimeout(pendingRemoval.timer)
    pendingRemovals.delete(socket.id)
    // Socket is already in the participant set, no count change needed
  }

  // ── Join a session room ─────────────────────────────────────────────────
  socket.on('join-session', (data: {
    sessionCode: string
    role: 'presenter' | 'student'
    name?: string
    rgm?: string
    presenterKey?: string
  }) => {
    // Basic input validation
    if (!data || !isValidSessionCode(data.sessionCode)) {
      socket.emit('join-rejected', { reason: 'Invalid session code' })
      return
    }

    const { sessionCode, role, name, rgm } = data

    // Presenter authentication: presenters must supply the correct key.
    if (role === 'presenter') {
      if (data.presenterKey !== PRESENTER_KEY) {
        // Don't mark as presenter — treat as a regular connection so they can
        // still listen to events but cannot emit privileged commands.
        socket.emit('presenter-rejected', { reason: 'Invalid presenter key' })
        // Still let them join the room so they can view the presentation stream.
        socket.join(`session:${sessionCode}`)
        socketSession.set(socket.id, sessionCode)
        // Send current state for the listener.
        const participantCount = sessionParticipants.get(sessionCode)?.size || 0
        const totalParticipants = sessionTotalParticipants.get(sessionCode) || 0
        socket.emit('session-state', {
          participantCount,
          totalParticipants,
          currentQuestionId: sessionCurrentQuestion.get(sessionCode) || null,
          votingPaused: sessionVotingPaused.get(sessionCode) || false,
        })
        return
      }
      // Key matches — mark this socket as an authenticated presenter.
      socketIsPresenter.set(socket.id, true)
      socket.join(`session:${sessionCode}`)
      socketSession.set(socket.id, sessionCode)
      // Send current state to the newly joined presenter.
      const participantCount = sessionParticipants.get(sessionCode)?.size || 0
      const totalParticipants = sessionTotalParticipants.get(sessionCode) || 0
      socket.emit('session-state', {
        participantCount,
        totalParticipants,
        currentQuestionId: sessionCurrentQuestion.get(sessionCode) || null,
        votingPaused: sessionVotingPaused.get(sessionCode) || false,
      })
      return
    }

    // Student join path
    socket.join(`session:${sessionCode}`)
    socketSession.set(socket.id, sessionCode)

    if (!sessionParticipants.has(sessionCode)) {
      sessionParticipants.set(sessionCode, new Set())
    }
    const participants = sessionParticipants.get(sessionCode)!

    // Cap participants per session to prevent runaway memory usage.
    if (participants.size >= MAX_PARTICIPANTS_PER_SESSION) {
      socket.emit('session-full')
      socket.leave(`session:${sessionCode}`)
      socketSession.delete(socket.id)
      return
    }

    const isNewStudent = !participants.has(socket.id)
    participants.add(socket.id)

    // Track total unique participants (only increments)
    if (isNewStudent) {
      const currentTotal = sessionTotalParticipants.get(sessionCode) || 0
      sessionTotalParticipants.set(sessionCode, currentTotal + 1)
    }

    // If name and rgm provided, associate with socket
    if (name && rgm) {
      studentBySocket.set(socket.id, { name, rgm, sessionCode })
    }

    // Send current state to the newly joined client
    const participantCount = participants.size
    const totalParticipants = sessionTotalParticipants.get(sessionCode) || 0
    socket.emit('session-state', {
      participantCount,
      totalParticipants,
      currentQuestionId: sessionCurrentQuestion.get(sessionCode) || null,
      votingPaused: sessionVotingPaused.get(sessionCode) || false,
    })

    // Queue participant count broadcast (batched)
    pendingParticipantBroadcasts.add(sessionCode)
  })

  // ── Helper: enforce presenter-only commands ─────────────────────────────
  const requirePresenter = (cb: Ack, label: string): boolean => {
    if (!socketIsPresenter.get(socket.id)) {
      console.warn(`[security] non-presenter socket ${socket.id} attempted ${label}`)
      if (cb) cb({ ok: false, error: 'Not authorized as presenter' })
      return false
    }
    return true
  }

  // Register student info
  socket.on('register-student', (data: { sessionCode: string; name: string; rgm: string }) => {
    if (!data || !isValidSessionCode(data.sessionCode)) return
    const { sessionCode, name, rgm } = data
    if (typeof name !== 'string' || typeof rgm !== 'string') return
    studentBySocket.set(socket.id, { name, rgm, sessionCode })

    // Initialize score tracking if not exists
    if (!sessionScores.has(sessionCode)) {
      sessionScores.set(sessionCode, new Map())
    }
    const scoreMap = sessionScores.get(sessionCode)!
    if (!scoreMap.has(rgm)) {
      scoreMap.set(rgm, { name, rgm, score: 0, answers: 0, corrects: 0 })
    }

    socket.emit('student-registered', { success: true })
  })

  // Leave a session
  socket.on('leave-session', (data: { sessionCode: string }) => {
    if (!data || !isValidSessionCode(data.sessionCode)) return
    const { sessionCode } = data
    socket.leave(`session:${sessionCode}`)

    const participants = sessionParticipants.get(sessionCode)
    if (participants) {
      participants.delete(socket.id)
      pendingParticipantBroadcasts.add(sessionCode)
    }
    socketSession.delete(socket.id)
    socketIsPresenter.delete(socket.id)
  })

  // ── Presenter activates a question ──────────────────────────────────────
  socket.on('activate-question', (data: { sessionCode: string; questionId: string }, cb: Ack) => {
    if (!requirePresenter(cb, 'activate-question')) return
    if (!data || !isValidSessionCode(data.sessionCode) || !isValidQuestionId(data.questionId)) {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode, questionId } = data
    sessionCurrentQuestion.set(sessionCode, questionId)
    sessionVotingPaused.set(sessionCode, false)

    // Initialize vote counts for this question
    initVoteCounts(sessionCode, questionId)

    // Notify all clients in the session (immediate — this is rare)
    io.to(`session:${sessionCode}`).emit('question-activated', {
      questionId,
      votingPaused: false,
    })

    // Send current results (likely zero) — immediate
    const key = getVoteKey(sessionCode, questionId)
    const results = sessionVoteCounts.get(key)
    io.to(`session:${sessionCode}`).emit('vote-results', results)

    if (cb) cb({ ok: true })
  })

  // ── Student submits a vote ──────────────────────────────────────────────
  // Note: `cb` is an OPTIONAL ack callback (Task 5-c). Old clients that
  // listen for `vote-accepted` / `vote-rejected` events still work; new
  // clients (e.g. the stress test) may pass an ack callback to measure
  // response time and detect rejections synchronously.
  socket.on('submit-vote', (data: { sessionCode: string; questionId: string; choice: 'A' | 'B' | 'C' | 'D' | 'E'; correctAnswer?: string; studentId?: string }, cb?: Ack) => {
    if (!data || !isValidSessionCode(data.sessionCode) || !isValidQuestionId(data.questionId)) {
      socket.emit('vote-rejected', { reason: 'Invalid input' })
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    if (!isValidChoice(data.choice)) {
      socket.emit('vote-rejected', { reason: 'Invalid choice' })
      if (cb) cb({ ok: false, error: 'Invalid choice' })
      return
    }
    const { sessionCode, questionId, choice, correctAnswer, studentId } = data

    // Rate-limit safety net: 1 vote per 500ms per socket
    const now = Date.now()
    const last = socketLastVoteAt.get(socket.id) || 0
    if (now - last < VOTE_RATE_LIMIT_MS) {
      socket.emit('vote-rejected', { reason: 'Too many votes — please slow down' })
      if (cb) cb({ ok: false, error: 'Too many votes — please slow down' })
      return
    }
    socketLastVoteAt.set(socket.id, now)

    // Check if voting is paused
    if (sessionVotingPaused.get(sessionCode)) {
      socket.emit('vote-rejected', { reason: 'Voting is paused' })
      if (cb) cb({ ok: false, error: 'Voting is paused' })
      return
    }

    // Check if this question is the active one
    const currentQ = sessionCurrentQuestion.get(sessionCode)
    if (currentQ !== questionId) {
      socket.emit('vote-rejected', { reason: 'This question is not active' })
      if (cb) cb({ ok: false, error: 'This question is not active' })
      return
    }

    // Anti-double-vote: check if this socket already voted on this question
    if (!socketVotedQuestions.has(socket.id)) {
      socketVotedQuestions.set(socket.id, new Set())
    }
    const votedSet = socketVotedQuestions.get(socket.id)!
    if (votedSet.has(questionId)) {
      socket.emit('vote-rejected', { reason: 'You already voted on this question' })
      if (cb) cb({ ok: false, error: 'You already voted on this question' })
      return
    }
    votedSet.add(questionId)

    // Update vote counts
    const counts = initVoteCounts(sessionCode, questionId)
    counts[choice]++
    counts.total++

    // Track score for student
    if (studentId) {
      if (!sessionScores.has(sessionCode)) {
        sessionScores.set(sessionCode, new Map())
      }
      const scoreMap = sessionScores.get(sessionCode)!
      if (!scoreMap.has(studentId)) {
        // Try to get name from socket mapping
        const socketInfo = studentBySocket.get(socket.id)
        scoreMap.set(studentId, {
          name: socketInfo?.name || 'Unknown',
          rgm: studentId,
          score: 0,
          answers: 0,
          corrects: 0,
        })
      }
      const studentScore = scoreMap.get(studentId)!
      studentScore.answers++
      if (correctAnswer && choice === correctAnswer) {
        studentScore.score++
        studentScore.corrects++
      }
    }

    // Acknowledge the vote to the student (event-based — legacy clients)
    socket.emit('vote-accepted', { choice, questionId })
    // Acknowledge via callback (new clients — stress test uses this)
    if (cb) cb({ ok: true })

    // Queue batched vote results broadcast instead of immediate
    pendingVoteBroadcasts.add(sessionCode)
  })

  // ── Presenter pauses/resumes voting ─────────────────────────────────────
  socket.on('toggle-voting', (data: { sessionCode: string; paused: boolean }, cb: Ack) => {
    if (!requirePresenter(cb, 'toggle-voting')) return
    if (!data || !isValidSessionCode(data.sessionCode) || typeof data.paused !== 'boolean') {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode, paused } = data
    sessionVotingPaused.set(sessionCode, paused)

    io.to(`session:${sessionCode}`).emit('voting-toggled', { paused })

    if (cb) cb({ ok: true })
  })

  // ── Presenter reveals the answer ────────────────────────────────────────
  socket.on('reveal-answer', (data: { sessionCode: string; questionId: string; correctAnswer: string }, cb: Ack) => {
    if (!requirePresenter(cb, 'reveal-answer')) return
    if (!data || !isValidSessionCode(data.sessionCode) || !isValidQuestionId(data.questionId) || typeof data.correctAnswer !== 'string') {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode, questionId, correctAnswer } = data

    // Broadcast the answer with ranking (immediate — rare event)
    const ranking = getRanking(sessionCode)
    io.to(`session:${sessionCode}`).emit('answer-revealed', {
      questionId,
      correctAnswer,
      ranking,
    })

    // Also immediately broadcast final vote results for this question
    const key = getVoteKey(sessionCode, questionId)
    const results = sessionVoteCounts.get(key)
    if (results) {
      io.to(`session:${sessionCode}`).emit('vote-results', { ...results })
    }
    pendingVoteBroadcasts.delete(sessionCode)

    if (cb) cb({ ok: true })
  })

  // Get ranking for a session
  socket.on('get-ranking', (data: { sessionCode: string }) => {
    if (!data || !isValidSessionCode(data.sessionCode)) return
    const ranking = getRanking(data.sessionCode)
    socket.emit('ranking-data', ranking)
  })

  // ── Presenter moves to next question ────────────────────────────────────
  socket.on('next-question', (data: { sessionCode: string; questionId: string | null }, cb: Ack) => {
    if (!requirePresenter(cb, 'next-question')) return
    if (!data || !isValidSessionCode(data.sessionCode)) {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode, questionId } = data
    // questionId may be null (end of session) — validate when present.
    if (questionId !== null && !isValidQuestionId(questionId)) {
      if (cb) cb({ ok: false, error: 'Invalid questionId' })
      return
    }
    sessionCurrentQuestion.set(sessionCode, questionId || null)

    if (questionId) {
      sessionVotingPaused.set(sessionCode, false)
      initVoteCounts(sessionCode, questionId)

      io.to(`session:${sessionCode}`).emit('question-activated', {
        questionId,
        votingPaused: false,
      })

      const key = getVoteKey(sessionCode, questionId)
      const results = sessionVoteCounts.get(key)
      io.to(`session:${sessionCode}`).emit('vote-results', results)
    } else {
      io.to(`session:${sessionCode}`).emit('session-finished')
    }

    if (cb) cb({ ok: true })
  })

  // ── Presenter ends the session ──────────────────────────────────────────
  socket.on('end-session', (data: { sessionCode: string }, cb: Ack) => {
    if (!requirePresenter(cb, 'end-session')) return
    if (!data || !isValidSessionCode(data.sessionCode)) {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode } = data
    sessionCurrentQuestion.delete(sessionCode)
    sessionVotingPaused.delete(sessionCode)

    io.to(`session:${sessionCode}`).emit('session-finished')

    if (cb) cb({ ok: true })
  })

  // ── Presenter resets the session ────────────────────────────────────────
  socket.on('session-reset', (data: { sessionCode: string }, cb: Ack) => {
    if (!requirePresenter(cb, 'session-reset')) return
    if (!data || !isValidSessionCode(data.sessionCode)) {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode } = data

    // Clear all in-memory state for this session
    sessionCurrentQuestion.set(sessionCode, null)
    sessionVotingPaused.delete(sessionCode)
    sessionScores.delete(sessionCode)
    sessionTotalParticipants.delete(sessionCode)

    // Clear all vote counts for this session
    for (const key of sessionVoteCounts.keys()) {
      if (key.startsWith(`${sessionCode}:`)) {
        sessionVoteCounts.delete(key)
      }
    }

    // Clear voted questions for all sockets in this session
    const participants = sessionParticipants.get(sessionCode)
    if (participants) {
      for (const socketId of participants) {
        socketVotedQuestions.delete(socketId)
        socketLastVoteAt.delete(socketId)
      }
    }

    // Broadcast reset to all clients in the session
    io.to(`session:${sessionCode}`).emit('session-reset', {
      participantCount: participants?.size || 0,
    })

    if (cb) cb({ ok: true })
  })

  // ── Toggle QR Code display on presentation screen ───────────────────────
  socket.on('show-qr', (data: { sessionCode: string; visible: boolean }, cb: Ack) => {
    if (!requirePresenter(cb, 'show-qr')) return
    if (!data || !isValidSessionCode(data.sessionCode) || typeof data.visible !== 'boolean') {
      if (cb) cb({ ok: false, error: 'Invalid input' })
      return
    }
    const { sessionCode, visible } = data
    io.to(`session:${sessionCode}`).emit('show-qr', { visible })

    if (cb) cb({ ok: true })
  })

  // Handle disconnect — with grace period to prevent count fluctuation
  socket.on('disconnect', () => {
    const sessionCode = socketSession.get(socket.id)

    if (sessionCode) {
      // Don't remove immediately — schedule removal after grace period
      // This prevents the participant count from dropping when a phone
      // briefly loses connection (screen off, network hiccup, etc.)
      const timer = setTimeout(() => {
        const participants = sessionParticipants.get(sessionCode)
        if (participants) {
          participants.delete(socket.id)
          pendingParticipantBroadcasts.add(sessionCode)
        }
        pendingRemovals.delete(socket.id)
      }, GRACE_PERIOD_MS)

      pendingRemovals.set(socket.id, { sessionCode, timer })

      // Clean up socket-based maps immediately (these don't affect count)
      socketSession.delete(socket.id)
    }

    studentBySocket.delete(socket.id)
    socketVotedQuestions.delete(socket.id)
    socketLastVoteAt.delete(socket.id)
    socketIsPresenter.delete(socket.id)
  })

  socket.on('error', () => {
    // Silently handle socket errors to prevent crashes
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`ENADE Quiz real-time server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
